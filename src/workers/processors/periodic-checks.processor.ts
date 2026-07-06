import type { Job } from 'bullmq';

import { logger } from '@common/utils/logger';
import { prisma } from '@prisma/prisma.service';
import { publishFarmEvent } from '@redis/redis.service';
import { alertService } from '@alerts/alerts.service';
import { sensorOfflineRule, prolongedImmobilityRule } from '@alerts/rules';
import { DEFAULT_THRESHOLDS, type PeriodicAnimalState } from '@alerts/alerts.types';
import type { PeriodicChecksJobData } from '@workers/queues';

/**
 * Barrido periódico (cada 5 min) de las reglas dependientes de estado histórico:
 *   - SENSOR_OFFLINE:        collar sin transmitir > 5 min.
 *   - PROLONGED_IMMOBILITY:  actividad < umbral durante > 4h continuas.
 *
 * A diferencia de las reglas instantáneas (evaluadas por telemetría), estas
 * requieren mirar el estado agregado, por eso viven en un job programado.
 *
 * La deduplicación de AlertService evita reabrir la misma alerta en cada barrido
 * mientras la condición persiste.
 */
export async function periodicChecksProcessor(_job: Job<PeriodicChecksJobData>): Promise<void> {
  const now = new Date();
  const th = DEFAULT_THRESHOLDS;
  const windowStart = new Date(now.getTime() - th.immobilityHours * 60 * 60 * 1000);

  // Dispositivos activos con animal asignado (candidatos a ambas reglas).
  const devices = await prisma.device.findMany({
    where:  { isActive: true, animalId: { not: null } },
    select: { id: true, farmId: true, animalId: true, lastSeenAt: true },
  });
  if (devices.length === 0) return;

  const animalIds = devices.map((d) => d.animalId!).filter(Boolean);

  // Actividad máxima y nº de muestras por animal en la ventana de inmovilidad.
  const activity = await prisma.vitalHistory.groupBy({
    by:     ['animalId'],
    where:  { animalId: { in: animalIds }, recordedAt: { gte: windowStart } },
    _max:   { activity: true },
    _count: { _all: true },
  });
  const activityByAnimal = new Map(
    activity.map((a) => [a.animalId, { max: a._max.activity, count: a._count._all }]),
  );

  let sensorOffline = 0;
  let immobility = 0;

  for (const d of devices) {
    const animalId = d.animalId!;
    const agg = activityByAnimal.get(animalId);

    const state: PeriodicAnimalState = {
      animalId,
      farmId:     d.farmId,
      deviceId:   d.id,
      lastSeenAt: d.lastSeenAt,
      maxActivityInWindow:  agg?.max ?? null,
      vitalSamplesInWindow: agg?.count ?? 0,
    };

    // SENSOR_OFFLINE
    const offline = sensorOfflineRule.evaluate(state, th, now);
    if (offline) {
      const created = await alertService.createFromResults(d.farmId, animalId, [offline]);
      if (created.length > 0) {
        sensorOffline++;
        await publishFarmEvent(d.farmId, {
          event: 'sensor:offline',
          payload: { animalId, deviceId: d.id, lastSeenAt: d.lastSeenAt?.toISOString() ?? null },
        });
      }
    }

    // PROLONGED_IMMOBILITY
    const immob = prolongedImmobilityRule.evaluate(state, th);
    if (immob) {
      const created = await alertService.createFromResults(d.farmId, animalId, [immob]);
      if (created.length > 0) immobility++;
    }
  }

  logger.info('periodic-checks: barrido completado', {
    dispositivos: devices.length, sensorOffline, immobility,
  });
}
