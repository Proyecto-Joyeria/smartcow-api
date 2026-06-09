// ═══════════════════════════════════════════════════════════════════════════════
// Tipos del módulo GPS — Sprint 3
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Payload crudo de telemetría que envía el collar IoT por MQTT.
 * Campos abreviados para minimizar bytes en la red celular/LoRa.
 * Ver tabla de mapeo en .claude/context/api-contracts.md.
 */
export interface IoTTelemetryPayload {
  d:   string;   // deviceId (UUID del collar)
  ts:  number;   // timestamp unix ms UTC
  la:  number;   // latitud WGS84
  lo:  number;   // longitud WGS84
  al?: number;   // altitud en metros (opcional)
  ac?: number;   // accuracy en metros (opcional)
  sp?: number;   // speed en km/h (opcional)
  tp:  number;   // temperatura × 10 (384 = 38.4°C)
  hr:  number;   // ritmo cardíaco bpm
  ax:  number;   // índice de actividad 0-100
  bt:  number;   // batería 0-100
  fv:  string;   // versión de firmware (semver)
}

/** Resolución de agregación para el histórico de vitales */
export type VitalResolution = 'raw' | 'hour' | 'day';

// ── DTOs de respuesta de la API ────────────────────────────────────────────────

/** Punto histórico de ubicación GPS */
export interface GPSPointDto {
  lat:        number;
  lng:        number;
  alt:        number | null;
  accuracy:   number | null;
  speedKmh:   number | null;
  recordedAt: Date;
}

/** Registro histórico de signos vitales */
export interface VitalRecordDto {
  tempC:      number;
  heartBpm:   number;
  activity:   number;
  batteryPct: number;
  recordedAt: Date;
}

/** Respuesta de GET /animals/:id/location (posición actual) */
export interface LocationResponseDto {
  animalId: string;
  lat:      number;
  lng:      number;
  ts:       number;                // unix ms del último fix
  speed:    number | null;         // km/h
  source:   'redis' | 'postgres';  // origen del dato (cache vs histórico)
}

// ── Inputs de persistencia (worker → repository) ───────────────────────────────

export interface SaveGpsPointInput {
  animalId:   string;
  farmId:     string;
  lat:        number;
  lng:        number;
  alt:        number | null;
  accuracy:   number | null;
  speedKmh:   number | null;
  recordedAt: Date;
}

export interface SaveVitalRecordInput {
  animalId:   string;
  farmId:     string;
  tempC:      number;
  heartBpm:   number;
  activity:   number;
  batteryPct: number;
  recordedAt: Date;
}

/** Estado de telemetría del device a refrescar tras cada lectura */
export interface DeviceTelemetryState {
  batteryPct?:      number;
  firmwareVersion?: string;
  lastSeenAt:       Date;
}

// ── Contratos de capa ──────────────────────────────────────────────────────────

export interface IGPSRepository {
  saveGpsPoint(data: SaveGpsPointInput): Promise<void>;
  saveVitalRecord(data: SaveVitalRecordInput): Promise<void>;
  getLocationHistory(animalId: string, farmId: string, from: Date, to: Date): Promise<GPSPointDto[]>;
  getVitalHistory(animalId: string, farmId: string, from: Date, to: Date, resolution: VitalResolution): Promise<VitalRecordDto[]>;
  getLatestVitals(animalId: string): Promise<VitalRecordDto | null>;
  getLatestGpsPoint(animalId: string, farmId: string): Promise<GPSPointDto | null>;
  getDeviceRouting(deviceId: string): Promise<{ animalId: string; farmId: string } | null>;
  updateDeviceState(deviceId: string, state: DeviceTelemetryState): Promise<void>;
  updateAnimalHealthStatus(animalId: string, farmId: string, status: 'UNDER_OBSERVATION'): Promise<void>;
}

export interface IGPSService {
  processTelemetry(raw: unknown): Promise<void>;
  getCurrentLocation(animalId: string, farmId: string): Promise<LocationResponseDto>;
  getLocationHistory(animalId: string, farmId: string, from: Date, to: Date): Promise<GPSPointDto[]>;
  getVitalHistory(animalId: string, farmId: string, from: Date, to: Date, resolution: VitalResolution): Promise<VitalRecordDto[]>;
}
