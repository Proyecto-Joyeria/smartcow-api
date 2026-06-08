import { AppError } from '@common/utils/app-error';
import { deviceRepository } from '@admin/devices/devices.repository';
import { animalRepository } from '@animals/animals.repository';
import type {
  Device,
  DeviceDetail,
  CreateDeviceDto,
  UpdateDeviceDto,
  AssignDeviceDto,
  DeviceQueryDto,
  PaginatedResult,
  IDeviceService,
} from '@admin/devices/devices.types';

class DeviceService implements IDeviceService {

  async create(dto: CreateDeviceDto, farmId: string): Promise<Device> {
    return deviceRepository.create({ ...dto, farmId });
  }

  async findById(id: string, farmId: string): Promise<DeviceDetail> {
    const device = await deviceRepository.findById(id, farmId);
    if (!device) {
      throw new AppError(404, 'NOT_FOUND', 'Dispositivo no encontrado');
    }
    return device;
  }

  async findAll(
    farmId: string,
    query:  DeviceQueryDto,
  ): Promise<PaginatedResult<DeviceDetail>> {
    return deviceRepository.findAll(farmId, query);
  }

  async update(id: string, farmId: string, dto: UpdateDeviceDto): Promise<Device> {
    const existing = await deviceRepository.findById(id, farmId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Dispositivo no encontrado');
    }
    return deviceRepository.update(id, farmId, dto);
  }

  /**
   * Asigna un device a un animal.
   * Validaciones:
   *  1. El device existe y pertenece a la finca
   *  2. El animal existe, pertenece a la finca y no está eliminado
   *  3. El animal no tiene ya otro device asignado
   */
  async assignToAnimal(id: string, farmId: string, dto: AssignDeviceDto): Promise<Device> {
    const device = await deviceRepository.findById(id, farmId);
    if (!device) {
      throw new AppError(404, 'NOT_FOUND', 'Dispositivo no encontrado');
    }

    const animal = await animalRepository.findById(dto.animalId, farmId);
    if (!animal) {
      throw new AppError(404, 'NOT_FOUND', 'Animal no encontrado en esta finca');
    }

    // Verificar que el animal no tiene ya un device distinto
    if (animal.device && animal.device.id !== id) {
      throw new AppError(
        409,
        'CONFLICT',
        `El animal "${animal.code}" ya tiene un dispositivo asignado (${animal.device.id})`,
      );
    }

    // Si el device ya estaba asignado a este mismo animal, es idempotente
    if (device.animalId === dto.animalId) {
      return device;
    }

    return deviceRepository.assignToAnimal(id, farmId, dto.animalId);
  }

  /**
   * Desvincula un device de su animal actual.
   */
  async unassignFromAnimal(id: string, farmId: string): Promise<Device> {
    const device = await deviceRepository.findById(id, farmId);
    if (!device) {
      throw new AppError(404, 'NOT_FOUND', 'Dispositivo no encontrado');
    }
    if (!device.animalId) {
      throw new AppError(409, 'CONFLICT', 'El dispositivo no está asignado a ningún animal');
    }
    return deviceRepository.assignToAnimal(id, farmId, null);
  }
}

export const deviceService = new DeviceService();
