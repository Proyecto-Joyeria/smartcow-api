import { logger } from '@common/utils/logger';
import type { SmsMessage } from '@notifications/notification.types';

// ═══════════════════════════════════════════════════════════════════════════════
// Proveedor Twilio (SMS) — Sprint 5
//
// API REST vía fetch nativo. Contrato IDD §8.2:
//   POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
//   Basic auth (SID:AUTH_TOKEN), body form-urlencoded (To, From, Body).
//
// No-op si no está configurado (dev sin credenciales).
// ═══════════════════════════════════════════════════════════════════════════════

const TWILIO_ACCOUNT_SID  = process.env['TWILIO_ACCOUNT_SID']  ?? '';
const TWILIO_AUTH_TOKEN   = process.env['TWILIO_AUTH_TOKEN']   ?? '';
const TWILIO_PHONE_NUMBER = process.env['TWILIO_PHONE_NUMBER'] ?? '';
const REQUEST_TIMEOUT_MS  = 10_000;

function isConfigured(): boolean {
  return (
    TWILIO_ACCOUNT_SID.startsWith('AC') &&
    TWILIO_AUTH_TOKEN.length > 0 &&
    TWILIO_PHONE_NUMBER.length > 0
  );
}

/**
 * Envía un SMS. Devuelve true si Twilio lo aceptó (2xx). Lanza en 5xx (reintento
 * de Bull MQ); 4xx → false (error permanente, ej. número inválido).
 */
export async function sendSms(msg: SmsMessage): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn('Twilio: no configurado — SMS omitido', { to: msg.to });
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: msg.to, From: TWILIO_PHONE_NUMBER, Body: msg.body });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body:   form.toString(),
      signal: controller.signal,
    });

    if (res.ok) {
      logger.info('Twilio: SMS enviado', { to: msg.to });
      return true;
    }
    if (res.status >= 500) {
      throw new Error(`Twilio 5xx: ${res.status}`);
    }
    logger.error('Twilio: error permanente', { status: res.status, to: msg.to });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
