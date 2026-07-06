import { AppError } from '@common/utils/app-error';
import { logger } from '@common/utils/logger';
import { writeAuditLog } from '@common/audit/audit.service';
import { publishFarmEvent } from '@redis/redis.service';
import { enqueueAlertNotification } from '@notifications/notification.service';

import { alertRepository } from '@alerts/alerts.repository';
import type { AlertQueryDto } from '@alerts/alerts.schemas';
import type {
  AlertDetail,
  AlertResult,
  AlertSummary,
  PaginatedAlerts,
} from '@alerts/alerts.types';

/** Contexto de auditoría de la petición HTTP (IP + user agent). */
export interface RequestAudit {
  ipAddress?: string | null;
  userAgent?: string | null;
}

class AlertService {

  // ── Creación desde el motor de reglas ──────────────────────────────────────

  /**
   * Persiste los disparos del AlertEngine para un animal. Por cada resultado:
   *   1. Deduplica: si ya hay una alerta ACTIVA (no cerrada) del mismo animal+regla,
   *      la omite (la condición sigue vigente, no se abre otra).
   *   2. Crea la alerta + acción CREATED.
   *   3. Emite el evento WS alert:new a la finca.
   *   4. Encola la notificación (email/SMS según prioridad).
   *
   * Devuelve las alertas efectivamente creadas.
   */
  async createFromResults(
    farmId:   string,
    animalId: string,
    results:  AlertResult[],
  ): Promise<AlertSummary[]> {
    const created: AlertSummary[] = [];

    for (const result of results) {
      const existing = await alertRepository.findActiveByAnimalRule(animalId, result.ruleId);
      if (existing) {
        logger.debug('Alert: deduplicada (ya existe activa)', { animalId, ruleId: result.ruleId });
        continue;
      }

      const alert = await alertRepository.createWithAction({
        farmId,
        animalId,
        ruleId:      result.ruleId,
        priority:    result.priority,
        title:       result.title,
        description: result.description,
        geofenceId:  result.geofenceId ?? null,
        metadata:    result.metadata,
      });

      await this.emitAlertNew(farmId, alert);
      await enqueueAlertNotification({
        alertId:     alert.id,
        farmId,
        animalId,
        ruleId:      alert.ruleId,
        priority:    alert.priority,
        title:       alert.title,
        description: result.description,
      });

      created.push(alert);
      logger.info('Alert: creada', { alertId: alert.id, ruleId: alert.ruleId, priority: alert.priority, animalId, farmId });
    }

    return created;
  }

  // ── Consulta ───────────────────────────────────────────────────────────────

  async findAll(farmId: string, query: AlertQueryDto): Promise<PaginatedAlerts> {
    return alertRepository.findAll(farmId, query);
  }

  async findById(id: string, farmId: string): Promise<AlertDetail> {
    const alert = await alertRepository.findById(id, farmId);
    if (!alert) throw new AppError(404, 'NOT_FOUND', 'Alerta no encontrada');
    return alert;
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────

  async acknowledge(id: string, farmId: string, userId: string, audit: RequestAudit): Promise<AlertSummary> {
    const alert = await this.loadOpenForTransition(id, farmId, 'reconocer');

    const updated = await alertRepository.transition(
      id, farmId,
      { status: 'ACKNOWLEDGED' },
      { action: 'ACKNOWLEDGED', userId },
    );

    await this.afterTransition(farmId, updated, userId, 'ALERT_ACKNOWLEDGED', alert.status, audit);
    return updated;
  }

  async assign(
    id: string, farmId: string, userId: string, assigneeId: string, audit: RequestAudit,
  ): Promise<AlertSummary> {
    const alert = await this.loadOpenForTransition(id, farmId, 'asignar');

    const updated = await alertRepository.transition(
      id, farmId,
      { status: 'ASSIGNED', assignee: { connect: { id: assigneeId } } },
      { action: 'ASSIGNED', userId, note: `Asignada a ${assigneeId}` },
    );

    await this.afterTransition(farmId, updated, userId, 'ALERT_ASSIGNED', alert.status, audit);
    return updated;
  }

  async close(
    id: string, farmId: string, userId: string, resolution: string, audit: RequestAudit,
  ): Promise<AlertSummary> {
    const alert = await this.loadOpenForTransition(id, farmId, 'cerrar');

    const closedAt = new Date();
    const responseMs = closedAt.getTime() - alert.openedAt.getTime();

    const updated = await alertRepository.transition(
      id, farmId,
      { status: 'CLOSED', closedAt, responseMs, resolution },
      { action: 'CLOSED', userId, note: resolution },
    );

    await this.afterTransition(farmId, updated, userId, 'ALERT_CLOSED', alert.status, audit);
    return updated;
  }

  // ── Helpers privados ─────────────────────────────────────────────────────────

  /** Carga la alerta y valida que no esté ya cerrada (transición inválida). */
  private async loadOpenForTransition(id: string, farmId: string, verbo: string): Promise<AlertDetail> {
    const alert = await alertRepository.findById(id, farmId);
    if (!alert) throw new AppError(404, 'NOT_FOUND', 'Alerta no encontrada');
    if (alert.status === 'CLOSED') {
      throw new AppError(409, 'CONFLICT', `No se puede ${verbo} una alerta ya cerrada`);
    }
    return alert;
  }

  /** Emite alert:updated + audita la transición. */
  private async afterTransition(
    farmId:    string,
    updated:   AlertSummary,
    userId:    string,
    auditAction: string,
    prevStatus: string,
    audit:     RequestAudit,
  ): Promise<void> {
    await publishFarmEvent(farmId, {
      event: 'alert:updated',
      payload: {
        alertId:   updated.id,
        status:    updated.status,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      },
    });

    await writeAuditLog({
      userId,
      farmId,
      action:     auditAction,
      entityType: 'Alert',
      entityId:   updated.id,
      oldValues:  { status: prevStatus },
      newValues:  { status: updated.status, assigneeId: updated.assigneeId },
      ipAddress:  audit.ipAddress ?? null,
      userAgent:  audit.userAgent ?? null,
    });
  }

  /** Emite el evento WS alert:new (IDD §7.2). */
  private async emitAlertNew(farmId: string, alert: AlertSummary): Promise<void> {
    await publishFarmEvent(farmId, {
      event: 'alert:new',
      payload: {
        alertId:  alert.id,
        priority: alert.priority,
        ruleId:   alert.ruleId,
        animalId: alert.animalId,
        title:    alert.title,
      },
    });
  }
}

export const alertService = new AlertService();
export { AlertService };
