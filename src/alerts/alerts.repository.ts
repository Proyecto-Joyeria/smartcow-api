import { Prisma, type AlertStatus } from '@prisma/client';

import { prisma } from '@prisma/prisma.service';
import type {
  AlertDetail,
  AlertSummary,
  CreateAlertInput,
  PaginatedAlerts,
} from '@alerts/alerts.types';
import type { AlertQueryDto } from '@alerts/alerts.schemas';

// ── Selects ──────────────────────────────────────────────────────────────────

const ALERT_SUMMARY_SELECT = {
  id:         true,
  ruleId:     true,
  priority:   true,
  status:     true,
  title:      true,
  animalId:   true,
  geofenceId: true,
  assigneeId: true,
  openedAt:   true,
  closedAt:   true,
} satisfies Prisma.AlertSelect;

const ALERT_DETAIL_SELECT = {
  ...ALERT_SUMMARY_SELECT,
  farmId:      true,
  description: true,
  metadata:    true,
  resolution:  true,
  responseMs:  true,
  actions: {
    select: { action: true, userId: true, note: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.AlertSelect;

type RawSummary = Prisma.AlertGetPayload<{ select: typeof ALERT_SUMMARY_SELECT }>;
type RawDetail  = Prisma.AlertGetPayload<{ select: typeof ALERT_DETAIL_SELECT }>;

function mapSummary(r: RawSummary): AlertSummary {
  return {
    id:         r.id,
    ruleId:     r.ruleId,
    priority:   r.priority,
    status:     r.status,
    title:      r.title,
    animalId:   r.animalId,
    geofenceId: r.geofenceId,
    assigneeId: r.assigneeId,
    openedAt:   r.openedAt,
    closedAt:   r.closedAt,
  };
}

function mapDetail(r: RawDetail): AlertDetail {
  return {
    ...mapSummary(r),
    farmId:      r.farmId,
    description: r.description,
    metadata:    (r.metadata as Record<string, unknown> | null) ?? null,
    resolution:  r.resolution,
    responseMs:  r.responseMs,
    actions:     r.actions.map((a) => ({
      action:    a.action,
      userId:    a.userId,
      note:      a.note,
      createdAt: a.createdAt,
    })),
  };
}

// ── Repository ─────────────────────────────────────────────────────────────────

class AlertRepository {

  /**
   * Crea la alerta y su acción CREATED del sistema en una sola transacción.
   * Devuelve el resumen para emitir el evento WS alert:new.
   */
  async createWithAction(input: CreateAlertInput): Promise<AlertSummary> {
    const raw = await prisma.alert.create({
      data: {
        farmId:      input.farmId,
        animalId:    input.animalId,
        ruleId:      input.ruleId,
        priority:    input.priority,
        title:       input.title,
        description: input.description,
        geofenceId:  input.geofenceId ?? null,
        metadata:    (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        actions: {
          create: { action: 'CREATED', userId: null },
        },
      },
      select: ALERT_SUMMARY_SELECT,
    });
    return mapSummary(raw);
  }

  /**
   * Alerta activa (no cerrada) del mismo animal y regla — para deduplicar: no se
   * abre una nueva alerta idéntica mientras la condición sigue vigente.
   */
  async findActiveByAnimalRule(animalId: string, ruleId: string): Promise<{ id: string } | null> {
    return prisma.alert.findFirst({
      where:  { animalId, ruleId, status: { not: 'CLOSED' } },
      select: { id: true },
    });
  }

  async findById(id: string, farmId: string): Promise<AlertDetail | null> {
    const raw = await prisma.alert.findFirst({
      where:  { id, farmId },
      select: ALERT_DETAIL_SELECT,
    });
    return raw ? mapDetail(raw) : null;
  }

  async findAll(farmId: string, query: AlertQueryDto): Promise<PaginatedAlerts> {
    const { page, pageSize, status, priority, ruleId, animalId, sortOrder } = query;

    const where: Prisma.AlertWhereInput = {
      farmId,
      ...(status   && { status }),
      ...(priority && { priority }),
      ...(ruleId   && { ruleId }),
      ...(animalId && { animalId }),
    };

    const [raws, total] = await prisma.$transaction([
      prisma.alert.findMany({
        where,
        select:  ALERT_SUMMARY_SELECT,
        orderBy: { openedAt: sortOrder },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.alert.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data:        raws.map(mapSummary),
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
    };
  }

  /**
   * Aplica una transición de estado + registra la acción en alert_actions, todo en
   * una transacción. `data` lleva los campos a actualizar (status y, según el caso,
   * assigneeId / resolution / closedAt / responseMs).
   */
  async transition(
    id:      string,
    farmId:  string,
    data:    Prisma.AlertUpdateInput,
    action:  { action: string; userId: string; note?: string | null },
  ): Promise<AlertSummary> {
    const [, updated] = await prisma.$transaction([
      prisma.alertAction.create({
        data: { alertId: id, userId: action.userId, action: action.action, note: action.note ?? null },
      }),
      prisma.alert.update({
        where:  { id, farmId },
        data,
        select: ALERT_SUMMARY_SELECT,
      }),
    ]);
    return mapSummary(updated);
  }
}

export const alertRepository = new AlertRepository();
export type { AlertStatus };
