import { Router } from 'express';

import { authenticate } from '@common/middleware/authenticate.middleware';
import { authorize } from '@common/guards/authorize.guard';
import { AlertController } from '@alerts/alerts.controller';

const router = Router();

// ── Lectura ──────────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticate,
  authorize('alerts:read'),
  AlertController.findAll,
);

router.get(
  '/:id',
  authenticate,
  authorize('alerts:read'),
  AlertController.findById,
);

// ── Ciclo de vida ────────────────────────────────────────────────────────────

router.post(
  '/:id/acknowledge',
  authenticate,
  authorize('alerts:acknowledge'),
  AlertController.acknowledge,
);

router.post(
  '/:id/assign',
  authenticate,
  authorize('alerts:assign'),
  AlertController.assign,
);

router.post(
  '/:id/close',
  authenticate,
  authorize('alerts:close'),
  AlertController.close,
);

export { router as alertsRouter };
