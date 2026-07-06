// ═══════════════════════════════════════════════════════════════════════════════
// Tipos del módulo de Alertas — Sprint 5
// ═══════════════════════════════════════════════════════════════════════════════

import type { AlertPriority, AlertStatus } from '@prisma/client';
import type { ActiveGeofence, LatLng } from '@geofence/geofence.types';

export type { AlertPriority, AlertStatus };

// ── Umbrales de evaluación por finca ───────────────────────────────────────────
// El DataModel v1.0.0 no define una tabla de umbrales por finca, así que se usan
// los valores por defecto del SDD §3.4.2. Se centralizan aquí para que cada regla
// sea determinista y testeable, y para poder parametrizarlos por finca en el futuro.

export interface FarmThresholds {
  tempWarnC:      number;  // °C
  tempCriticalC:  number;
  heartLowWarn:   number;  // bpm
  heartHighWarn:  number;
  heartLowCrit:   number;
  heartHighCrit:  number;
  immobilityActivity: number; // índice de actividad
  immobilityHours:    number; // horas continuas
  nightSpeedKmh:  number;
  nightStartHour: number;  // hora local (0-23) — inicio ventana nocturna
  nightEndHour:   number;  // hora local (0-23) — fin ventana nocturna
  lowBatteryPct:  number;
  sensorOfflineMinutes: number;
}

export const DEFAULT_THRESHOLDS: FarmThresholds = {
  tempWarnC:      39.5,
  tempCriticalC:  40.5,
  heartLowWarn:   40,
  heartHighWarn:  100,
  heartLowCrit:   30,
  heartHighCrit:  120,
  immobilityActivity: 5,
  immobilityHours:    4,
  nightSpeedKmh:  15,
  nightStartHour: 22,
  nightEndHour:   5,
  lowBatteryPct:  15,
  sensorOfflineMinutes: 5,
};

// ── Contexto y resultado de evaluación (patrón Strategy) ───────────────────────

/**
 * Contexto que recibe cada regla instantánea (evaluada por lectura de telemetría).
 * Es puro: no contiene dependencias de IO — la regla decide solo con estos datos,
 * lo que la hace testeable en aislamiento.
 */
export interface AlertContext {
  animalId:  string;
  farmId:    string;
  deviceId:  string;
  gps:       { lat: number; lng: number; speedKmh: number | null };
  vitals:    { tempC: number; heartBpm: number; activity: number; batteryPct: number };
  geofences: ActiveGeofence[];
  thresholds: FarmThresholds;
  /** Momento de evaluación. */
  now:       Date;
  /** Hora local de la finca (0-23), precalculada según su timezone. NightMovement. */
  localHour: number;
}

/** Resultado de una regla que SÍ dispara. `null` si la condición no se cumple. */
export interface AlertResult {
  ruleId:      string;
  priority:    AlertPriority;
  title:       string;
  description: string;
  /** Solo GeofenceExitRule lo rellena. */
  geofenceId?: string | null;
  metadata?:   Record<string, unknown>;
}

/** Interfaz base de todas las reglas instantáneas (SDD §3.4.1). */
export interface IAlertRule {
  readonly ruleId:   string;
  readonly priority: AlertPriority;
  evaluate(ctx: AlertContext): AlertResult | null;
}

// ── Contexto de las reglas periódicas (evaluadas por job cada 5 min) ───────────

/** Estado de un animal para las reglas periódicas (SensorOffline, Immobility). */
export interface PeriodicAnimalState {
  animalId:   string;
  farmId:     string;
  deviceId:   string | null;
  lastSeenAt: Date | null;
  /** Actividad máxima registrada en la ventana de inmovilidad (o null si sin datos). */
  maxActivityInWindow: number | null;
  /** Nº de lecturas de vitales en la ventana — evita falsos positivos sin datos. */
  vitalSamplesInWindow: number;
}

// ── DTOs de la API ─────────────────────────────────────────────────────────────

export interface AlertSummary {
  id:         string;
  ruleId:     string;
  priority:   AlertPriority;
  status:     AlertStatus;
  title:      string;
  animalId:   string;
  geofenceId: string | null;
  assigneeId: string | null;
  openedAt:   Date;
  closedAt:   Date | null;
}

export interface AlertDetail extends AlertSummary {
  farmId:      string;
  description: string;
  metadata:    Record<string, unknown> | null;
  resolution:  string | null;
  responseMs:  number | null;
  actions:     AlertActionDto[];
}

export interface AlertActionDto {
  action:    string;
  userId:    string | null;
  note:      string | null;
  createdAt: Date;
}

export interface PaginatedAlerts {
  data:        AlertSummary[];
  total:       number;
  page:        number;
  pageSize:    number;
  totalPages:  number;
  hasNextPage: boolean;
}

/** Datos para crear una alerta a partir de un AlertResult del motor. */
export interface CreateAlertInput {
  farmId:      string;
  animalId:    string;
  ruleId:      string;
  priority:    AlertPriority;
  title:       string;
  description: string;
  geofenceId?: string | null;
  metadata?:   Record<string, unknown>;
}

// Reexport para consumidores del módulo
export type { LatLng };
