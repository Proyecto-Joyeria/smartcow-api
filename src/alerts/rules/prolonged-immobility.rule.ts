import { AlertPriority } from '@prisma/client';
import type { AlertResult, FarmThresholds, PeriodicAnimalState } from '@alerts/alerts.types';

/**
 * PROLONGED_IMMOBILITY — Inmovilidad prolongada (SDD §3.4.2).
 *
 * Regla PERIÓDICA: dispara WARNING si la actividad máxima del animal durante la
 * ventana de inmovilidad (por defecto 4h) se mantuvo por debajo del umbral (5).
 * Señal temprana de enfermedad, parto o accidente.
 *
 * Requiere al menos una muestra en la ventana para evitar falsos positivos cuando
 * simplemente no hay datos (eso lo cubre SensorOfflineRule).
 */
export class ProlongedImmobilityRule {
  readonly ruleId = 'PROLONGED_IMMOBILITY';
  readonly priority = AlertPriority.WARNING;

  evaluate(state: PeriodicAnimalState, thresholds: FarmThresholds): AlertResult | null {
    if (state.vitalSamplesInWindow === 0) return null;      // sin datos → no evaluar
    if (state.maxActivityInWindow === null) return null;
    if (state.maxActivityInWindow >= thresholds.immobilityActivity) return null;

    return {
      ruleId:      this.ruleId,
      priority:    AlertPriority.WARNING,
      title:       'Inmovilidad prolongada',
      description: `Actividad por debajo de ${thresholds.immobilityActivity} durante más de ${thresholds.immobilityHours}h continuas. Requiere revisión veterinaria.`,
      metadata:    {
        maxActivity: state.maxActivityInWindow,
        threshold:   thresholds.immobilityActivity,
        windowHours: thresholds.immobilityHours,
      },
    };
  }
}
