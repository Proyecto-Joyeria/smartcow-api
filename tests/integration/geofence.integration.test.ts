import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../../src/app';
import { prisma } from '@prisma/prisma.service';
import { redisClient } from '@redis/redis.service';
import { ROLE_PERMISSIONS } from '@auth/auth.types';

// ═══════════════════════════════════════════════════════════════════════════════
// Integración: CRUD de geocercas (Sprint 4)
//
// Corre contra PostgreSQL y Redis reales. Requiere DATABASE_URL apuntando a una BD
// migrada (ver npm run test:integration). Siembra su propia finca + usuario y firma
// un JWT RS256 válido con la clave privada del entorno.
// ═══════════════════════════════════════════════════════════════════════════════

const JWT_PRIVATE_KEY = (process.env['JWT_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n');

const FARM_ID = 'it-farm-geofence-001';
const USER_ID = 'it-user-geofence-001';

function token(): string {
  return jwt.sign(
    { sub: USER_ID, farmId: FARM_ID, role: 'ADMIN', permissions: ROLE_PERMISSIONS.ADMIN },
    JWT_PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' },
  );
}

const VALID_POLYGON = [
  { lat: 4.70, lng: -74.10 },
  { lat: 4.70, lng: -74.00 },
  { lat: 4.80, lng: -74.00 },
  { lat: 4.80, lng: -74.10 },
];

const auth = () => `Bearer ${token()}`;

beforeAll(async () => {
  await prisma.farm.upsert({
    where:  { id: FARM_ID },
    update: {},
    create: { id: FARM_ID, name: 'Finca Integración Geofence' },
  });
  await prisma.user.upsert({
    where:  { id: USER_ID },
    update: {},
    create: {
      id: USER_ID, email: 'it-geofence@smartcow.test',
      passwordHash: 'x', firstName: 'IT', lastName: 'Geofence',
    },
  });
  await prisma.userFarm.upsert({
    where:  { userId_farmId: { userId: USER_ID, farmId: FARM_ID } },
    update: {},
    create: { userId: USER_ID, farmId: FARM_ID, role: 'ADMIN' },
  });
});

afterAll(async () => {
  await prisma.alert.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.geofence.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.userFarm.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.farm.deleteMany({ where: { id: FARM_ID } });
  await prisma.$disconnect();
  redisClient.disconnect();
});

describe('Geofences CRUD (integración)', () => {
  let geofenceId = '';

  it('rechaza sin token → 401', async () => {
    await request(app).get('/api/v1/geofences').expect(401);
  });

  it('POST /geofences crea una geocerca → 201', async () => {
    const res = await request(app)
      .post('/api/v1/geofences')
      .set('Authorization', auth())
      .send({ name: 'Potrero Norte', polygon: VALID_POLYGON, color: '#1a7a4a' })
      .expect(201);

    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Potrero Norte');
    expect(res.body.data.polygon).toHaveLength(4);
    geofenceId = res.body.data.id;
  });

  it('POST con polígono de 2 vértices → 400', async () => {
    await request(app)
      .post('/api/v1/geofences')
      .set('Authorization', auth())
      .send({ name: 'Inválida', polygon: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] })
      .expect(400);
  });

  it('GET /geofences lista la geocerca creada', async () => {
    const res = await request(app)
      .get('/api/v1/geofences')
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.data.some((g: { id: string }) => g.id === geofenceId)).toBe(true);
  });

  it('GET /geofences/:id devuelve el detalle', async () => {
    const res = await request(app)
      .get(`/api/v1/geofences/${geofenceId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.data.id).toBe(geofenceId);
  });

  it('PATCH /geofences/:id actualiza nombre y active', async () => {
    const res = await request(app)
      .patch(`/api/v1/geofences/${geofenceId}`)
      .set('Authorization', auth())
      .send({ name: 'Potrero Sur', active: false })
      .expect(200);
    expect(res.body.data.name).toBe('Potrero Sur');
    expect(res.body.data.active).toBe(false);
  });

  it('DELETE /geofences/:id con alerta OPEN → 409', async () => {
    // Se necesita un animal para la FK de la alerta.
    const animal = await prisma.animal.create({
      data: { farmId: FARM_ID, code: 'IT-GF-ANIMAL', breed: 'BRAHMAN', sex: 'F' },
    });
    await prisma.alert.create({
      data: {
        farmId: FARM_ID, animalId: animal.id, geofenceId,
        ruleId: 'GEOFENCE_EXIT', priority: 'CRITICAL', status: 'OPEN',
        title: 'x', description: 'x',
      },
    });

    await request(app)
      .delete(`/api/v1/geofences/${geofenceId}`)
      .set('Authorization', auth())
      .expect(409);

    // Limpieza: cerrar alerta y borrar animal para permitir el borrado final
    await prisma.alert.deleteMany({ where: { geofenceId } });
    await prisma.animal.deleteMany({ where: { id: animal.id } });
  });

  it('DELETE /geofences/:id sin alertas → 204', async () => {
    await request(app)
      .delete(`/api/v1/geofences/${geofenceId}`)
      .set('Authorization', auth())
      .expect(204);

    await request(app)
      .get(`/api/v1/geofences/${geofenceId}`)
      .set('Authorization', auth())
      .expect(404);
  });
});
