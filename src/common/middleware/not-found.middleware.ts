import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@common/utils/app-error';

/**
 * Middleware de ruta no encontrada — registrar ANTES del errorHandler en app.ts.
 * Captura cualquier request que no haya sido resuelto por ninguna ruta definida
 * y lo convierte en un AppError 404 estándar para que errorHandler lo formatee.
 */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError(
      404,
      'NOT_FOUND',
      `La ruta ${req.method} ${req.originalUrl} no existe`,
    ),
  );
}
