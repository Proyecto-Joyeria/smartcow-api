import { logger } from '@common/utils/logger';
import { INSTANT_RULES } from '@alerts/rules';
import type { AlertContext, AlertResult, IAlertRule } from '@alerts/alerts.types';

// ═══════════════════════════════════════════════════════════════════════════════
// AlertEngine — Sprint 5 (patrón Strategy, SDD §3.4.1)
//
// El motor NO conoce las reglas concretas: itera sobre una lista de IAlertRule y
// recolecta los resultados no nulos. Solo evalúa; NO persiste ni notifica (eso es
// responsabilidad de AlertService). Esta separación permite testear el motor con
// reglas simuladas y las reglas de forma aislada.
// ═══════════════════════════════════════════════════════════════════════════════

class AlertEngine {
  constructor(private readonly rules: IAlertRule[] = INSTANT_RULES) {}

  /**
   * Evalúa todas las reglas instantáneas contra el contexto y devuelve los
   * disparos. Una regla que lanza no aborta las demás (se registra y se continúa):
   * un fallo aislado no debe cegar al resto del motor.
   */
  evaluate(ctx: AlertContext): AlertResult[] {
    const results: AlertResult[] = [];
    for (const rule of this.rules) {
      try {
        const result = rule.evaluate(ctx);
        if (result) results.push(result);
      } catch (err) {
        logger.error('AlertEngine: regla lanzó excepción', {
          ruleId: rule.ruleId,
          animalId: ctx.animalId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}

export const alertEngine = new AlertEngine();
export { AlertEngine };
