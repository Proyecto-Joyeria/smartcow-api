import type { Request, Response, NextFunction } from 'express';

import { alertService, type RequestAudit } from '@alerts/alerts.service';
import { AlertQuerySchema, AssignAlertSchema, CloseAlertSchema } from '@alerts/alerts.schemas';

/** Extrae el contexto de auditoría (IP + user agent) de la petición. */
function auditOf(req: Request): RequestAudit {
  return { ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

export const AlertController = {

  /** GET /alerts — Centro de alertas (filtros + paginación). */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query  = AlertQuerySchema.parse(req.query);
      const result = await alertService.findAll(req.user!.farmId, query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** GET /alerts/:id — detalle con historial de acciones. */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }  = req.params as { id: string };
      const alert   = await alertService.findById(id, req.user!.farmId);
      res.status(200).json({ data: alert });
    } catch (err) {
      next(err);
    }
  },

  /** POST /alerts/:id/acknowledge */
  async acknowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const alert  = await alertService.acknowledge(id, req.user!.farmId, req.user!.userId, auditOf(req));
      res.status(200).json({ data: alert });
    } catch (err) {
      next(err);
    }
  },

  /** POST /alerts/:id/assign — body { assigneeId } */
  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }         = req.params as { id: string };
      const { assigneeId } = AssignAlertSchema.parse(req.body);
      const alert = await alertService.assign(id, req.user!.farmId, req.user!.userId, assigneeId, auditOf(req));
      res.status(200).json({ data: alert });
    } catch (err) {
      next(err);
    }
  },

  /** POST /alerts/:id/close — body { resolution } */
  async close(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }         = req.params as { id: string };
      const { resolution } = CloseAlertSchema.parse(req.body);
      const alert = await alertService.close(id, req.user!.farmId, req.user!.userId, resolution, auditOf(req));
      res.status(200).json({ data: alert });
    } catch (err) {
      next(err);
    }
  },
};
