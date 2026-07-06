import { AlertPriority } from '@prisma/client';
import type { AlertResult, FarmThresholds, PeriodicAnimalState } from '@alerts/alerts.types';

/**
 * SENSOR_OFFLINE — El collar dejó de transmitir (SDD §3.4.2).
 *
 * Regla PERIÓDICA: la evalúa el job cada 5 min, no la telemetría (por definición,
 * un sensor offline no envía telemetría). Dispara WARNING si `lastSeenAt` es más
 * antiguo que `sensorOfflineMinutes`.
 *
 * Es pura: recibe el estado del animal y el momento de evaluación, sin IO.
 */
export class SensorOfflineRule {
  readonly ruleId = 'SENSOR_OFFLINE';
  readonly priority = AlertPriority.WARNING;

  evaluate(state: PeriodicAnimalState, thresholds: FarmThresholds, now: Date): AlertResult | null {
    if (!state.deviceId) return null;         // sin collar asignado, no aplica
    if (!state.lastSeenAt) return null;       // nunca reportó → no es "se cayó"

    const offlineMs = now.getTime() - state.lastSeenAt.getTime();
    const thresholdMs = thresholds.sensorOfflineMinutes * 60 * 1000;
    if (offlineMs < thresholdMs) return null;

    const minutes = Math.floor(offlineMs / 60000);
    return {
      ruleId:      this.ruleId,
      priority:    AlertPriority.WARNING,
      title:       'Sensor sin conexión',
      description: `El collar no transmite desde hace ${minutes} min (última señal: ${state.lastSeenAt.toISOString()}).`,
      metadata:    { deviceId: state.deviceId, lastSeenAt: state.lastSeenAt.toISOString(), offlineMinutes: minutes },
    };
  }
}
