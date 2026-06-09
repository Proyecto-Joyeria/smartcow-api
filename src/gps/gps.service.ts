import { AppError } from '@common/utils/app-error';
import { logger } from '@common/utils/logger';
import {
  setAnimalPosition,
  getAnimalPosition,
  publishGpsEvent,
  cacheDeviceRouting,
  getCachedDeviceRouting,
  type DeviceRouting,
} from '@redis/redis.service';
import {
  getPersistGpsQueue,
  getEvaluateAlertsQueue,
  type TelemetryJobData,
} from '@workers/queues';

import { gpsRepository } from '@gps/gps.repository';
import { IoTTelemetrySchema } from '@gps/gps.schemas';
import type {
  IGPSService,
  GPSPointDto,
  VitalRecordDto,
  VitalResolution,
  LocationResponseDto,
} from '@gps/gps.types';

class GPSService implements IGPSService {

  /**
   * Pipeline de procesamiento de telemetría IoT — el flujo más crítico del sistema.
   * Es NO BLOQUEANTE respecto a PostgreSQL: las únicas operaciones síncronas son
   * Redis (posición + pub/sub) y el encolado en Bull MQ. La persistencia histórica
   * y la evaluación de alertas ocurren en el worker, en otro proceso.
   *
   * Pasos:
   *   1. Recibir payload crudo
   *   2. Validar con Zod (rangos físicos exactos)
   *   3. Resolver animalId + farmId por deviceId (Redis cache → fallback PostgreSQL)
   *   4. Actualizar posición vigente en Redis (lectura de tiempo real del mapa)
   *   5. Publicar evento en el canal pub/sub de la finca (lo emite el WS gateway)
   *   6. Encolar job persist-gps  (persistencia histórica asíncrona)
   *   7. Encolar job evaluate-alerts (motor de alertas asíncrono)
   */
  async processTelemetry(raw: unknown): Promise<void> {
    // 2. Validación
    const parsed = IoTTelemetrySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Payload de telemetría IoT inválido',
        parsed.error.issues,
      );
    }
    const t = parsed.data;

    // 3. Resolución de routing deviceId → animal + finca
    const routing = await this.resolveDeviceRouting(t.d);
    if (!routing) {
      throw new AppError(
        404,
        'NOT_FOUND',
        `Device ${t.d} no registrado o sin animal asignado`,
      );
    }
    const { animalId, farmId } = routing;
    const speed = t.sp ?? 0;

    // 4. Posición vigente en Redis (camino de tiempo real)
    await setAnimalPosition(animalId, farmId, t.la, t.lo, t.ts, speed);

    // 5. Publicación pub/sub para el WebSocket gateway
    await publishGpsEvent(farmId, { animalId, lat: t.la, lng: t.lo, ts: t.ts, speed });

    // 6 + 7. Encolado de persistencia y evaluación de alertas
    const recordedAt = new Date(t.ts).toISOString();
    const jobData: TelemetryJobData = {
      deviceId:        t.d,
      animalId,
      farmId,
      firmwareVersion: t.fv,
      gps: {
        lat:        t.la,
        lng:        t.lo,
        alt:        t.al ?? null,
        accuracy:   t.ac ?? null,
        speedKmh:   t.sp ?? null,
        recordedAt,
      },
      vitals: {
        tempC:      t.tp / 10,  // el sensor envía la temperatura × 10
        heartBpm:   t.hr,
        activity:   t.ax,
        batteryPct: t.bt,
        recordedAt,
      },
    };

    await Promise.all([
      getPersistGpsQueue().add('persist', jobData),
      getEvaluateAlertsQueue().add('evaluate', jobData),
    ]);

    logger.debug('GPS: telemetría procesada', { deviceId: t.d, animalId, farmId });
  }

  /**
   * Resuelve el routing de un device. Primero consulta la cache Redis; si falla,
   * consulta PostgreSQL y cachea el resultado por 1h (HSET device:{id}).
   */
  private async resolveDeviceRouting(deviceId: string): Promise<DeviceRouting | null> {
    const cached = await getCachedDeviceRouting(deviceId);
    if (cached) return cached;

    const routing = await gpsRepository.getDeviceRouting(deviceId);
    if (!routing) return null;

    await cacheDeviceRouting(deviceId, routing.animalId, routing.farmId);
    return routing;
  }

  /**
   * Posición actual de un animal. Lee SIEMPRE de Redis primero (camino de tiempo
   * real); si no hay dato en cache, hace fallback al último punto en PostgreSQL.
   * El aislamiento multi-tenant se garantiza comparando farmId.
   */
  async getCurrentLocation(animalId: string, farmId: string): Promise<LocationResponseDto> {
    const pos = await getAnimalPosition(animalId);
    if (pos && pos.farmId === farmId) {
      return {
        animalId,
        lat:    pos.lat,
        lng:    pos.lng,
        ts:     pos.ts,
        speed:  pos.speed,
        source: 'redis',
      };
    }

    // Fallback a PostgreSQL (consulta filtrada por finca → aislamiento garantizado)
    const latest = await gpsRepository.getLatestGpsPoint(animalId, farmId);
    if (!latest) {
      throw new AppError(404, 'NOT_FOUND', 'Sin datos de ubicación para este animal');
    }
    return {
      animalId,
      lat:    latest.lat,
      lng:    latest.lng,
      ts:     latest.recordedAt.getTime(),
      speed:  latest.speedKmh,
      source: 'postgres',
    };
  }

  async getLocationHistory(
    animalId: string,
    farmId:   string,
    from:     Date,
    to:       Date,
  ): Promise<GPSPointDto[]> {
    return gpsRepository.getLocationHistory(animalId, farmId, from, to);
  }

  async getVitalHistory(
    animalId:   string,
    farmId:     string,
    from:       Date,
    to:         Date,
    resolution: VitalResolution,
  ): Promise<VitalRecordDto[]> {
    return gpsRepository.getVitalHistory(animalId, farmId, from, to, resolution);
  }
}

export const gpsService = new GPSService();
