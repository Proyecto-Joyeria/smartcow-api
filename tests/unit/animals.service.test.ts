import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock del repositorio (NUNCA BD real en tests unitarios) ───────────────────
vi.mock('@animals/animals.repository', () => ({
  animalRepository: {
    findByCode:      vi.fn(),
    create:          vi.fn(),
    createMany:      vi.fn(),
    findById:        vi.fn(),
    findAll:         vi.fn(),
    findAllForExport: vi.fn(),
    update:          vi.fn(),
    softDelete:      vi.fn(),
  },
}));

// Importar DESPUÉS del mock para que el módulo use el stub
import { animalService } from '@animals/animals.service';
import { animalRepository } from '@animals/animals.repository';
import { AppError } from '@common/utils/app-error';
import type { Animal, AnimalDetail } from '@animals/animals.types';
import { Breed, Sex, AnimalStatus, HealthStatus } from '@prisma/client';

// Mocks adicionales para export
vi.mock('papaparse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('papaparse')>();
  return { ...actual, default: { ...actual.default, unparse: vi.fn().mockReturnValue('col1,col2\nval1,val2') } };
});

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      addWorksheet: vi.fn().mockReturnValue({
        columns: [],
        getRow: vi.fn().mockReturnValue({ font: {}, fill: {}, commit: vi.fn() }),
        addRow: vi.fn(),
      }),
      xlsx: { writeBuffer: vi.fn().mockResolvedValue(Buffer.from('xlsx-content')) },
    })),
  },
}));

// ── Factories de datos de prueba ───────────────────────────────────────────────

const FARM_ID = 'farm-test-001';

function buildAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id:                 'animal-001',
    farmId:             FARM_ID,
    code:               'BOV-001',
    name:               'Estrella',
    breed:              Breed.BRAHMAN,
    sex:                Sex.F,
    birthDate:          new Date('2022-01-15'),
    weightKg:           420,
    photoUrl:           null,
    areteNumber:        'AR-001',
    status:             AnimalStatus.ACTIVE,
    healthStatus:       HealthStatus.HEALTHY,
    reproductiveStatus: null,
    notes:              null,
    deletedAt:          null,
    createdAt:          new Date('2024-01-01'),
    updatedAt:          new Date('2024-01-01'),
    ...overrides,
  };
}

function buildDetail(overrides: Partial<AnimalDetail> = {}): AnimalDetail {
  return {
    ...buildAnimal(),
    device: null,
    ...overrides,
  };
}

// ── create ─────────────────────────────────────────────────────────────────────

describe('AnimalService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crea el animal cuando el código no existe', async () => {
    vi.mocked(animalRepository.findByCode).mockResolvedValue(null);
    vi.mocked(animalRepository.create).mockResolvedValue(buildAnimal());

    const dto = {
      code:  'BOV-001',
      breed: Breed.BRAHMAN,
      sex:   Sex.F,
    };

    const result = await animalService.create(dto, FARM_ID);

    expect(animalRepository.findByCode).toHaveBeenCalledWith('BOV-001', FARM_ID);
    expect(animalRepository.create).toHaveBeenCalledWith({ ...dto, farmId: FARM_ID });
    expect(result.code).toBe('BOV-001');
  });

  it('lanza 409 CONFLICT cuando el código ya existe en la finca', async () => {
    vi.mocked(animalRepository.findByCode).mockResolvedValue(buildAnimal());

    const dto = { code: 'BOV-001', breed: Breed.BRAHMAN, sex: Sex.F };

    await expect(animalService.create(dto, FARM_ID)).rejects.toMatchObject({
      statusCode: 409,
      errorCode:  'CONFLICT',
    });

    expect(animalRepository.create).not.toHaveBeenCalled();
  });
});

// ── findById ───────────────────────────────────────────────────────────────────

describe('AnimalService.findById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve el animal cuando existe', async () => {
    vi.mocked(animalRepository.findById).mockResolvedValue(buildDetail());

    const result = await animalService.findById('animal-001', FARM_ID);

    expect(result.id).toBe('animal-001');
    expect(animalRepository.findById).toHaveBeenCalledWith('animal-001', FARM_ID);
  });

  it('lanza 404 NOT_FOUND cuando el animal no existe', async () => {
    vi.mocked(animalRepository.findById).mockResolvedValue(null);

    await expect(animalService.findById('no-existe', FARM_ID)).rejects.toMatchObject({
      statusCode: 404,
      errorCode:  'NOT_FOUND',
    });
  });

  it('no expone animales de otra finca (el repositorio filtra por farmId)', async () => {
    vi.mocked(animalRepository.findById).mockResolvedValue(null);

    await expect(
      animalService.findById('animal-001', 'otra-farm'),
    ).rejects.toThrow(AppError);
  });
});

// ── softDelete ─────────────────────────────────────────────────────────────────

describe('AnimalService.softDelete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invoca softDelete en el repositorio si el animal existe', async () => {
    vi.mocked(animalRepository.findById).mockResolvedValue(buildDetail());
    vi.mocked(animalRepository.softDelete).mockResolvedValue(undefined);

    await animalService.softDelete('animal-001', FARM_ID);

    expect(animalRepository.softDelete).toHaveBeenCalledWith('animal-001', FARM_ID);
  });

  it('lanza 404 si el animal no existe o ya fue eliminado', async () => {
    vi.mocked(animalRepository.findById).mockResolvedValue(null);

    await expect(animalService.softDelete('no-existe', FARM_ID)).rejects.toMatchObject({
      statusCode: 404,
      errorCode:  'NOT_FOUND',
    });

    expect(animalRepository.softDelete).not.toHaveBeenCalled();
  });
});

// ── importFromCsv ──────────────────────────────────────────────────────────────

describe('AnimalService.importFromCsv', () => {
  beforeEach(() => vi.clearAllMocks());

  it('importa correctamente un CSV válido', async () => {
    vi.mocked(animalRepository.findByCode).mockResolvedValue(null);
    vi.mocked(animalRepository.createMany).mockResolvedValue(2);

    const csv = [
      'code,breed,sex',
      'BOV-001,BRAHMAN,F',
      'BOV-002,HOLSTEIN,M',
    ].join('\n');

    const result = await animalService.importFromCsv(Buffer.from(csv), FARM_ID);

    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(animalRepository.createMany).toHaveBeenCalledOnce();
  });

  it('rechaza el archivo completo si hay una fila con datos inválidos', async () => {
    const csv = [
      'code,breed,sex',
      'BOV-001,BRAHMAN,F',
      'invalid code!,RAZA_INVALIDA,X', // fila 3 inválida
    ].join('\n');

    const result = await animalService.importFromCsv(Buffer.from(csv), FARM_ID);

    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.rowNumber).toBe(3);
    expect(animalRepository.createMany).not.toHaveBeenCalled();
  });

  it('rechaza si un código ya existe en la BD', async () => {
    vi.mocked(animalRepository.findByCode).mockResolvedValueOnce(buildAnimal()); // BOV-001 existe

    const csv = [
      'code,breed,sex',
      'BOV-001,BRAHMAN,F',
    ].join('\n');

    const result = await animalService.importFromCsv(Buffer.from(csv), FARM_ID);

    expect(result.imported).toBe(0);
    expect(result.errors[0]?.errors[0]).toContain('ya existe');
    expect(animalRepository.createMany).not.toHaveBeenCalled();
  });

  it('lanza AppError si el CSV está vacío', async () => {
    const csv = 'code,breed,sex\n'; // solo headers, sin datos

    await expect(
      animalService.importFromCsv(Buffer.from(csv), FARM_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode:  'VALIDATION_ERROR',
    });
  });
});

// ── findAll ────────────────────────────────────────────────────────────────────

describe('AnimalService.findAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delega al repositorio y retorna el resultado paginado', async () => {
    const paginated = {
      data: [{ id: 'a1', code: 'BOV-001' }] as AnimalSummary[],
      total: 1, page: 1, pageSize: 20, totalPages: 1, hasNextPage: false,
    };
    vi.mocked(animalRepository.findAll).mockResolvedValue(paginated);

    const result = await animalService.findAll(FARM_ID, { page: 1, pageSize: 20, sortBy: 'createdAt', sortOrder: 'desc' });

    expect(result.total).toBe(1);
    expect(animalRepository.findAll).toHaveBeenCalledWith(FARM_ID, expect.any(Object));
  });
});

// ── update ─────────────────────────────────────────────────────────────────────

describe('AnimalService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('actualiza el animal si existe', async () => {
    const updated = buildAnimal({ weightKg: 500 });
    vi.mocked(animalRepository.findById).mockResolvedValue(buildDetail());
    vi.mocked(animalRepository.update).mockResolvedValue(updated);

    const result = await animalService.update('animal-001', FARM_ID, { weightKg: 500 });

    expect(result.weightKg).toBe(500);
    expect(animalRepository.update).toHaveBeenCalledWith('animal-001', FARM_ID, { weightKg: 500 });
  });

  it('lanza 404 si el animal no existe', async () => {
    vi.mocked(animalRepository.findById).mockResolvedValue(null);

    await expect(animalService.update('no-existe', FARM_ID, { weightKg: 400 })).rejects.toMatchObject({
      statusCode: 404,
      errorCode:  'NOT_FOUND',
    });

    expect(animalRepository.update).not.toHaveBeenCalled();
  });
});

// ── importFromCsv — duplicado dentro del archivo ───────────────────────────────

describe('AnimalService.importFromCsv — duplicados en archivo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rechaza si hay códigos duplicados dentro del mismo CSV', async () => {
    vi.mocked(animalRepository.findByCode).mockResolvedValue(null);

    const csv = [
      'code,breed,sex',
      'BOV-001,BRAHMAN,F',
      'BOV-001,ANGUS,M', // duplicado
    ].join('\n');

    const result = await animalService.importFromCsv(Buffer.from(csv), FARM_ID);

    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(animalRepository.createMany).not.toHaveBeenCalled();
  });
});

// ── importFromCsv — inserción exitosa ──────────────────────────────────────────

describe('AnimalService.importFromCsv — inserción', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserta todas las filas válidas cuando no hay duplicados en BD', async () => {
    vi.mocked(animalRepository.findByCode).mockResolvedValue(null);
    vi.mocked(animalRepository.createMany).mockResolvedValue(2);

    const csv = [
      'code,breed,sex',
      'NEW-001,BRAHMAN,F',
      'NEW-002,ANGUS,M',
    ].join('\n');

    const result = await animalService.importFromCsv(Buffer.from(csv), FARM_ID);

    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(animalRepository.createMany).toHaveBeenCalledOnce();
  });
});

// ── exportToCsv ────────────────────────────────────────────────────────────────

describe('AnimalService.exportToCsv', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna un Buffer con el CSV exportado', async () => {
    const animals = [buildAnimal()] as Animal[];
    vi.mocked(animalRepository.findAllForExport).mockResolvedValue(animals);

    const buffer = await animalService.exportToCsv(FARM_ID);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(animalRepository.findAllForExport).toHaveBeenCalledWith(FARM_ID);
  });
});

// ── exportToXlsx ───────────────────────────────────────────────────────────────

describe('AnimalService.exportToXlsx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna un Buffer con el XLSX exportado', async () => {
    const animals = [buildAnimal()] as Animal[];
    vi.mocked(animalRepository.findAllForExport).mockResolvedValue(animals);

    const buffer = await animalService.exportToXlsx(FARM_ID);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(animalRepository.findAllForExport).toHaveBeenCalledWith(FARM_ID);
  });
});
