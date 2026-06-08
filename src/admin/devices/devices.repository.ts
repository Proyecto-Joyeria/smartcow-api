import { Prisma } from '@prisma/client';

import { prisma } from '@prisma/prisma.service';
import type {
  Device,
  DeviceDetail,
  CreateDeviceDto,
  UpdateDeviceDto,
  DeviceQueryDto,
  PaginatedResult,
  IDeviceRepository,
} from '@admin/devices/devices.types';

// ── Selects reutilizables ──────────────────────────────────────────────────────

const DEVICE_SELECT = {
  id:              true,
  farmId:          true,
  animalId:        true,
  serialNumber:    true,
  firmwareVersion: true,
  certFingerprint: true,
  certExpiresAt:   true,
  batteryPct:      true,
  lastSeenAt:      true,
  isActive:        true,
  createdAt:       true,
  updatedAt:       true,
} satisfies Prisma.DeviceSelect;

const DEVICE_DETAIL_SELECT = {
  ...DEVICE_SELECT,
  animal: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.DeviceSelect;

// ── DeviceRepository ───────────────────────────────────────────────────────────

class DeviceRepository implements IDeviceRepository {

  async create(data: CreateDeviceDto & { farmId: string }): Promise<Device> {
    return prisma.device.create({
      data: {
        farmId:          data.farmId,
        serialNumber:    data.serialNumber,
        firmwareVersion: data.firmwareVersion,
        certFingerprint: data.certFingerprint,
        certExpiresAt:   data.certExpiresAt ? new Date(data.certExpiresAt) : undefined,
        batteryPct:      data.batteryPct,
      },
      select: DEVICE_SELECT,
    });
  }

  async findById(id: string, farmId: string): Promise<DeviceDetail | null> {
    return prisma.device.findFirst({
      where:  { id, farmId },
      select: DEVICE_DETAIL_SELECT,
    }) as Promise<DeviceDetail | null>;
  }

  async findByAnimalId(animalId: string, farmId: string): Promise<Device | null> {
    return prisma.device.findFirst({
      where:  { animalId, farmId },
      select: DEVICE_SELECT,
    });
  }

  async findAll(
    farmId: string,
    query:  DeviceQueryDto,
  ): Promise<PaginatedResult<DeviceDetail>> {
    const { page = 1, pageSize = 20, isActive, animalId } = query;

    const where: Prisma.DeviceWhereInput = {
      farmId,
      ...(isActive  !== undefined && { isActive }),
      ...(animalId  !== undefined && { animalId }),
    };

    const [devices, total] = await prisma.$transaction([
      prisma.device.findMany({
        where,
        select:  DEVICE_DETAIL_SELECT,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.device.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data:        devices as DeviceDetail[],
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
    };
  }

  async update(id: string, farmId: string, data: UpdateDeviceDto): Promise<Device> {
    return prisma.device.update({
      where:  { id, farmId },
      data:   {
        ...data,
        certExpiresAt: data.certExpiresAt ? new Date(data.certExpiresAt) : undefined,
      },
      select: DEVICE_SELECT,
    });
  }

  async assignToAnimal(
    id:       string,
    farmId:   string,
    animalId: string | null,
  ): Promise<Device> {
    return prisma.device.update({
      where:  { id, farmId },
      data:   { animalId },
      select: DEVICE_SELECT,
    });
  }
}

export const deviceRepository = new DeviceRepository();
