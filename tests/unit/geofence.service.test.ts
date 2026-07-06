import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (antes de importar el servicio) ──────────────────────────────────────

vi.mock('@geofence/geofence.repository', () => ({
  geofenceRepository: {
    create:         vi.fn(),
    findById:       vi.fn(),
    findAll:        vi.fn(),
    findActive:     vi.fn(),
    update:         vi.fn(),
    delete:         vi.fn(),
    countOpenAlerts: vi.fn(),
  },
}));

vi.mock('@redis/redis.service', () => ({
  cacheFarmGeofences:      vi.fn(),
  getCachedFarmGeofences:  vi.fn(),
  invalidateFarmGeofences: vi.fn(),
}));

import { geofenceService } from '@geofence/geofence.service';
import { geofenceRepository } from '@geofence/geofence.repository';
import {
  cacheFarmGeofences,
  getCachedFarmGeofences,
  invalidateFarmGeofences,
} from '@redis/redis.service';
import type { Geofence } from '@geofence/geofence.types';

const FARM_ID = 'farm-1';
const USER_ID = 'user-1';

const SAMPLE: Geofence = {
  id: 'gf-1', farmId: FARM_ID, name: 'Potrero Norte', description: null,
  polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }],
  color: '#1a7a4a', active: true, createdBy: USER_ID,
  createdAt: new Date(), updatedAt: new Date(),
};

describe('GeofenceService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crea la geocerca e invalida la cache de la finca', async () => {
    vi.mocked(geofenceRepository.create).mockResolvedValue(SAMPLE);

    const result = await geofenceService.create(
      { name: 'Potrero Norte', polygon: SAMPLE.polygon }, FARM_ID, USER_ID,
    );

    expect(result.id).toBe('gf-1');
    expect(geofenceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ farmId: FARM_ID, createdBy: USER_ID }),
    );
    expect(invalidateFarmGeofences).toHaveBeenCalledWith(FARM_ID);
  });
});

describe('GeofenceService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lanza 404 si la geocerca no existe', async () => {
    vi.mocked(geofenceRepository.findById).mockResolvedValue(null);
    await expect(geofenceService.update('x', FARM_ID, { name: 'y' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(invalidateFarmGeofences).not.toHaveBeenCalled();
  });

  it('actualiza e invalida la cache', async () => {
    vi.mocked(geofenceRepository.findById).mockResolvedValue(SAMPLE);
    vi.mocked(geofenceRepository.update).mockResolvedValue({ ...SAMPLE, name: 'Nuevo' });

    const result = await geofenceService.update('gf-1', FARM_ID, { name: 'Nuevo' });

    expect(result.name).toBe('Nuevo');
    expect(invalidateFarmGeofences).toHaveBeenCalledWith(FARM_ID);
  });
});

describe('GeofenceService.delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lanza 409 si la geocerca tiene alertas abiertas', async () => {
    vi.mocked(geofenceRepository.findById).mockResolvedValue(SAMPLE);
    vi.mocked(geofenceRepository.countOpenAlerts).mockResolvedValue(3);

    await expect(geofenceService.delete('gf-1', FARM_ID))
      .rejects.toMatchObject({ statusCode: 409, errorCode: 'CONFLICT' });

    expect(geofenceRepository.delete).not.toHaveBeenCalled();
    expect(invalidateFarmGeofences).not.toHaveBeenCalled();
  });

  it('elimina e invalida la cache cuando no hay alertas abiertas', async () => {
    vi.mocked(geofenceRepository.findById).mockResolvedValue(SAMPLE);
    vi.mocked(geofenceRepository.countOpenAlerts).mockResolvedValue(0);
    vi.mocked(geofenceRepository.delete).mockResolvedValue();

    await geofenceService.delete('gf-1', FARM_ID);

    expect(geofenceRepository.delete).toHaveBeenCalledWith('gf-1', FARM_ID);
    expect(invalidateFarmGeofences).toHaveBeenCalledWith(FARM_ID);
  });
});

describe('GeofenceService.getActiveForEvaluation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve la cache Redis sin tocar PostgreSQL si hay hit', async () => {
    const cached = [{ id: 'gf-1', name: 'P', color: '#1a7a4a', polygon: SAMPLE.polygon }];
    vi.mocked(getCachedFarmGeofences).mockResolvedValue(cached);

    const result = await geofenceService.getActiveForEvaluation(FARM_ID);

    expect(result).toEqual(cached);
    expect(geofenceRepository.findActive).not.toHaveBeenCalled();
  });

  it('cache miss → consulta PostgreSQL y repuebla la cache', async () => {
    vi.mocked(getCachedFarmGeofences).mockResolvedValue(null);
    vi.mocked(geofenceRepository.findActive).mockResolvedValue([SAMPLE]);

    const result = await geofenceService.getActiveForEvaluation(FARM_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'gf-1', name: 'Potrero Norte', color: '#1a7a4a', polygon: SAMPLE.polygon });
    expect(cacheFarmGeofences).toHaveBeenCalledWith(FARM_ID, result);
  });
});
