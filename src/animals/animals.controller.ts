import type { Request, Response, NextFunction } from 'express';

import { animalService } from '@animals/animals.service';
import { CreateAnimalSchema, UpdateAnimalSchema, AnimalQuerySchema } from '@animals/animals.schemas';
import { AppError } from '@common/utils/app-error';

export const AnimalController = {

  /**
   * GET /animals
   * Query: page, pageSize, search, breed, sex, status, healthStatus, sortBy, sortOrder
   */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmId = req.user!.farmId;
      const query  = AnimalQuerySchema.parse(req.query);
      const result = await animalService.findAll(farmId, query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /animals/:id
   */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const animal = await animalService.findById(id, req.user!.farmId);
      res.status(200).json({ data: animal });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /animals
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto    = CreateAnimalSchema.parse(req.body);
      const animal = await animalService.create(dto, req.user!.farmId);
      res.status(201).json({ data: animal });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /animals/:id
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const dto    = UpdateAnimalSchema.parse(req.body);
      const animal = await animalService.update(id, req.user!.farmId, dto);
      res.status(200).json({ data: animal });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /animals/:id  — soft delete
   */
  async softDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      await animalService.softDelete(id, req.user!.farmId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /animals/import  — multipart/form-data, campo "file"
   */
  async importCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Se requiere un archivo CSV (campo "file")');
      }
      const result = await animalService.importFromCsv(req.file.buffer, req.user!.farmId);

      // Si hay errores de validación devolver 422 con el detalle
      if (result.errors.length > 0) {
        res.status(422).json({
          statusCode: 422,
          error:      'VALIDATION_ERROR',
          message:    `Importación rechazada: ${result.errors.length} fila(s) con errores`,
          details:    result.errors,
        });
        return;
      }

      res.status(200).json({ data: { total: result.imported, inserted: result.imported, errors: [] } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /animals/export?format=csv|xlsx
   */
  async exportAnimals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const format = req.query['format'] === 'xlsx' ? 'xlsx' : 'csv';

      if (format === 'xlsx') {
        const buffer = await animalService.exportToXlsx(req.user!.farmId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="animales.xlsx"');
        res.status(200).send(buffer);
      } else {
        const buffer = await animalService.exportToCsv(req.user!.farmId);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="animales.csv"');
        res.status(200).send(buffer);
      }
    } catch (err) {
      next(err);
    }
  },

  // GPS y vitales (location / history / vitals) los maneja GpsController en el
  // módulo @gps — ver animals.router.ts.
};
