import type { Request, Response, NextFunction } from 'express';

import { deviceService } from '@admin/devices/devices.service';
import {
  CreateDeviceSchema,
  UpdateDeviceSchema,
  AssignDeviceSchema,
  DeviceQuerySchema,
} from '@admin/devices/devices.schemas';

export const DeviceController = {

  /**
   * GET /admin/devices
   */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmId = req.user!.farmId;
      const query  = DeviceQuerySchema.parse(req.query);
      const result = await deviceService.findAll(farmId, query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /admin/devices/:id
   */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const device = await deviceService.findById(id, req.user!.farmId);
      res.status(200).json({ data: device });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/devices
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto    = CreateDeviceSchema.parse(req.body);
      const device = await deviceService.create(dto, req.user!.farmId);
      res.status(201).json({ data: device });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /admin/devices/:id
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const dto    = UpdateDeviceSchema.parse(req.body);
      const device = await deviceService.update(id, req.user!.farmId, dto);
      res.status(200).json({ data: device });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/devices/:id/assign
   * Body: { animalId }
   */
  async assignToAnimal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const dto    = AssignDeviceSchema.parse(req.body);
      const device = await deviceService.assignToAnimal(id, req.user!.farmId, dto);
      res.status(200).json({ data: device });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/devices/:id/unassign
   */
  async unassignFromAnimal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const device = await deviceService.unassignFromAnimal(id, req.user!.farmId);
      res.status(200).json({ data: device });
    } catch (err) {
      next(err);
    }
  },
};
