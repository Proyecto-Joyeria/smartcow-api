import { z } from 'zod';
import { Breed, Sex, AnimalStatus, HealthStatus, ReproductiveStatus } from '@prisma/client';

// ── Enums Zod (derivados de Prisma para mantener única fuente de verdad) ────────

export const BreedSchema             = z.nativeEnum(Breed);
export const SexSchema               = z.nativeEnum(Sex);
export const AnimalStatusSchema      = z.nativeEnum(AnimalStatus);
export const HealthStatusSchema      = z.nativeEnum(HealthStatus);
export const ReproductiveStatusSchema = z.nativeEnum(ReproductiveStatus);

// ── Código de animal ───────────────────────────────────────────────────────────
// Solo mayúsculas, dígitos y guiones. Máx 30 chars. Ej: "BOV-0142", "A001"

const AnimalCodeSchema = z
  .string()
  .min(1, 'El código es requerido')
  .max(30, 'El código no puede superar 30 caracteres')
  .regex(/^[A-Z0-9-]+$/, 'El código solo puede contener mayúsculas, números y guiones');

// ── CreateAnimalSchema ─────────────────────────────────────────────────────────

export const CreateAnimalSchema = z.object({
  code:               AnimalCodeSchema,
  name:               z.string().max(100).optional(),
  breed:              BreedSchema,
  sex:                SexSchema,
  birthDate:          z.string().datetime({ offset: true }).optional(),
  weightKg:           z.number().min(10, 'Peso mínimo 10 kg').max(2000, 'Peso máximo 2000 kg').optional(),
  photoUrl:           z.string().url('URL de foto inválida').max(500).optional(),
  areteNumber:        z.string().max(30).optional(),
  status:             AnimalStatusSchema.optional(),
  healthStatus:       HealthStatusSchema.optional(),
  reproductiveStatus: ReproductiveStatusSchema.optional(),
  notes:              z.string().max(2000).optional(),
});

export type CreateAnimalDto = z.infer<typeof CreateAnimalSchema>;

// ── UpdateAnimalSchema ─────────────────────────────────────────────────────────
// Todos los campos opcionales; al menos uno debe venir en el body

export const UpdateAnimalSchema = z
  .object({
    name:               z.string().max(100).optional(),
    breed:              BreedSchema.optional(),
    sex:                SexSchema.optional(),
    birthDate:          z.string().datetime({ offset: true }).optional(),
    weightKg:           z.number().min(10).max(2000).optional(),
    photoUrl:           z.string().url('URL de foto inválida').max(500).optional(),
    areteNumber:        z.string().max(30).optional(),
    status:             AnimalStatusSchema.optional(),
    healthStatus:       HealthStatusSchema.optional(),
    reproductiveStatus: ReproductiveStatusSchema.optional(),
    notes:              z.string().max(2000).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Se requiere al menos un campo para actualizar' },
  );

export type UpdateAnimalDto = z.infer<typeof UpdateAnimalSchema>;

// ── AnimalQuerySchema ──────────────────────────────────────────────────────────
// Query params del listado — todos llegan como strings desde Express

export const AnimalQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).optional().default(1),
  pageSize:     z.coerce.number().int().min(1).max(100).optional().default(20),
  search:       z.string().max(100).optional(),
  breed:        BreedSchema.optional(),
  sex:          SexSchema.optional(),
  status:       AnimalStatusSchema.optional(),
  healthStatus: HealthStatusSchema.optional(),
  sortBy:       z.enum(['code', 'name', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder:    z.enum(['asc', 'desc']).optional().default('desc'),
});

export type AnimalQueryDto = z.infer<typeof AnimalQuerySchema>;

// ── CsvRowSchema ───────────────────────────────────────────────────────────────
// Valida cada fila del CSV de importación masiva.
// Los headers del CSV deben coincidir exactamente con estos nombres.

export const CsvRowSchema = z.object({
  code:               AnimalCodeSchema,
  name:               z.string().max(100).optional(),
  breed:              BreedSchema,
  sex:                SexSchema,
  birthDate:          z.string().datetime({ offset: true }).optional(),
  weightKg:           z.coerce.number().min(10).max(2000).optional(),
  photoUrl:           z.string().url().max(500).optional(),
  areteNumber:        z.string().max(30).optional(),
  status:             AnimalStatusSchema.optional(),
  healthStatus:       HealthStatusSchema.optional(),
  reproductiveStatus: ReproductiveStatusSchema.optional(),
  notes:              z.string().max(2000).optional(),
});

export type CsvRowDto = z.infer<typeof CsvRowSchema>;
