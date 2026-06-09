import type { Job } from 'bullmq';

import { logger } from '@common/utils/logger';
import type { EvaluateAlertsJobData } from '@workers/queues';

/**
 * Procesa un job de la cola evaluate-alerts.
 *
 * En el Sprint 3 solo deja traza: el AlertEngine completo (GeofenceExitRule,
 * HighTemperatureRule, AbnormalHeartRateRule, etc. — patrón Strategy) se construye
 * en el Sprint 5. La forma de EvaluateAlertsJobData ya es el AlertContext que ese
 * motor recibirá, por lo que la integración futura no cambiará el productor.
 */
export async function evaluateAlertsProcessor(job: Job<EvaluateAlertsJobData>): Promise<void> {
  const { animalId, farmId, gps, vitals } = job.data;

  logger.debug('evaluate-alerts: evaluación pendiente (AlertEngine → Sprint 5)', {
    animalId,
    farmId,
    coords:   { lat: gps.lat, lng: gps.lng },
    tempC:    vitals.tempC,
    heartBpm: vitals.heartBpm,
    activity: vitals.activity,
  });

  // Sprint 5: const ctx: AlertContext = job.data; await alertEngine.evaluate(ctx);
}
