import { Prisma } from '@prisma/client';

import { prisma } from '@prisma/prisma.service';
import type { LatLng } from '@geofence/geofence.geometry';
import type { CreateGeofenceDto, UpdateGeofenceDto, GeofenceQueryDto } from '@geofence/geofence.schemas';
import type { Geofence, IGeofenceRepository } from '@geofence/geofence.types';

// ── Select reutilizable ──────────────────────────────────────────────────────

const GEOFENCE_SELECT = {
  id:          true,
  farmId:      true,
  name:        true,
  description: true,
  polygon:     true,
  color:       true,
  active:      true,
  createdBy:   true,
  createdAt:   true,
  updatedAt:   true,
} satisfies Prisma.GeofenceSelect;

type RawGeofence = Prisma.GeofenceGetPayload<{ select: typeof GEOFENCE_SELECT }>;

/** El polígono se persiste como JSON; al leer se reconstruye el tipo LatLng[]. */
function mapGeofence(raw: RawGeofence): Geofence {
  return {
    id:          raw.id,
    farmId:      raw.farmId,
    name:        raw.name,
    description: raw.description,
    polygon:     raw.polygon as unknown as LatLng[],
    color:       raw.color,
    active:      raw.active,
    createdBy:   raw.createdBy,
    createdAt:   raw.createdAt,
    updatedAt:   raw.updatedAt,
  };
}

// ── GeofenceRepository ─────────────────────────────────────────────────────────

class GeofenceRepository implements IGeofenceRepository {

  async create(data: CreateGeofenceDto & { farmId: string; createdBy: string }): Promise<Geofence> {
    const raw = await prisma.geofence.create({
      data: {
        farmId:      data.farmId,
        name:        data.name,
        description: data.description,
        polygon:     data.polygon as unknown as Prisma.InputJsonValue,
        color:       data.color,
        active:      data.active,
        createdBy:   data.createdBy,
      },
      select: GEOFENCE_SELECT,
    });
    return mapGeofence(raw);
  }

  async findById(id: string, farmId: string): Promise<Geofence | null> {
    const raw = await prisma.geofence.findFirst({
      where:  { id, farmId },
      select: GEOFENCE_SELECT,
    });
    return raw ? mapGeofence(raw) : null;
  }

  async findAll(farmId: string, query: GeofenceQueryDto): Promise<Geofence[]> {
    const raws = await prisma.geofence.findMany({
      where:   { farmId, ...(query.active !== undefined && { active: query.active }) },
      select:  GEOFENCE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return raws.map(mapGeofence);
  }

  async findActive(farmId: string): Promise<Geofence[]> {
    const raws = await prisma.geofence.findMany({
      where:   { farmId, active: true },
      select:  GEOFENCE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return raws.map(mapGeofence);
  }

  async update(id: string, farmId: string, data: UpdateGeofenceDto): Promise<Geofence> {
    const raw = await prisma.geofence.update({
      where: { id, farmId },
      data: {
        ...(data.name        !== undefined && { name:        data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.polygon     !== undefined && { polygon:     data.polygon as unknown as Prisma.InputJsonValue }),
        ...(data.color       !== undefined && { color:       data.color }),
        ...(data.active      !== undefined && { active:      data.active }),
      },
      select: GEOFENCE_SELECT,
    });
    return mapGeofence(raw);
  }

  async delete(id: string, farmId: string): Promise<void> {
    // where compuesto id+farmId garantiza el aislamiento multi-tenant
    await prisma.geofence.deleteMany({ where: { id, farmId } });
  }

  /** Cuenta alertas OPEN vinculadas a la geocerca (bloquean el borrado — 409). */
  async countOpenAlerts(geofenceId: string): Promise<number> {
    return prisma.alert.count({ where: { geofenceId, status: 'OPEN' } });
  }
}

export const geofenceRepository = new GeofenceRepository();
