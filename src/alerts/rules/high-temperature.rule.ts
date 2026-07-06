import { AlertPriority } from '@prisma/client';
import type { AlertContext, AlertResult, IAlertRule } from '@alerts/alerts.types';

/**
 * HIGH_TEMP — Temperatura corporal elevada (SDD §3.4.2).
 *   >= tempCriticalC (40.5°C) → CRITICAL
 *   >= tempWarnC     (39.5°C) → WARNING
 */
export class HighTemperatureRule implements IAlertRule {
  readonly ruleId = 'HIGH_TEMP';
  readonly priority = AlertPriority.WARNING;

  evaluate(ctx: AlertContext): AlertResult | null {
    const { tempC } = ctx.vitals;
    const { tempWarnC, tempCriticalC } = ctx.thresholds;

    if (tempC >= tempCriticalC) {
      return {
        ruleId:      this.ruleId,
        priority:    AlertPriority.CRITICAL,
        title:       'Temperatura crítica',
        description: `Temperatura corporal de ${tempC.toFixed(1)}°C — supera el umbral crítico de ${tempCriticalC}°C.`,
        metadata:    { tempC, threshold: tempCriticalC },
      };
    }

    if (tempC >= tempWarnC) {
      return {
        ruleId:      this.ruleId,
        priority:    AlertPriority.WARNING,
        title:       'Temperatura elevada',
        description: `Temperatura corporal de ${tempC.toFixed(1)}°C — supera el umbral de advertencia de ${tempWarnC}°C.`,
        metadata:    { tempC, threshold: tempWarnC },
      };
    }

    return null;
  }
}
