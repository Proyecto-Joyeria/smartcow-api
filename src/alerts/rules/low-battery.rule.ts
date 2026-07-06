import { AlertPriority } from '@prisma/client';
import type { AlertContext, AlertResult, IAlertRule } from '@alerts/alerts.types';

/**
 * LOW_BATTERY — Batería del collar baja (SDD §3.4.2).
 *   batteryPct < lowBatteryPct (15%) → INFO (notificación solo web).
 */
export class LowBatteryRule implements IAlertRule {
  readonly ruleId = 'LOW_BATTERY';
  readonly priority = AlertPriority.INFO;

  evaluate(ctx: AlertContext): AlertResult | null {
    const { batteryPct } = ctx.vitals;
    const { lowBatteryPct } = ctx.thresholds;

    if (batteryPct < lowBatteryPct) {
      return {
        ruleId:      this.ruleId,
        priority:    AlertPriority.INFO,
        title:       'Batería baja',
        description: `La batería del collar está al ${batteryPct}% (umbral ${lowBatteryPct}%). Requiere recarga.`,
        metadata:    { batteryPct, threshold: lowBatteryPct },
      };
    }

    return null;
  }
}
