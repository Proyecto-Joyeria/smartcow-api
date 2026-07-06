import { Prisma } from '@prisma/client';

import { prisma } from '@prisma/prisma.service';
import { logger } from '@common/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// Servicio de auditoría — Sprint 5
//
// Escribe en audit_logs (§3.12 DataModel). La tabla es de SOLO INSERCIÓN: la
// aplicación nunca hace UPDATE ni DELETE. Se usa para registrar acciones sensibles
// (ciclo de vida de alertas, gestión de geocercas, etc.).
//
// El registro de auditoría NUNCA debe tumbar la operación de negocio: si el INSERT
// falla, se loguea el error y se continúa (best-effort).
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuditEntry {
  userId?:     string | null;
  farmId?:     string | null;
  action:      string;               // ej: ALERT_ACKNOWLEDGED, GEOFENCE_DELETED
  entityType?: string | null;        // ej: Alert, Geofence
  entityId?:   string | null;
  oldValues?:  Record<string, unknown> | null;
  newValues?:  Record<string, unknown> | null;
  ipAddress?:  string | null;
  userAgent?:  string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:     entry.userId     ?? null,
        farmId:     entry.farmId     ?? null,
        action:     entry.action,
        entityType: entry.entityType ?? null,
        entityId:   entry.entityId   ?? null,
        oldValues:  (entry.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
        newValues:  (entry.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress:  entry.ipAddress  ?? null,
        userAgent:  entry.userAgent  ?? null,
      },
    });
  } catch (err) {
    logger.error('Audit: no se pudo escribir el registro de auditoría', {
      action:  entry.action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
