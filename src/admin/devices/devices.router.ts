import { Router } from 'express';

import { authenticate } from '@common/middleware/authenticate.middleware';
import { authorize } from '@common/guards/authorize.guard';
import { DeviceController } from '@admin/devices/devices.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize('admin:devices'),
  DeviceController.findAll,
);

router.post(
  '/',
  authenticate,
  authorize('admin:devices'),
  DeviceController.create,
);

router.get(
  '/:id',
  authenticate,
  authorize('admin:devices'),
  DeviceController.findById,
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin:devices'),
  DeviceController.update,
);

router.post(
  '/:id/assign',
  authenticate,
  authorize('admin:devices'),
  DeviceController.assignToAnimal,
);

router.post(
  '/:id/unassign',
  authenticate,
  authorize('admin:devices'),
  DeviceController.unassignFromAnimal,
);

export { router as devicesRouter };
