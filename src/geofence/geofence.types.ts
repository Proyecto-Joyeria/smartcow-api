// ═══════════════════════════════════════════════════════════════════════════════
// Tipos del módulo Geofence — Sprint 4
// ═══════════════════════════════════════════════════════════════════════════════

import type { LatLng } from '@geofence/geofence.geometry';
import type {
  CreateGeofenceDto,
  UpdateGeofenceDto,
  GeofenceQueryDto,
} from '@geofence/geofence.schemas';

export type { LatLng };

/** Geocerca completa tal como la devuelve la API. */
export interface Geofence {
  id:          string;
  farmId:      string;
  name:        string;
  description: string | null;
  polygon:     LatLng[];
  color:       string;
  active:      boolean;
  createdBy:   string;
  createdAt:   Date;
  updatedAt:   Date;
}

/**
 * Forma mínima de una geocerca activa usada por el AlertEngine (GeofenceExitRule).
 * Es exactamente lo que se cachea en Redis por finca para evaluar sin tocar la BD.
 */
export interface ActiveGeofence {
  id:      string;
  name:    string;
  color:   string;
  polygon: LatLng[];
}

// ── Contratos de capa ──────────────────────────────────────────────────────────

export interface IGeofenceRepository {
  create(data: CreateGeofenceDto & { farmId: string; createdBy: string }): Promise<Geofence>;
  findById(id: string, farmId: string): Promise<Geofence | null>;
  findAll(farmId: string, query: GeofenceQueryDto): Promise<Geofence[]>;
  findActive(farmId: string): Promise<Geofence[]>;
  update(id: string, farmId: string, data: UpdateGeofenceDto): Promise<Geofence>;
  delete(id: string, farmId: string): Promise<void>;
  countOpenAlerts(geofenceId: string): Promise<number>;
}

export interface IGeofenceService {
  create(dto: CreateGeofenceDto, farmId: string, userId: string): Promise<Geofence>;
  findById(id: string, farmId: string): Promise<Geofence>;
  findAll(farmId: string, query: GeofenceQueryDto): Promise<Geofence[]>;
  update(id: string, farmId: string, dto: UpdateGeofenceDto): Promise<Geofence>;
  delete(id: string, farmId: string): Promise<void>;
  /** Geocercas activas de la finca, desde cache Redis con fallback a PostgreSQL. */
  getActiveForEvaluation(farmId: string): Promise<ActiveGeofence[]>;
}
