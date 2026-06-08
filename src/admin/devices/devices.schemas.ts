import { z } from 'zod';

// ── CreateDeviceSchema ─────────────────────────────────────────────────────────

export const CreateDeviceSchema = z.object({
  serialNumber:    z.string().min(1).max(50, 'Número de serie máx 50 caracteres'),
  firmwareVersion: z.string().min(1).max(20, 'Versión de firmware máx 20 caracteres'),
  certFingerprint: z.string().max(500).optional(),
  certExpiresAt:   z.string().datetime({ offset: true }).optional(),
  batteryPct:      z.number().int().min(0).max(100).optional(),
});

export type CreateDeviceDto = z.infer<typeof CreateDeviceSchema>;

// ── UpdateDeviceSchema ─────────────────────────────────────────────────────────

export const UpdateDeviceSchema = z
  .object({
    firmwareVersion: z.string().min(1).max(20).optional(),
    certFingerprint: z.string().max(500).optional(),
    certExpiresAt:   z.string().datetime({ offset: true }).optional(),
    batteryPct:      z.number().int().min(0).max(100).optional(),
    isActive:        z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Se requiere al menos un campo para actualizar' },
  );

export type UpdateDeviceDto = z.infer<typeof UpdateDeviceSchema>;

// ── AssignDeviceSchema ─────────────────────────────────────────────────────────

export const AssignDeviceSchema = z.object({
  animalId: z.string().min(1, 'El animalId es requerido'),
});

export type AssignDeviceDto = z.infer<typeof AssignDeviceSchema>;

// ── DeviceQuerySchema ──────────────────────────────────────────────────────────

export const DeviceQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  animalId: z.string().optional(),
});

export type DeviceQueryDto = z.infer<typeof DeviceQuerySchema>;
