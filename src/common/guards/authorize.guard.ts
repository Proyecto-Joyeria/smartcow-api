import type { Request, Response, NextFunction } from 'express';

import { AppError } from '@common/utils/app-error';
import type { Permission } from '@auth/auth.types';

/**
 * Factory de middleware RBAC. Recibe el permiso requerido y devuelve
 * un middleware que verifica que req.user lo tenga.
 *
 * Debe usarse SIEMPRE después de `authenticate`:
 *   router.get('/', authenticate, authorize('animals:read'), Controller.handler);
 *
 * @example
 * // Solo ADMIN puede crear animales
 * router.post('/', authenticate, authorize('animals:write'), AnimalController.create);
 *
 * // Cualquier rol autenticado puede ver alertas
 * router.get('/', authenticate, authorize('alerts:read'), AlertController.findAll);
 */
export function authorize(requiredPermission: Permission) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      // authenticate no se ejecutó antes — error de configuración del router
      next(new AppError(401, 'UNAUTHORIZED', 'No autenticado'));
      return;
    }

    const hasPermission = req.user.permissions.includes(requiredPermission);

    if (!hasPermission) {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          `No tienes permiso para realizar esta acción. Se requiere: ${requiredPermission}`,
        ),
      );
      return;
    }

    next();
  };
}
