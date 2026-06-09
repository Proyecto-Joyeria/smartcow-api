import { Prisma } from '@prisma/client';

import { prisma } from '@prisma/prisma.service';
import type {
  IGPSRepository,
  SaveGpsPointInput,
  SaveVitalRecordInput,
  GPSPointDto,
  VitalRecordDto,
  VitalResolution,
  DeviceTelemetryState,
} from '@gps/gps.types';

// ── Helpers de conversión ──────────────────────────────────────────────────────

/** Prisma devuelve Decimal; los DTO usan number | null */
function decToNum(d: Prisma.Decimal | null): number | null {
  return d === null ? null : d.toNumber();
}

// ── GPSRepository ──────────────────────────────────────────────────────────────

class GPSRepository implements IGPSRepository {

  // ── Escritura de telemetría (la invoca el worker persist-gps) ────────────────

  async saveGpsPoint(data: SaveGpsPointInput): Promise<void> {
    await prisma.gpsHistory.create({
      data: {
        animalId:   data.animalId,
        farmId:     data.farmId,
        lat:        data.lat,
        lng:        data.lng,
        alt:        data.alt      ?? undefined,
        accuracy:   data.accuracy ?? undefined,
        speedKmh:   data.speedKmh ?? undefined,
        recordedAt: data.recordedAt,
      },
    });
  }

  async saveVitalRecord(data: SaveVitalRecordInput): Promise<void> {
    await prisma.vitalHistory.create({
      data: {
        animalId:   data.animalId,
        farmId:     data.farmId,
        tempC:      data.tempC,
        heartBpm:   data.heartBpm,
        activity:   data.activity,
        batteryPct: data.batteryPct,
        recordedAt: data.recordedAt,
      },
    });
  }

  // ── Lectura de históricos (la invocan los endpoints REST) ────────────────────

  async getLocationHistory(
    animalId: string,
    farmId:   string,
    from:     Date,
    to:       Date,
  ): Promise<GPSPointDto[]> {
    const rows = await prisma.gpsHistory.findMany({
      where:   { animalId, farmId, recordedAt: { gte: from, lte: to } },
      orderBy: { recordedAt: 'desc' },
      select: {
        lat: true, lng: true, alt: true, accuracy: true, speedKmh: true, recordedAt: true,
      },
    });

    return rows.map((r) => ({
      lat:        r.lat.toNumber(),
      lng:        r.lng.toNumber(),
      alt:        decToNum(r.alt),
      accuracy:   decToNum(r.accuracy),
      speedKmh:   decToNum(r.speedKmh),
      recordedAt: r.recordedAt,
    }));
  }

  /**
   * Histórico de vitales. Con resolution 'raw' devuelve cada lectura; con 'hour'
   * o 'day' agrega por bucket temporal (promedio) usando date_trunc en SQL crudo.
   * El cast a ::float8 garantiza que los AVG vuelvan como number, no Decimal.
   */
  async getVitalHistory(
    animalId:   string,
    farmId:     string,
    from:       Date,
    to:         Date,
    resolution: VitalResolution,
  ): Promise<VitalRecordDto[]> {
    if (resolution === 'raw') {
      const rows = await prisma.vitalHistory.findMany({
        where:   { animalId, farmId, recordedAt: { gte: from, lte: to } },
        orderBy: { recordedAt: 'desc' },
        select: {
          tempC: true, heartBpm: true, activity: true, batteryPct: true, recordedAt: true,
        },
      });
      return rows.map((r) => ({
        tempC:      r.tempC.toNumber(),
        heartBpm:   r.heartBpm,
        activity:   r.activity,
        batteryPct: r.batteryPct,
        recordedAt: r.recordedAt,
      }));
    }

    // Agregación por hora o día
    const unit = resolution === 'hour' ? 'hour' : 'day';
    const rows = await prisma.$queryRaw<Array<{
      bucket:      Date;
      temp_c:      number;
      heart_bpm:   number;
      activity:    number;
      battery_pct: number;
    }>>(Prisma.sql`
      SELECT date_trunc(${unit}, recorded_at)        AS bucket,
             AVG(temp_c)::float8                      AS temp_c,
             AVG(heart_bpm)::float8                   AS heart_bpm,
             AVG(activity)::float8                    AS activity,
             AVG(battery_pct)::float8                 AS battery_pct
      FROM vital_history
      WHERE animal_id = ${animalId}
        AND farm_id   = ${farmId}
        AND recorded_at BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket DESC
    `);

    return rows.map((r) => ({
      tempC:      Math.round(r.temp_c * 10) / 10, // 1 decimal
      heartBpm:   Math.round(r.heart_bpm),
      activity:   Math.round(r.activity),
      batteryPct: Math.round(r.battery_pct),
      recordedAt: r.bucket,
    }));
  }

  async getLatestVitals(animalId: string): Promise<VitalRecordDto | null> {
    const r = await prisma.vitalHistory.findFirst({
      where:   { animalId },
      orderBy: { recordedAt: 'desc' },
      select: {
        tempC: true, heartBpm: true, activity: true, batteryPct: true, recordedAt: true,
      },
    });
    if (!r) return null;
    return {
      tempC:      r.tempC.toNumber(),
      heartBpm:   r.heartBpm,
      activity:   r.activity,
      batteryPct: r.batteryPct,
      recordedAt: r.recordedAt,
    };
  }

  async getLatestGpsPoint(animalId: string, farmId: string): Promise<GPSPointDto | null> {
    const r = await prisma.gpsHistory.findFirst({
      where:   { animalId, farmId },
      orderBy: { recordedAt: 'desc' },
      select: {
        lat: true, lng: true, alt: true, accuracy: true, speedKmh: true, recordedAt: true,
      },
    });
    if (!r) return null;
    return {
      lat:        r.lat.toNumber(),
      lng:        r.lng.toNumber(),
      alt:        decToNum(r.alt),
      accuracy:   decToNum(r.accuracy),
      speedKmh:   decToNum(r.speedKmh),
      recordedAt: r.recordedAt,
    };
  }

  // ── Routing y estado de device (camino de ingestión) ─────────────────────────

  /**
   * Resuelve deviceId → { animalId, farmId } desde PostgreSQL.
   * Devuelve null si el device no existe o no tiene animal asignado
   * (telemetría de un collar sin animal no se puede atribuir).
   */
  async getDeviceRouting(deviceId: string): Promise<{ animalId: string; farmId: string } | null> {
    const device = await prisma.device.findUnique({
      where:  { id: deviceId },
      select: { animalId: true, farmId: true },
    });
    if (!device || !device.animalId) return null;
    return { animalId: device.animalId, farmId: device.farmId };
  }

  /**
   * Refresca lastSeenAt / batteryPct / firmwareVersion del device.
   * updateMany evita lanzar si el id no existe (camino de alta frecuencia).
   */
  async updateDeviceState(deviceId: string, state: DeviceTelemetryState): Promise<void> {
    await prisma.device.updateMany({
      where: { id: deviceId },
      data: {
        lastSeenAt:      state.lastSeenAt,
        ...(state.batteryPct      !== undefined && { batteryPct:      state.batteryPct }),
        ...(state.firmwareVersion !== undefined && { firmwareVersion: state.firmwareVersion }),
      },
    });
  }

  /**
   * Escala el healthStatus del animal solo si está actualmente HEALTHY — nunca
   * sobrescribe un estado fijado por un veterinario. El AlertEngine completo
   * llegará en el Sprint 5; esto es una señal provisional.
   */
  async updateAnimalHealthStatus(
    animalId: string,
    farmId:   string,
    status:   'UNDER_OBSERVATION',
  ): Promise<void> {
    await prisma.animal.updateMany({
      where: { id: animalId, farmId, healthStatus: 'HEALTHY', deletedAt: null },
      data:  { healthStatus: status },
    });
  }
}

export const gpsRepository = new GPSRepository();
