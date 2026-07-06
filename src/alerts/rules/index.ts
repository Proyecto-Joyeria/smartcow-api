// ═══════════════════════════════════════════════════════════════════════════════
// Registro de reglas de alerta — Sprint 5
//
// Agregar una nueva regla instantánea es tan simple como implementar IAlertRule y
// añadirla a INSTANT_RULES: el AlertEngine la evalúa sin cambios. Las reglas
// periódicas (dependen de estado histórico) se registran aparte y las invoca el job.
// ═══════════════════════════════════════════════════════════════════════════════

import type { IAlertRule } from '@alerts/alerts.types';

import { GeofenceExitRule } from '@alerts/rules/geofence-exit.rule';
import { HighTemperatureRule } from '@alerts/rules/high-temperature.rule';
import { AbnormalHeartRateRule } from '@alerts/rules/abnormal-heart-rate.rule';
import { NightMovementRule } from '@alerts/rules/night-movement.rule';
import { LowBatteryRule } from '@alerts/rules/low-battery.rule';
import { SensorOfflineRule } from '@alerts/rules/sensor-offline.rule';
import { ProlongedImmobilityRule } from '@alerts/rules/prolonged-immobility.rule';

/** Reglas evaluadas por CADA lectura de telemetría (puras, sin IO). */
export const INSTANT_RULES: IAlertRule[] = [
  new GeofenceExitRule(),
  new HighTemperatureRule(),
  new AbnormalHeartRateRule(),
  new NightMovementRule(),
  new LowBatteryRule(),
];

/** Reglas evaluadas por el job periódico (dependen de estado histórico). */
export const sensorOfflineRule = new SensorOfflineRule();
export const prolongedImmobilityRule = new ProlongedImmobilityRule();

export {
  GeofenceExitRule,
  HighTemperatureRule,
  AbnormalHeartRateRule,
  NightMovementRule,
  LowBatteryRule,
  SensorOfflineRule,
  ProlongedImmobilityRule,
};
