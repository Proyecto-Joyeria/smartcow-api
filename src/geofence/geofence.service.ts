import { AppError } from '@common/utils/app-error';
import { logger } from '@common/utils/logger';
import {
  cacheFarmGeofences,
  getCachedFarmGeofences,
  invalidateFarmGeofences,
} from '@redis/redis.service';

import { geofenceRepository } from '@geofence/geofence.repository';
import type { CreateGeofenceDto, UpdateGeofenceDto, GeofenceQueryDto } from '@geofence/geofence.schemas';
import type { ActiveGeofence, Geofence, IGeofenceService } from '@geofence/geofence.types';

class GeofenceService implements IGeofenceService {

  async create(dto: CreateGeofenceDto, farmId: string, userId: string): Promise<Geofence> {
    const geofence = await geofenceRepository.create({ ...dto, farmId, createdBy: userId });
    // La nueva geocerca puede estar activa → invalida la cache de evaluación.
    await invalidateFarmGeofences(farmId);
    logger.info('Geofence: creada', { geofenceId: geofence.id, farmId, active: geofence.active });
    return geofence;
  }

  async findById(id: string, farmId: string): Promise<Geofence> {
    const geofence = await geofenceRepository.findById(id, farmId);
    if (!geofence) {
      throw new AppError(404, 'NOT_FOUND', 'Geocerca no encontrada');
    }
    return geofence;
  }

  async findAll(farmId: string, query: GeofenceQueryDto): Promise<Geofence[]> {
    return geofenceRepository.findAll(farmId, query);
  }

  async update(id: string, farmId: string, dto: UpdateGeofenceDto): Promise<Geofence> {
    const existing = await geofenceRepository.findById(id, farmId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Geocerca no encontrada');
    }
    const updated = await geofenceRepository.update(id, farmId, dto);
    // Cualquier edición (polígono, active, etc.) puede cambiar la evaluación.
    await invalidateFarmGeofences(farmId);
    logger.info('Geofence: actualizada', { geofenceId: id, farmId });
    return updated;
  }

  async delete(id: string, farmId: string): Promise<void> {
    const existing = await geofenceRepository.findById(id, farmId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Geocerca no encontrada');
    }

    // Regla de dominio (DataModel §4.2): no se puede borrar una geocerca con
    // alertas abiertas — habría alertas huérfanas sin contexto de zona.
    const openAlerts = await geofenceRepository.countOpenAlerts(id);
    if (openAlerts > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        `No se puede eliminar la geocerca: tiene ${openAlerts} alerta(s) abierta(s)`,
      );
    }

    await geofenceRepository.delete(id, farmId);
    await invalidateFarmGeofences(farmId);
    logger.info('Geofence: eliminada', { geofenceId: id, farmId });
  }

  /**
   * Geocercas activas para el AlertEngine. Lee de Redis (camino de alta
   * frecuencia); si hay cache miss, consulta PostgreSQL y repuebla la cache.
   */
  async getActiveForEvaluation(farmId: string): Promise<ActiveGeofence[]> {
    const cached = await getCachedFarmGeofences<ActiveGeofence[]>(farmId);
    if (cached) return cached;

    const active = await geofenceRepository.findActive(farmId);
    const minimal: ActiveGeofence[] = active.map((g) => ({
      id:      g.id,
      name:    g.name,
      color:   g.color,
      polygon: g.polygon,
    }));

    await cacheFarmGeofences(farmId, minimal);
    return minimal;
  }
}

export const geofenceService = new GeofenceService();
