import { logger } from '@common/utils/logger';
import type { EmailMessage } from '@notifications/notification.types';

// ═══════════════════════════════════════════════════════════════════════════════
// Proveedor SendGrid (email) — Sprint 5
//
// Se usa la API REST vía fetch nativo (Node 20+) — no se agrega el SDK como
// dependencia. Contrato según IDD §8.1: POST https://api.sendgrid.com/v3/mail/send
// con Authorization: Bearer {SENDGRID_API_KEY}.
//
// Si la API key no está configurada (entorno de dev sin credenciales reales), el
// proveedor NO lanza: registra y omite. Así el pipeline de alertas funciona sin
// credenciales externas.
// ═══════════════════════════════════════════════════════════════════════════════

const SENDGRID_API_URL   = 'https://api.sendgrid.com/v3/mail/send';
const SENDGRID_API_KEY    = process.env['SENDGRID_API_KEY']    ?? '';
const SENDGRID_FROM_EMAIL = process.env['SENDGRID_FROM_EMAIL'] ?? 'alertas@smartcow.app';
const SENDGRID_FROM_NAME  = process.env['SENDGRID_FROM_NAME']  ?? 'SmartCow Tracker';
const REQUEST_TIMEOUT_MS  = 10_000;

function isConfigured(): boolean {
  return SENDGRID_API_KEY.length > 0 && !SENDGRID_API_KEY.startsWith('SG.your');
}

/**
 * Envía un email transaccional. Devuelve true si SendGrid lo aceptó (2xx).
 * Lanza en 5xx para que Bull MQ reintente (IDD §8.1); en 4xx no reintenta.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn('SendGrid: no configurado — email omitido', { to: msg.to, subject: msg.subject });
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(SENDGRID_API_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from:    { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
        subject: msg.subject,
        content: [{ type: 'text/plain', value: msg.body }],
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      logger.info('SendGrid: email enviado', { to: msg.to, subject: msg.subject });
      return true;
    }

    // 5xx → reintentar (throw); 4xx → error permanente (log + false)
    if (res.status >= 500) {
      throw new Error(`SendGrid 5xx: ${res.status}`);
    }
    logger.error('SendGrid: error permanente', { status: res.status, to: msg.to });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
