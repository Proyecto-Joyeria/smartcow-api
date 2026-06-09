import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '@common/middleware/authenticate.middleware';
import { authorize } from '@common/guards/authorize.guard';
import { AnimalController } from '@animals/animals.controller';
import { GpsController } from '@gps/gps.controller';

const router = Router();

// multer con almacenamiento en memoria — el buffer llega al controller
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB máx
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos CSV'));
    }
  },
});

// ── Rutas especiales (deben ir ANTES de /:id para no colisionar) ──────────────

router.post(
  '/import',
  authenticate,
  authorize('animals:write'),
  upload.single('file'),
  AnimalController.importCsv,
);

router.get(
  '/export',
  authenticate,
  authorize('animals:write'),
  AnimalController.exportAnimals,
);

// ── CRUD principal ─────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticate,
  authorize('animals:read'),
  AnimalController.findAll,
);

router.post(
  '/',
  authenticate,
  authorize('animals:write'),
  AnimalController.create,
);

router.get(
  '/:id',
  authenticate,
  authorize('animals:read'),
  AnimalController.findById,
);

router.patch(
  '/:id',
  authenticate,
  authorize('animals:write'),
  AnimalController.update,
);

router.delete(
  '/:id',
  authenticate,
  authorize('animals:write'),
  AnimalController.softDelete,
);

// ── GPS y vitales (Sprint 3 — delegados al módulo @gps) ───────────────────────

/** Posición actual desde Redis (fallback PostgreSQL) */
router.get(
  '/:id/location',
  authenticate,
  authorize('animals:read'),
  GpsController.getCurrentLocation,
);

/** Histórico de posiciones GPS (?from=&to=) */
router.get(
  '/:id/history',
  authenticate,
  authorize('animals:read'),
  GpsController.getLocationHistory,
);

/** Histórico de signos vitales (?from=&to=&resolution=raw|hour|day) */
router.get(
  '/:id/vitals',
  authenticate,
  authorize('animals:read'),
  GpsController.getVitalHistory,
);

export { router as animalsRouter };
