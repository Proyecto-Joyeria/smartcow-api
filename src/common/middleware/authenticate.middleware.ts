import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { AppError } from '@common/utils/app-error';
import type { JwtPayload } from '@auth/auth.types';

// Las claves RSA pueden tener \n literales en el .env — normalizarlas
const JWT_PUBLIC_KEY = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');

/**
 * Middleware de autenticación JWT RS256.
 *
 * Extrae y valida el Bearer token del header Authorization.
 * Si es válido, adjunta req.user con { userId, farmId, role, permissions }.
 * Si es inválido o está ausente, pasa un AppError 401 al errorHandler.
 *
 * Uso en routers:
 *   router.get('/ruta', authenticate, authorize('recurso:accion'), Controller.handler);
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación requerido'));
    return;
  }

  const token = authHeader.slice(7); // Extraer el token después de "Bearer "

  try {
    const payload = jwt.verify(token, JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as JwtPayload;

    // Rechazar tempTokens del flujo 2FA — no son access tokens válidos
    if ('type' in payload && (payload as unknown as Record<string, unknown>)['type'] === '2fa_pending') {
      next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación inválido'));
      return;
    }

    // Adjuntar contexto del usuario al request para uso en controllers
    req.user = {
      userId:      payload.sub,
      farmId:      payload.farmId,
      role:        payload.role,
      permissions: payload.permissions,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AppError(401, 'TOKEN_EXPIRED', 'El token ha expirado. Usa /auth/refresh para renovarlo.'));
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      next(new AppError(401, 'INVALID_TOKEN', 'Token de autenticación inválido'));
      return;
    }

    next(new AppError(401, 'UNAUTHORIZED', 'Error al verificar el token'));
  }
}
