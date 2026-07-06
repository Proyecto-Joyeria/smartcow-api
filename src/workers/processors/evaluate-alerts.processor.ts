import type { Job } from 'bullmq';

import { logger } from '@common/utils/logger';
import { redisGet, redisSet } from '@redis/redis.service';
import { prisma } from '@prisma/prisma.service';
import { geofenceService } from '@geofence/geofence.service';
import { alertEngine } from '@alerts/alert-engine';
import { alertService } from '@alerts/alerts.service';
import { DEFAULT_THRESHOLDS, type AlertContext } from '@alerts/alerts.types';
import type { EvaluateAlertsJobData } from '@workers/queues';

const FARM_TZ_TTL_SECONDS = 6 * 60 * 60; // 6h
const DEFAULT_TZ = 'America/Bogota';

/**
 * Resuelve la timezone de una finca (cacheada en Redis) para calcular la hora local
 * que usa NightMovementRule. Fallback a la timezone por defecto si no se encuentra.
 */
async function getFarmTimezone(farmId: string): Promise<string> {
  const key = `farm:${farmId}:tz`;
  const cached = await redisGet<string>(key);
  if (cached) return cached;

  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { timezone: true } });
  const tz = farm?.timezone ?? DEFAULT_TZ;
  await redisSet(key, tz, FARM_TZ_TTL_SECONDS);
  return tz;
}

/** Hora local (0-23) de un instante en una timezone dada. */
function localHourIn(now: Date, timeZone: string): number {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', hour12: false,
    }).format(now);
    const hour = parseInt(hourStr, 10);
    return hour === 24 ? 0 : hour; // '24' es medianoche en algunos locales
  } catch {
    return now.getUTCHours();
  }
}

/**
 * Procesa un job de evaluate-alerts (Sprint 5).
 *
 * Construye el AlertContext a partir de la telemetría resuelta, evalúa TODAS las
 * reglas instantáneas del AlertEngine (patrón Strategy) y persiste los disparos vía
 * AlertService (que deduplica, emite WS alert:new y encola notificaciones).
 *
 * Corre en el proceso worker, nunca en la API.
 */
export async function evaluateAlertsProcessor(job: Job<EvaluateAlertsJobData>): Promise<void> {
  const { animalId, farmId, deviceId, gps, vitals } = job.data;

  const now = new Date();
  const [geofences, timeZone] = await Promise.all([
    geofenceService.getActiveForEvaluation(farmId),
    getFarmTimezone(farmId),
  ]);

  const ctx: AlertContext = {
    animalId,
    farmId,
    deviceId,
    gps:       { lat: gps.lat, lng: gps.lng, speedKmh: gps.speedKmh },
    vitals:    {
      tempC:      vitals.tempC,
      heartBpm:   vitals.heartBpm,
      activity:   vitals.activity,
      batteryPct: vitals.batteryPct,
    },
    geofences,
    thresholds: DEFAULT_THRESHOLDS,
    now,
    localHour:  localHourIn(now, timeZone),
  };

  const results = alertEngine.evaluate(ctx);
  if (results.length === 0) {
    logger.debug('evaluate-alerts: sin disparos', { animalId, farmId });
    return;
  }

  const created = await alertService.createFromResults(farmId, animalId, results);
  logger.debug('evaluate-alerts: evaluación completada', {
    animalId, farmId, disparos: results.length, creadas: created.length,
  });
}
