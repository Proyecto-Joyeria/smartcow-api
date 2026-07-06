import { AlertPriority } from '@prisma/client';
import type { AlertContext, AlertResult, IAlertRule } from '@alerts/alerts.types';

/**
 * ABNORMAL_HEART_RATE — Ritmo cardíaco anómalo (SDD §3.4.2).
 *   < heartLowCrit (30) o > heartHighCrit (120) → CRITICAL
 *   < heartLowWarn (40) o > heartHighWarn (100) → WARNING
 */
export class AbnormalHeartRateRule implements IAlertRule {
  readonly ruleId = 'ABNORMAL_HEART_RATE';
  readonly priority = AlertPriority.WARNING;

  evaluate(ctx: AlertContext): AlertResult | null {
    const { heartBpm } = ctx.vitals;
    const { heartLowWarn, heartHighWarn, heartLowCrit, heartHighCrit } = ctx.thresholds;

    if (heartBpm < heartLowCrit || heartBpm > heartHighCrit) {
      return {
        ruleId:      this.ruleId,
        priority:    AlertPriority.CRITICAL,
        title:       'Ritmo cardíaco crítico',
        description: `Ritmo cardíaco de ${heartBpm} bpm fuera del rango crítico (${heartLowCrit}–${heartHighCrit} bpm).`,
        metadata:    { heartBpm, lowCrit: heartLowCrit, highCrit: heartHighCrit },
      };
    }

    if (heartBpm < heartLowWarn || heartBpm > heartHighWarn) {
      return {
        ruleId:      this.ruleId,
        priority:    AlertPriority.WARNING,
        title:       'Ritmo cardíaco anómalo',
        description: `Ritmo cardíaco de ${heartBpm} bpm fuera del rango normal (${heartLowWarn}–${heartHighWarn} bpm).`,
        metadata:    { heartBpm, lowWarn: heartLowWarn, highWarn: heartHighWarn },
      };
    }

    return null;
  }
}
