import { Router } from 'express';

import { authenticate } from '@common/middleware/authenticate.middleware';
import { authorize } from '@common/guards/authorize.guard';
import { GeofenceController } from '@geofence/geofence.controller';

const router = Router();

// ── Lectura ──────────────────────────────────────────────────────────────────
// Cualquier rol autenticado (incl. OPERATOR) puede ver las geocercas del mapa.

router.get(
  '/',
  authenticate,
  authorize('geofences:read'),
  GeofenceController.findAll,
);

router.get(
  '/:id',
  authenticate,
  authorize('geofences:read'),
  GeofenceController.findById,
);

// ── Escritura (ADMIN / SUPER_ADMIN) ──────────────────────────────────────────

router.post(
  '/',
  authenticate,
  authorize('geofences:write'),
  GeofenceController.create,
);

router.patch(
  '/:id',
  authenticate,
  authorize('geofences:write'),
  GeofenceController.update,
);

router.delete(
  '/:id',
  authenticate,
  authorize('geofences:delete'),
  GeofenceController.remove,
);

export { router as geofenceRouter };
