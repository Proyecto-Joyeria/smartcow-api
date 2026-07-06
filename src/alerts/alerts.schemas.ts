import { z } from 'zod';
import { AlertPriority, AlertStatus } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════════════════════
// Validación Zod del módulo de Alertas — Sprint 5
// ═══════════════════════════════════════════════════════════════════════════════

export const AlertPrioritySchema = z.nativeEnum(AlertPriority);
export const AlertStatusSchema   = z.nativeEnum(AlertStatus);

/** Filtros y paginación del Centro de Alertas (GET /alerts). */
export const AlertQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  pageSize:  z.coerce.number().int().min(1).max(100).optional().default(20),
  status:    AlertStatusSchema.optional(),
  priority:  AlertPrioritySchema.optional(),
  ruleId:    z.string().max(50).optional(),
  animalId:  z.string().max(30).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type AlertQueryDto = z.infer<typeof AlertQuerySchema>;

/** POST /alerts/:id/assign */
export const AssignAlertSchema = z.object({
  assigneeId: z.string().min(1, 'assigneeId es requerido').max(30),
});

export type AssignAlertDto = z.infer<typeof AssignAlertSchema>;

/** POST /alerts/:id/close */
export const CloseAlertSchema = z.object({
  resolution: z.string().min(1, 'La nota de resolución es requerida').max(2000),
});

export type CloseAlertDto = z.infer<typeof CloseAlertSchema>;
