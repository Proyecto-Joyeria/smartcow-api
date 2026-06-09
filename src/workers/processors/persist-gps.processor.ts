import type { Job } from 'bullmq';

import { logger } from '@common/utils/logger';
import { gpsRepository } from '@gps/gps.repository';
import type { PersistGpsJobData } from '@workers/queues';

/**
 * Umbral provisional de temperatura para escalar healthStatus a UNDER_OBSERVATION.
 * Es una señal temporal: el AlertEngine completo (patrón Strategy) llega en Sprint 5.
 */
const TEMP_OBSERVATION_THRESHOLD_C = 40.5;

/**
 * Procesa un job de la cola persist-gps:
 *   1. INSERT en gps_history
 *   2. INSERT en vital_history
 *   3. Refresca lastSeenAt / batteryPct / firmwareVersion del device
 *   4. Escala healthStatus del animal si los vitales lo requieren
 *
 * Corre en el proceso worker (npm run dev:worker), nunca en la API.
 */
export async function persistGpsProcessor(job: Job<PersistGpsJobData>): Promise<void> {
  const { deviceId, animalId, farmId, firmwareVersion, gps, vitals } = job.data;

  // 1 + 2. Persistencia histórica
  await gpsRepository.saveGpsPoint({
    animalId,
    farmId,
    lat:        gps.lat,
    lng:        gps.lng,
    alt:        gps.alt,
    accuracy:   gps.accuracy,
    speedKmh:   gps.speedKmh,
    recordedAt: new Date(gps.recordedAt),
  });

  await gpsRepository.saveVitalRecord({
    animalId,
    farmId,
    tempC:      vitals.tempC,
    heartBpm:   vitals.heartBpm,
    activity:   vitals.activity,
    batteryPct: vitals.batteryPct,
    recordedAt: new Date(vitals.recordedAt),
  });

  // 3. Estado del device
  await gpsRepository.updateDeviceState(deviceId, {
    lastSeenAt:      new Date(),
    batteryPct:      vitals.batteryPct,
    firmwareVersion,
  });

  // 4. Señal de salud provisional
  if (vitals.tempC >= TEMP_OBSERVATION_THRESHOLD_C) {
    await gpsRepository.updateAnimalHealthStatus(animalId, farmId, 'UNDER_OBSERVATION');
    logger.info('persist-gps: animal escalado a UNDER_OBSERVATION por temperatura', {
      animalId, farmId, tempC: vitals.tempC,
    });
  }

  logger.debug('persist-gps: lectura persistida', { animalId, farmId, deviceId });
}
