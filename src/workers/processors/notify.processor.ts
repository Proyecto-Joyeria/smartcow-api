import type { Job } from 'bullmq';

import { logger } from '@common/utils/logger';
import { dispatchAlertNotification } from '@notifications/notification.service';
import type { NotificationJobData } from '@workers/queues';

/**
 * Procesa un job de la cola notifications (Sprint 5): despacha email/SMS de una
 * alerta según su prioridad. Un fallo 5xx propaga para que Bull MQ reintente.
 */
export async function notifyProcessor(job: Job<NotificationJobData>): Promise<void> {
  await dispatchAlertNotification(job.data);
  logger.debug('notify: notificación despachada', {
    alertId: job.data.alertId, priority: job.data.priority,
  });
}
