import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// Validación Zod del módulo Geofence — Sprint 4
// ═══════════════════════════════════════════════════════════════════════════════

/** Un vértice del polígono. Rangos WGS84 estrictos. */
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Polígono: array de vértices { lat, lng }.
 * Mínimo 3 (un triángulo) y máximo 50 vértices, según SmartCow_DataModel §3.8.
 */
export const PolygonSchema = z
  .array(LatLngSchema)
  .min(3, 'El polígono requiere al menos 3 vértices')
  .max(50, 'El polígono no puede superar 50 vértices');

/** Color hexadecimal de 7 caracteres: #RRGGBB. */
const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal #RRGGBB');

// ── CreateGeofenceSchema ─────────────────────────────────────────────────────

export const CreateGeofenceSchema = z.object({
  name:        z.string().min(1, 'El nombre es requerido').max(100),
  description: z.string().max(2000).optional(),
  polygon:     PolygonSchema,
  color:       ColorSchema.optional(),
  active:      z.boolean().optional(),
});

export type CreateGeofenceDto = z.infer<typeof CreateGeofenceSchema>;

// ── UpdateGeofenceSchema ─────────────────────────────────────────────────────
// Todos los campos opcionales; al menos uno requerido.

export const UpdateGeofenceSchema = z
  .object({
    name:        z.string().min(1).max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
    polygon:     PolygonSchema.optional(),
    color:       ColorSchema.optional(),
    active:      z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

export type UpdateGeofenceDto = z.infer<typeof UpdateGeofenceSchema>;

// ── GeofenceQuerySchema ──────────────────────────────────────────────────────

export const GeofenceQuerySchema = z.object({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type GeofenceQueryDto = z.infer<typeof GeofenceQuerySchema>;
