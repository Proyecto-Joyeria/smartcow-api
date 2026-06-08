// ── Entidad de dominio ─────────────────────────────────────────────────────────

export interface Device {
  id:              string;
  farmId:          string;
  animalId:        string | null;
  serialNumber:    string;
  firmwareVersion: string;
  certFingerprint: string | null;
  certExpiresAt:   Date | null;
  batteryPct:      number | null;
  lastSeenAt:      Date | null;
  isActive:        boolean;
  createdAt:       Date;
  updatedAt:       Date;
}

/** Device con el animal asignado incluido */
export interface DeviceDetail extends Device {
  animal: {
    id:   string;
    code: string;
    name: string | null;
  } | null;
}

// ── DTOs de entrada ────────────────────────────────────────────────────────────

export interface CreateDeviceDto {
  serialNumber:    string;
  firmwareVersion: string;
  certFingerprint?: string;
  certExpiresAt?:   string; // ISO 8601
  batteryPct?:      number;
}

export interface UpdateDeviceDto {
  firmwareVersion?: string;
  certFingerprint?: string;
  certExpiresAt?:   string;
  batteryPct?:      number;
  isActive?:        boolean;
}

export interface AssignDeviceDto {
  animalId: string;
}

// ── Query params ───────────────────────────────────────────────────────────────

export interface DeviceQueryDto {
  page?:     number;
  pageSize?: number;
  isActive?: boolean;
  animalId?: string;
}

// ── Paginación (reutiliza el mismo shape que Animals) ─────────────────────────

export interface PaginatedResult<T> {
  data:        T[];
  total:       number;
  page:        number;
  pageSize:    number;
  totalPages:  number;
  hasNextPage: boolean;
}

// ── Contratos ─────────────────────────────────────────────────────────────────

export interface IDeviceRepository {
  create(data: CreateDeviceDto & { farmId: string }): Promise<Device>;
  findById(id: string, farmId: string): Promise<DeviceDetail | null>;
  findByAnimalId(animalId: string, farmId: string): Promise<Device | null>;
  findAll(farmId: string, query: DeviceQueryDto): Promise<PaginatedResult<DeviceDetail>>;
  update(id: string, farmId: string, data: UpdateDeviceDto): Promise<Device>;
  assignToAnimal(id: string, farmId: string, animalId: string | null): Promise<Device>;
}

export interface IDeviceService {
  create(dto: CreateDeviceDto, farmId: string): Promise<Device>;
  findById(id: string, farmId: string): Promise<DeviceDetail>;
  findAll(farmId: string, query: DeviceQueryDto): Promise<PaginatedResult<DeviceDetail>>;
  update(id: string, farmId: string, dto: UpdateDeviceDto): Promise<Device>;
  assignToAnimal(id: string, farmId: string, dto: AssignDeviceDto): Promise<Device>;
  unassignFromAnimal(id: string, farmId: string): Promise<Device>;
}
