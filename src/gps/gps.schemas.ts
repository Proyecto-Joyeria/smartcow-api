import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// Validación Zod del módulo GPS — Sprint 3
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida el payload IoT crudo recibido por MQTT con los rangos físicos exactos
 * de cada sensor. Cualquier valor fuera de rango se rechaza ANTES de tocar Redis
 * o encolar trabajo — un sensor que reporta basura no contamina el sistema.
 */
export const IoTTelemetrySchema = z.object({
  // Identidad y tiempo
  d:  z.string().uuid('deviceId debe ser un UUID válido'),
  ts: z.number().int().positive('ts debe ser un timestamp unix ms positivo'),

  // Posición GPS
  la: z.number().min(-90,  'latitud fuera de rango').max(90,  'latitud fuera de rango'),
  lo: z.number().min(-180, 'longitud fuera de rango').max(180, 'longitud fuera de rango'),
  al: z.number().optional(),                                  // altitud: sin rango estricto
  ac: z.number().min(0).max(50).optional(),                  // accuracy en metros
  sp: z.number().min(0).max(200).optional(),                 // speed en km/h

  // Signos vitales
  tp: z.number().int().min(350).max(420),  // temperatura × 10 → 35.0°C a 42.0°C
  hr: z.number().int().min(20).max(200),   // ritmo cardíaco bpm
  ax: z.number().int().min(0).max(100),    // índice de actividad
  bt: z.number().int().min(0).max(100),    // batería %

  // Metadatos
  fv: z.string().min(1).max(20),           // versión de firmware
});

export type IoTTelemetryInput = z.infer<typeof IoTTelemetrySchema>;

// ── Query params de los endpoints de histórico ─────────────────────────────────

/** Rango temporal para GET /animals/:id/history (?from=&to=) */
export const LocationHistoryQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to:   z.string().datetime({ offset: true }).optional(),
});

export type LocationHistoryQuery = z.infer<typeof LocationHistoryQuerySchema>;

/** Rango temporal + resolución para GET /animals/:id/vitals (?from=&to=&resolution=) */
export const VitalHistoryQuerySchema = z.object({
  from:       z.string().datetime({ offset: true }).optional(),
  to:         z.string().datetime({ offset: true }).optional(),
  resolution: z.enum(['raw', 'hour', 'day']).optional().default('raw'),
});

export type VitalHistoryQuery = z.infer<typeof VitalHistoryQuerySchema>;
