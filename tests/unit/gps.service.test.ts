import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (declarados ANTES de importar el servicio bajo prueba) ───────────────

// vi.hoisted permite referenciar estos mocks dentro de las factories de vi.mock,
// que Vitest eleva por encima de los imports.
const { addPersistMock, addEvaluateMock } = vi.hoisted(() => ({
  addPersistMock:  vi.fn(),
  addEvaluateMock: vi.fn(),
}));

vi.mock('@redis/redis.service', () => ({
  setAnimalPosition:      vi.fn(),
  getAnimalPosition:      vi.fn(),
  publishGpsEvent:        vi.fn(),
  cacheDeviceRouting:     vi.fn(),
  getCachedDeviceRouting: vi.fn(),
}));

vi.mock('@gps/gps.repository', () => ({
  gpsRepository: {
    getDeviceRouting:   vi.fn(),
    getLatestGpsPoint:  vi.fn(),
    getLocationHistory: vi.fn(),
    getVitalHistory:    vi.fn(),
  },
}));

vi.mock('@workers/queues', () => ({
  getPersistGpsQueue:     vi.fn(() => ({ add: addPersistMock })),
  getEvaluateAlertsQueue: vi.fn(() => ({ add: addEvaluateMock })),
}));

import { gpsService } from '@gps/gps.service';
import { gpsRepository } from '@gps/gps.repository';
import {
  setAnimalPosition,
  getAnimalPosition,
  publishGpsEvent,
  cacheDeviceRouting,
  getCachedDeviceRouting,
} from '@redis/redis.service';

// ── Datos de prueba ─────────────────────────────────────────────────────────────

const ANIMAL_ID = 'animal-test-001';
const FARM_ID   = 'farm-test-001';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    d:  DEVICE_ID,
    ts: 1748390400000,
    la: 4.7109,
    lo: -74.0721,
    al: 2600,
    ac: 5,
    sp: 0.5,
    tp: 384,   // 38.4°C
    hr: 62,
    ax: 75,
    bt: 87,
    fv: '1.2.0',
    ...overrides,
  };
}

// ── processTelemetry ────────────────────────────────────────────────────────────

describe('GPSService.processTelemetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ejecuta los 7 pasos del pipeline con un payload válido (cache miss)', async () => {
    vi.mocked(getCachedDeviceRouting).mockResolvedValue(null); // cache miss
    vi.mocked(gpsRepository.getDeviceRouting).mockResolvedValue({ animalId: ANIMAL_ID, farmId: FARM_ID });

    await gpsService.processTelemetry(validPayload());

    // Paso 3: resolución por PostgreSQL + cacheo
    expect(gpsRepository.getDeviceRouting).toHaveBeenCalledWith(DEVICE_ID);
    expect(cacheDeviceRouting).toHaveBeenCalledWith(DEVICE_ID, ANIMAL_ID, FARM_ID);

    // Paso 4: posición en Redis
    expect(setAnimalPosition).toHaveBeenCalledWith(ANIMAL_ID, FARM_ID, 4.7109, -74.0721, 1748390400000, 0.5);

    // Paso 5: pub/sub
    expect(publishGpsEvent).toHaveBeenCalledWith(FARM_ID, {
      animalId: ANIMAL_ID, lat: 4.7109, lng: -74.0721, ts: 1748390400000, speed: 0.5,
    });

    // Pasos 6 + 7: encolado en ambas colas
    expect(addPersistMock).toHaveBeenCalledOnce();
    expect(addEvaluateMock).toHaveBeenCalledOnce();

    // La temperatura se convierte de ×10 a °C en el job de persistencia
    const jobData = addPersistMock.mock.calls[0]?.[1] as { vitals: { tempC: number } };
    expect(jobData.vitals.tempC).toBe(38.4);
  });

  it('usa la cache Redis y no consulta PostgreSQL cuando hay routing cacheado', async () => {
    vi.mocked(getCachedDeviceRouting).mockResolvedValue({ animalId: ANIMAL_ID, farmId: FARM_ID });

    await gpsService.processTelemetry(validPayload());

    expect(gpsRepository.getDeviceRouting).not.toHaveBeenCalled();
    expect(cacheDeviceRouting).not.toHaveBeenCalled();
    expect(setAnimalPosition).toHaveBeenCalledOnce();
  });

  it('lanza AppError 400 cuando el payload es inválido (latitud fuera de rango)', async () => {
    await expect(
      gpsService.processTelemetry(validPayload({ la: 200 })),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'VALIDATION_ERROR' });

    // No debe tocar Redis ni encolar nada si la validación falla
    expect(setAnimalPosition).not.toHaveBeenCalled();
    expect(addPersistMock).not.toHaveBeenCalled();
  });

  it('lanza AppError 404 cuando el device no está registrado ni asignado', async () => {
    vi.mocked(getCachedDeviceRouting).mockResolvedValue(null);
    vi.mocked(gpsRepository.getDeviceRouting).mockResolvedValue(null);

    await expect(
      gpsService.processTelemetry(validPayload()),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'NOT_FOUND' });

    expect(setAnimalPosition).not.toHaveBeenCalled();
  });
});

// ── getCurrentLocation ──────────────────────────────────────────────────────────

describe('GPSService.getCurrentLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve la posición desde Redis cuando existe y la finca coincide', async () => {
    vi.mocked(getAnimalPosition).mockResolvedValue({
      animalId: ANIMAL_ID, farmId: FARM_ID, lat: 4.71, lng: -74.07, ts: 1748390400000, speed: 1.2,
    });

    const result = await gpsService.getCurrentLocation(ANIMAL_ID, FARM_ID);

    expect(result.source).toBe('redis');
    expect(result.lat).toBe(4.71);
    expect(gpsRepository.getLatestGpsPoint).not.toHaveBeenCalled();
  });

  it('hace fallback a PostgreSQL cuando Redis no tiene la posición', async () => {
    vi.mocked(getAnimalPosition).mockResolvedValue(null);
    vi.mocked(gpsRepository.getLatestGpsPoint).mockResolvedValue({
      lat: 4.72, lng: -74.08, alt: 2600, accuracy: 5, speedKmh: 0, recordedAt: new Date(1748390400000),
    });

    const result = await gpsService.getCurrentLocation(ANIMAL_ID, FARM_ID);

    expect(result.source).toBe('postgres');
    expect(result.lat).toBe(4.72);
    expect(gpsRepository.getLatestGpsPoint).toHaveBeenCalledWith(ANIMAL_ID, FARM_ID);
  });

  it('hace fallback a PostgreSQL cuando la posición en Redis es de otra finca', async () => {
    vi.mocked(getAnimalPosition).mockResolvedValue({
      animalId: ANIMAL_ID, farmId: 'otra-finca', lat: 9.9, lng: 9.9, ts: 1, speed: 0,
    });
    vi.mocked(gpsRepository.getLatestGpsPoint).mockResolvedValue({
      lat: 4.72, lng: -74.08, alt: null, accuracy: null, speedKmh: null, recordedAt: new Date(1748390400000),
    });

    const result = await gpsService.getCurrentLocation(ANIMAL_ID, FARM_ID);

    expect(result.source).toBe('postgres');
    expect(gpsRepository.getLatestGpsPoint).toHaveBeenCalledWith(ANIMAL_ID, FARM_ID);
  });

  it('lanza AppError 404 cuando no hay datos en Redis ni en PostgreSQL', async () => {
    vi.mocked(getAnimalPosition).mockResolvedValue(null);
    vi.mocked(gpsRepository.getLatestGpsPoint).mockResolvedValue(null);

    await expect(
      gpsService.getCurrentLocation(ANIMAL_ID, FARM_ID),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'NOT_FOUND' });
  });
});
