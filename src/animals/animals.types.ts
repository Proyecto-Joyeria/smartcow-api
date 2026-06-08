import type { Breed, Sex, AnimalStatus, HealthStatus, ReproductiveStatus } from '@prisma/client';

// ── Re-exports de enums Prisma ─────────────────────────────────────────────────
export type { Breed, Sex, AnimalStatus, HealthStatus, ReproductiveStatus };

// ── Entidad de dominio ─────────────────────────────────────────────────────────

export interface Animal {
  id:                 string;
  farmId:             string;
  code:               string;
  name:               string | null;
  breed:              Breed;
  sex:                Sex;
  birthDate:          Date | null;
  weightKg:           number | null;
  photoUrl:           string | null;
  areteNumber:        string | null;
  status:             AnimalStatus;
  healthStatus:       HealthStatus;
  reproductiveStatus: ReproductiveStatus | null;
  notes:              string | null;
  deletedAt:          Date | null;
  createdAt:          Date;
  updatedAt:          Date;
}

/** Animal con el device asignado incluido (para respuestas de detalle) */
export interface AnimalDetail extends Animal {
  device: {
    id:              string;
    serialNumber:    string;
    firmwareVersion: string;
    batteryPct:      number | null;
    lastSeenAt:      Date | null;
    isActive:        boolean;
  } | null;
}

/** Resumen liviano para listados paginados */
export interface AnimalSummary {
  id:           string;
  code:         string;
  name:         string | null;
  breed:        Breed;
  sex:          Sex;
  status:       AnimalStatus;
  healthStatus: HealthStatus;
  areteNumber:  string | null;
  weightKg:     number | null;
  hasDevice:    boolean;
  createdAt:    Date;
}

// ── DTOs de entrada ────────────────────────────────────────────────────────────

export interface CreateAnimalDto {
  code:               string;
  name?:              string;
  breed:              Breed;
  sex:                Sex;
  birthDate?:         string; // ISO 8601 string; se parsea en service
  weightKg?:          number;
  photoUrl?:          string;
  areteNumber?:       string;
  status?:            AnimalStatus;
  healthStatus?:      HealthStatus;
  reproductiveStatus?: ReproductiveStatus;
  notes?:             string;
}

export interface UpdateAnimalDto {
  name?:               string;
  breed?:              Breed;
  sex?:                Sex;
  birthDate?:          string;
  weightKg?:           number;
  photoUrl?:           string;
  areteNumber?:        string;
  status?:             AnimalStatus;
  healthStatus?:       HealthStatus;
  reproductiveStatus?: ReproductiveStatus;
  notes?:              string;
}

// ── Query params para listado ──────────────────────────────────────────────────

export interface AnimalQueryDto {
  page?:         number;
  pageSize?:     number;
  search?:       string;      // busca en code, name, areteNumber
  breed?:        Breed;
  sex?:          Sex;
  status?:       AnimalStatus;
  healthStatus?: HealthStatus;
  sortBy?:       'code' | 'name' | 'createdAt' | 'updatedAt';
  sortOrder?:    'asc' | 'desc';
}

// ── Paginación estándar ────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data:        T[];
  total:       number;
  page:        number;
  pageSize:    number;
  totalPages:  number;
  hasNextPage: boolean;
}

// ── Resultado de importación CSV ───────────────────────────────────────────────

export interface CsvImportRow {
  rowNumber: number;
  code:      string;
  errors:    string[];
}

export interface ImportResult {
  imported: number;
  errors:   CsvImportRow[];
}

// ── Contratos de repositorio y servicio ───────────────────────────────────────

export interface IAnimalRepository {
  create(data: CreateAnimalDto & { farmId: string }): Promise<Animal>;
  createMany(data: Array<CreateAnimalDto & { farmId: string }>): Promise<number>;
  findById(id: string, farmId: string): Promise<AnimalDetail | null>;
  findAll(farmId: string, query: AnimalQueryDto): Promise<PaginatedResult<AnimalSummary>>;
  findByCode(code: string, farmId: string): Promise<Animal | null>;
  update(id: string, farmId: string, data: UpdateAnimalDto): Promise<Animal>;
  softDelete(id: string, farmId: string): Promise<void>;
}

export interface IAnimalService {
  create(dto: CreateAnimalDto, farmId: string): Promise<Animal>;
  findById(id: string, farmId: string): Promise<AnimalDetail>;
  findAll(farmId: string, query: AnimalQueryDto): Promise<PaginatedResult<AnimalSummary>>;
  update(id: string, farmId: string, dto: UpdateAnimalDto): Promise<Animal>;
  softDelete(id: string, farmId: string): Promise<void>;
  importFromCsv(buffer: Buffer, farmId: string): Promise<ImportResult>;
  exportToCsv(farmId: string): Promise<Buffer>;
  exportToXlsx(farmId: string): Promise<Buffer>;
}
