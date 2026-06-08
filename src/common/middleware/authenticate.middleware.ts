import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { AppError } from '@common/utils/app-error';
import { authService } from '@auth/auth.service';
import type { JwtPayload } from '@auth/auth.types';

// Las claves RSA pueden tener \n literales en el .env — normalizarlas
const JWT_PUBLIC_KEY = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');

/**
 * Middleware de autenticación JWT RS256.
 *
 * Extrae y valida el Bearer token del header Authorization.
 * Verifica además que el token no esté en la blacklist de Redis (tokens revocados por logout).
 * Si es válido, adjunta req.user con { userId, farmId, role, permissions }.
 * Si es inválido o está ausente, pasa un AppError 401 al errorHandler.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación requerido'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as JwtPayload;

    // Rechazar tempTokens del flujo 2FA — no son access tokens válidos
    if ('type' in payload && (payload as unknown as Record<string, unknown>)['type'] === '2fa_pending') {
      next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación inválido'));
      return;
    }

    // Verificar blacklist: tokens invalidados por logout explícito
    const isBlacklisted = await authService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      next(new AppError(401, 'UNAUTHORIZED', 'El token ha sido invalidado. Inicia sesión de nuevo.'));
      return;
    }

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
