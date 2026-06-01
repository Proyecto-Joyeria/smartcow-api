import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '@common/utils/app-error';
import { logger } from '@common/utils/logger';

/**
 * Middleware global de manejo de errores — debe registrarse ÚLTIMO en app.ts.
 *
 * Convierte cualquier error al formato estándar de la API:
 * { statusCode, error, message, details, requestId, timestamp }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // ── 1. AppError — error de dominio esperado ──────────────────────────────
  if (err instanceof AppError) {
    logger.warn('AppError', {
      requestId,
      statusCode: err.statusCode,
      errorCode:  err.errorCode,
      message:    err.message,
      path:       req.path,
      method:     req.method,
    });

    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error:      err.errorCode,
      message:    err.message,
      details:    err.details,
      requestId,
      timestamp,
    });
    return;
  }

  // ── 2. ZodError — fallo de validación de DTO ─────────────────────────────
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field:   e.path.join('.'),
      message: e.message,
    }));

    logger.warn('ValidationError', { requestId, path: req.path, details });

    res.status(400).json({
      statusCode: 400,
      error:      'VALIDATION_ERROR',
      message:    'Los datos enviados no son válidos',
      details,
      requestId,
      timestamp,
    });
    return;
  }

  // ── 3. Prisma — errores de base de datos conocidos ───────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint violation
    if (err.code === 'P2002') {
      const fields = (err.meta?.['target'] as string[] | undefined)?.join(', ') ?? 'campo';
      logger.warn('PrismaUniqueConstraint', { requestId, code: err.code, fields });

      res.status(409).json({
        statusCode: 409,
        error:      'CONFLICT',
        message:    `Ya existe un registro con el mismo ${fields}`,
        details:    null,
        requestId,
        timestamp,
      });
      return;
    }

    // P2025: registro no encontrado (ej: update/delete sobre ID inexistente)
    if (err.code === 'P2025') {
      logger.warn('PrismaRecordNotFound', { requestId, code: err.code });

      res.status(404).json({
        statusCode: 404,
        error:      'NOT_FOUND',
        message:    'El recurso solicitado no existe',
        details:    null,
        requestId,
        timestamp,
      });
      return;
    }
  }

  // ── 4. Error inesperado — bug del sistema ─────────────────────────────────
  const message = err instanceof Error ? err.message : 'Error desconocido';
  const stack   = err instanceof Error ? err.stack   : undefined;

  logger.error('UnhandledError', {
    requestId,
    message,
    stack,
    path:   req.path,
    method: req.method,
  });

  res.status(500).json({
    statusCode: 500,
    error:      'INTERNAL_ERROR',
    message:    'Ha ocurrido un error interno. Por favor intenta de nuevo.',
    details:    null,
    requestId,
    timestamp,
  });
}
