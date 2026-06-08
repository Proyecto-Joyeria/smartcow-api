import { Prisma } from '@prisma/client';

import { prisma } from '@prisma/prisma.service';
import type {
  Animal,
  AnimalDetail,
  AnimalSummary,
  CreateAnimalDto,
  UpdateAnimalDto,
  AnimalQueryDto,
  PaginatedResult,
  IAnimalRepository,
} from '@animals/animals.types';

// ── Selects reutilizables ──────────────────────────────────────────────────────

/** Campos completos del animal sin relaciones — para create/update/findByCode */
const ANIMAL_SELECT = {
  id:                 true,
  farmId:             true,
  code:               true,
  name:               true,
  breed:              true,
  sex:                true,
  birthDate:          true,
  weightKg:           true,
  photoUrl:           true,
  areteNumber:        true,
  status:             true,
  healthStatus:       true,
  reproductiveStatus: true,
  notes:              true,
  deletedAt:          true,
  createdAt:          true,
  updatedAt:          true,
} satisfies Prisma.AnimalSelect;

/** Campos para listados (más liviano, sin notes/photoUrl, con hasDevice calculado) */
const ANIMAL_SUMMARY_SELECT = {
  id:           true,
  code:         true,
  name:         true,
  breed:        true,
  sex:          true,
  status:       true,
  healthStatus: true,
  areteNumber:  true,
  weightKg:     true,
  createdAt:    true,
  device:       { select: { id: true } }, // solo para saber si tiene device
} satisfies Prisma.AnimalSelect;

/** Campos para detalle con device anidado */
const ANIMAL_DETAIL_SELECT = {
  ...ANIMAL_SELECT,
  device: {
    select: {
      id:              true,
      serialNumber:    true,
      firmwareVersion: true,
      batteryPct:      true,
      lastSeenAt:      true,
      isActive:        true,
    },
  },
} satisfies Prisma.AnimalSelect;

// ── Helpers de conversión ──────────────────────────────────────────────────────

/** Prisma devuelve Decimal; la interfaz Animal usa number | null */
function decimalToNumber(d: Prisma.Decimal | null): number | null {
  return d === null ? null : d.toNumber();
}

// Usando Prisma.AnimalGetPayload — forma recomendada para tipar resultados con select
type RawAnimal  = Prisma.AnimalGetPayload<{ select: typeof ANIMAL_SELECT }>;
type RawSummary = Prisma.AnimalGetPayload<{ select: typeof ANIMAL_SUMMARY_SELECT }>;
type RawDetail  = Prisma.AnimalGetPayload<{ select: typeof ANIMAL_DETAIL_SELECT }>;

function mapAnimal(raw: RawAnimal): Animal {
  return { ...raw, weightKg: decimalToNumber(raw.weightKg) };
}

function mapSummary(raw: RawSummary): AnimalSummary {
  return {
    id:           raw.id,
    code:         raw.code,
    name:         raw.name,
    breed:        raw.breed,
    sex:          raw.sex,
    status:       raw.status,
    healthStatus: raw.healthStatus,
    areteNumber:  raw.areteNumber,
    weightKg:     decimalToNumber(raw.weightKg),
    hasDevice:    raw.device !== null,
    createdAt:    raw.createdAt,
  };
}

function mapDetail(raw: RawDetail): AnimalDetail {
  return {
    ...raw,
    weightKg: decimalToNumber(raw.weightKg),
    device:   raw.device ?? null,
  };
}

// ── AnimalRepository ───────────────────────────────────────────────────────────

class AnimalRepository implements IAnimalRepository {

  async create(data: CreateAnimalDto & { farmId: string }): Promise<Animal> {
    const raw = await prisma.animal.create({
      data: {
        farmId:             data.farmId,
        code:               data.code,
        name:               data.name,
        breed:              data.breed,
        sex:                data.sex,
        birthDate:          data.birthDate ? new Date(data.birthDate) : undefined,
        weightKg:           data.weightKg,
        photoUrl:           data.photoUrl,
        areteNumber:        data.areteNumber,
        status:             data.status,
        healthStatus:       data.healthStatus,
        reproductiveStatus: data.reproductiveStatus,
        notes:              data.notes,
      },
      select: ANIMAL_SELECT,
    });
    return mapAnimal(raw);
  }

  async createMany(rows: Array<CreateAnimalDto & { farmId: string }>): Promise<number> {
    const result = await prisma.animal.createMany({
      data: rows.map((r) => ({
        farmId:             r.farmId,
        code:               r.code,
        name:               r.name,
        breed:              r.breed,
        sex:                r.sex,
        birthDate:          r.birthDate ? new Date(r.birthDate) : undefined,
        weightKg:           r.weightKg,
        photoUrl:           r.photoUrl,
        areteNumber:        r.areteNumber,
        status:             r.status,
        healthStatus:       r.healthStatus,
        reproductiveStatus: r.reproductiveStatus,
        notes:              r.notes,
      })),
      skipDuplicates: false, // falla si hay duplicados — el service valida antes
    });
    return result.count;
  }

  async findById(id: string, farmId: string): Promise<AnimalDetail | null> {
    const raw = await prisma.animal.findFirst({
      where:  { id, farmId, deletedAt: null },
      select: ANIMAL_DETAIL_SELECT,
    });
    if (raw === null) return null;
    return mapDetail(raw);
  }

  async findAll(
    farmId:  string,
    query:   AnimalQueryDto,
  ): Promise<PaginatedResult<AnimalSummary>> {
    const {
      page      = 1,
      pageSize  = 20,
      search,
      breed,
      sex,
      status,
      healthStatus,
      sortBy    = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.AnimalWhereInput = {
      farmId,
      deletedAt: null,
      ...(breed        && { breed }),
      ...(sex          && { sex }),
      ...(status       && { status }),
      ...(healthStatus && { healthStatus }),
      ...(search && {
        OR: [
          { code:        { contains: search, mode: 'insensitive' } },
          { name:        { contains: search, mode: 'insensitive' } },
          { areteNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [raws, total] = await prisma.$transaction([
      prisma.animal.findMany({
        where,
        select:  ANIMAL_SUMMARY_SELECT,
        orderBy: { [sortBy]: sortOrder },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.animal.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data:        raws.map(mapSummary),
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
    };
  }

  async findByCode(code: string, farmId: string): Promise<Animal | null> {
    const raw = await prisma.animal.findFirst({
      where:  { code, farmId, deletedAt: null },
      select: ANIMAL_SELECT,
    });
    if (!raw) return null;
    return mapAnimal(raw);
  }

  /** Devuelve todos los animales no eliminados de la finca (para export) */
  async findAllForExport(farmId: string): Promise<Animal[]> {
    const raws = await prisma.animal.findMany({
      where:   { farmId, deletedAt: null },
      select:  ANIMAL_SELECT,
      orderBy: { code: 'asc' },
    });
    return (raws as RawAnimal[]).map(mapAnimal);
  }

  async update(id: string, farmId: string, data: UpdateAnimalDto): Promise<Animal> {
    const raw = await prisma.animal.update({
      where:  { id, farmId },
      data:   {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      },
      select: ANIMAL_SELECT,
    });
    return mapAnimal(raw);
  }

  async softDelete(id: string, farmId: string): Promise<void> {
    await prisma.animal.update({
      where: { id, farmId },
      data:  { deletedAt: new Date() },
    });
  }
}

export const animalRepository = new AnimalRepository();
