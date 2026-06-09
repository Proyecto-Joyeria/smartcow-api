import type { Request, Response, NextFunction } from 'express';

import { gpsService } from '@gps/gps.service';
import { LocationHistoryQuerySchema, VitalHistoryQuerySchema } from '@gps/gps.schemas';

// Rango temporal por defecto cuando el cliente no envía ?from=&to=
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000; // últimas 24h

function resolveRange(fromRaw?: string, toRaw?: string): { from: Date; to: Date } {
  const to   = toRaw   ? new Date(toRaw)   : new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - DEFAULT_RANGE_MS);
  return { from, to };
}

export const GpsController = {

  /**
   * GET /animals/:id/location
   * Posición actual desde Redis (fallback PostgreSQL).
   */
  async getCurrentLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }   = req.params as { id: string };
      const location = await gpsService.getCurrentLocation(id, req.user!.farmId);
      res.status(200).json({ data: location });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /animals/:id/history?from=&to=
   * Histórico de posiciones GPS en un rango temporal.
   */
  async getLocationHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }       = req.params as { id: string };
      const query        = LocationHistoryQuerySchema.parse(req.query);
      const { from, to } = resolveRange(query.from, query.to);
      const points       = await gpsService.getLocationHistory(id, req.user!.farmId, from, to);
      res.status(200).json({ data: points });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /animals/:id/vitals?from=&to=&resolution=raw|hour|day
   * Histórico de signos vitales, opcionalmente agregado por hora o día.
   */
  async getVitalHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }       = req.params as { id: string };
      const query        = VitalHistoryQuerySchema.parse(req.query);
      const { from, to } = resolveRange(query.from, query.to);
      const records      = await gpsService.getVitalHistory(
        id, req.user!.farmId, from, to, query.resolution,
      );
      res.status(200).json({ data: records });
    } catch (err) {
      next(err);
    }
  },
};
