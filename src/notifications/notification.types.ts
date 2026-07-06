// ═══════════════════════════════════════════════════════════════════════════════
// Tipos del módulo de Notificaciones — Sprint 5
// ═══════════════════════════════════════════════════════════════════════════════

import type { AlertPriority } from '@prisma/client';

/** Canales de salida derivados de la prioridad de la alerta (SDD §3.4.2). */
export interface NotificationChannels {
  email: boolean;
  sms:   boolean;
}

/**
 * Política de canales por prioridad:
 *   CRITICAL → web + email + SMS
 *   WARNING  → web + email
 *   INFO     → solo web (sin salida externa)
 * (El canal "web" es el evento WebSocket alert:new, que se emite siempre aparte.)
 */
export function channelsForPriority(priority: AlertPriority): NotificationChannels {
  switch (priority) {
    case 'CRITICAL': return { email: true,  sms: true  };
    case 'WARNING':  return { email: true,  sms: false };
    case 'INFO':     return { email: false, sms: false };
    default:         return { email: false, sms: false };
  }
}

/** Destinatario de notificaciones dentro de una finca. */
export interface Recipient {
  userId: string;
  email:  string;
  phone:  string | null;
}

export interface EmailMessage {
  to:      string;
  subject: string;
  body:    string;
}

export interface SmsMessage {
  to:   string;   // E.164
  body: string;
}
