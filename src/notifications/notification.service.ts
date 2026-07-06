import { logger } from '@common/utils/logger';
import { redisIncrWithTtl } from '@redis/redis.service';
import { getNotificationsQueue, type NotificationJobData } from '@workers/queues';

import { notificationRepository } from '@notifications/notification.repository';
import { sendEmail } from '@notifications/providers/sendgrid.provider';
import { sendSms } from '@notifications/providers/twilio.provider';
import { channelsForPriority } from '@notifications/notification.types';

// ── Rate limit de SMS (Twilio) por número de teléfono ──────────────────────────
// Evita ráfagas de SMS al mismo destinatario ante alertas repetidas.
const SMS_RATE_WINDOW_SECONDS = 10 * 60; // 10 min
const SMS_RATE_MAX            = 5;        // máx. 5 SMS por número por ventana

/**
 * Encola una notificación de alerta. La invoca AlertService al crear una alerta.
 * El envío real (email/SMS) lo hace el worker `notifications` de forma asíncrona.
 */
export async function enqueueAlertNotification(job: NotificationJobData): Promise<void> {
  await getNotificationsQueue().add('notify', job);
}

/**
 * Procesa el envío de una notificación de alerta: resuelve destinatarios de la
 * finca y despacha por los canales que la prioridad habilite. La ejecuta el worker.
 *
 * Idempotencia/errores: si un canal falla de forma permanente (4xx) se registra y
 * se continúa con el resto; un 5xx se propaga para que Bull MQ reintente el job.
 */
export async function dispatchAlertNotification(job: NotificationJobData): Promise<void> {
  const channels = channelsForPriority(job.priority);
  if (!channels.email && !channels.sms) {
    logger.debug('Notificación: prioridad sin canales externos (solo web)', {
      alertId: job.alertId, priority: job.priority,
    });
    return;
  }

  const recipients = await notificationRepository.getFarmRecipients(job.farmId);
  if (recipients.length === 0) {
    logger.warn('Notificación: la finca no tiene destinatarios', { farmId: job.farmId });
    return;
  }

  const subject = `[${job.priority}] ${job.title}`;
  const body = `${job.title}\n\n${job.description}\n\nRegla: ${job.ruleId}\nAnimal: ${job.animalId}\nAlerta: ${job.alertId}`;

  for (const r of recipients) {
    if (channels.email && r.email) {
      await sendEmail({ to: r.email, subject, body });
    }
    if (channels.sms && r.phone && (await allowSms(r.phone))) {
      await sendSms({ to: r.phone, body: `${subject} — ${job.title}` });
    }
  }
}

/** Rate limit por teléfono: true si el SMS puede enviarse dentro de la ventana. */
async function allowSms(phone: string): Promise<boolean> {
  const count = await redisIncrWithTtl(`sms-rate:${phone}`, SMS_RATE_WINDOW_SECONDS);
  if (count > SMS_RATE_MAX) {
    logger.warn('Notificación: SMS rate-limit alcanzado — omitido', { phone, count });
    return false;
  }
  return true;
}
