import type { Request, Response, NextFunction } from 'express';

import { geofenceService } from '@geofence/geofence.service';
import {
  CreateGeofenceSchema,
  UpdateGeofenceSchema,
  GeofenceQuerySchema,
} from '@geofence/geofence.schemas';

export const GeofenceController = {

  /** GET /geofences?active=true|false */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = GeofenceQuerySchema.parse(req.query);
      const data  = await geofenceService.findAll(req.user!.farmId, query);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  },

  /** GET /geofences/:id */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }   = req.params as { id: string };
      const geofence = await geofenceService.findById(id, req.user!.farmId);
      res.status(200).json({ data: geofence });
    } catch (err) {
      next(err);
    }
  },

  /** POST /geofences */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto      = CreateGeofenceSchema.parse(req.body);
      const geofence = await geofenceService.create(dto, req.user!.farmId, req.user!.userId);
      res.status(201).json({ data: geofence });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /geofences/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id }   = req.params as { id: string };
      const dto      = UpdateGeofenceSchema.parse(req.body);
      const geofence = await geofenceService.update(id, req.user!.farmId, dto);
      res.status(200).json({ data: geofence });
    } catch (err) {
      next(err);
    }
  },

  /** DELETE /geofences/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      await geofenceService.delete(id, req.user!.farmId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
