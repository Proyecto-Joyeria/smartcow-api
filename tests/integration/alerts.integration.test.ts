import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Job } from 'bullmq';

import { app } from '../../src/app';
import { prisma } from '@prisma/prisma.service';
import { redisClient } from '@redis/redis.service';
import { ROLE_PERMISSIONS } from '@auth/auth.types';
import { evaluateAlertsProcessor } from '@workers/processors/evaluate-alerts.processor';
import { closeQueues, type EvaluateAlertsJobData } from '@workers/queues';

// ═══════════════════════════════════════════════════════════════════════════════
// Integración: ciclo de vida de alertas + pipeline geocerca→alerta (Sprints 4-5)
// ═══════════════════════════════════════════════════════════════════════════════

const JWT_PRIVATE_KEY = (process.env['JWT_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n');

const FARM_ID     = 'it-farm-alerts-001';
const USER_ID     = 'it-user-alerts-001';
const ASSIGNEE_ID = 'it-user-alerts-002';
const ANIMAL_ID   = 'it-animal-alerts-001';
const DEVICE_ID   = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function token(): string {
  return jwt.sign(
    { sub: USER_ID, farmId: FARM_ID, role: 'ADMIN', permissions: ROLE_PERMISSIONS.ADMIN },
    JWT_PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' },
  );
}
const auth = () => `Bearer ${token()}`;

// Geocerca pequeña alrededor de (4.75, -74.05)
const SQUARE = [
  { lat: 4.74, lng: -74.06 },
  { lat: 4.74, lng: -74.04 },
  { lat: 4.76, lng: -74.04 },
  { lat: 4.76, lng: -74.06 },
];

beforeAll(async () => {
  await prisma.farm.upsert({ where: { id: FARM_ID }, update: {}, create: { id: FARM_ID, name: 'Finca IT Alerts' } });
  for (const id of [USER_ID, ASSIGNEE_ID]) {
    await prisma.user.upsert({
      where: { id }, update: {},
      create: { id, email: `${id}@smartcow.test`, passwordHash: 'x', firstName: 'IT', lastName: id },
    });
    await prisma.userFarm.upsert({
      where: { userId_farmId: { userId: id, farmId: FARM_ID } }, update: {},
      create: { userId: id, farmId: FARM_ID, role: 'ADMIN' },
    });
  }
  await prisma.animal.upsert({
    where: { id: ANIMAL_ID }, update: {},
    create: { id: ANIMAL_ID, farmId: FARM_ID, code: 'IT-ALERT-01', breed: 'BRAHMAN', sex: 'F' },
  });
  await prisma.device.upsert({
    where: { id: DEVICE_ID }, update: {},
    create: { id: DEVICE_ID, farmId: FARM_ID, animalId: ANIMAL_ID, serialNumber: 'IT-ALERT-SN-1', firmwareVersion: '1.0.0' },
  });
});

afterAll(async () => {
  await prisma.alertAction.deleteMany({ where: { alert: { farmId: FARM_ID } } });
  await prisma.alert.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.auditLog.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.geofence.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.device.deleteMany({ where: { id: DEVICE_ID } });
  await prisma.animal.deleteMany({ where: { id: ANIMAL_ID } });
  await prisma.userFarm.deleteMany({ where: { farmId: FARM_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, ASSIGNEE_ID] } } });
  await prisma.farm.deleteMany({ where: { id: FARM_ID } });
  await closeQueues();          // cierra la conexión Redis de BullMQ (notifications)
  await prisma.$disconnect();
  redisClient.disconnect();
});

function evalJob(lat: number, lng: number, extra: Partial<EvaluateAlertsJobData['vitals']> = {}): Job<EvaluateAlertsJobData> {
  const recordedAt = new Date().toISOString();
  const data: EvaluateAlertsJobData = {
    deviceId: DEVICE_ID, animalId: ANIMAL_ID, farmId: FARM_ID, firmwareVersion: '1.0.0',
    gps: { lat, lng, alt: null, accuracy: null, speedKmh: 0, recordedAt },
    vitals: { tempC: 38.5, heartBpm: 70, activity: 50, batteryPct: 80, recordedAt, ...extra },
  };
  return { data } as unknown as Job<EvaluateAlertsJobData>;
}

describe('Pipeline geocerca → alerta (evaluate-alerts)', () => {
  it('un animal FUERA de la geocerca activa genera una alerta GEOFENCE_EXIT', async () => {
    // Invalidar cache y crear geocerca activa vía API
    await request(app).post('/api/v1/geofences').set('Authorization', auth())
      .send({ name: 'Zona IT', polygon: SQUARE }).expect(201);

    // Animal DENTRO → sin alerta
    await evaluateAlertsProcessor(evalJob(4.75, -74.05));
    const insideCount = await prisma.alert.count({ where: { farmId: FARM_ID, ruleId: 'GEOFENCE_EXIT' } });
    expect(insideCount).toBe(0);

    // Animal FUERA → alerta GEOFENCE_EXIT CRITICAL
    await evaluateAlertsProcessor(evalJob(5.50, -73.00));
    const alert = await prisma.alert.findFirst({ where: { farmId: FARM_ID, ruleId: 'GEOFENCE_EXIT' } });
    expect(alert).not.toBeNull();
    expect(alert?.priority).toBe('CRITICAL');

    // Segunda evaluación fuera → deduplicada (sigue habiendo 1 alerta abierta)
    await evaluateAlertsProcessor(evalJob(5.60, -73.10));
    const count = await prisma.alert.count({ where: { farmId: FARM_ID, ruleId: 'GEOFENCE_EXIT', status: { not: 'CLOSED' } } });
    expect(count).toBe(1);
  });

  it('temperatura crítica genera alerta HIGH_TEMP', async () => {
    await evaluateAlertsProcessor(evalJob(4.75, -74.05, { tempC: 41.0 }));
    const alert = await prisma.alert.findFirst({ where: { farmId: FARM_ID, ruleId: 'HIGH_TEMP' } });
    expect(alert?.priority).toBe('CRITICAL');
  });
});

describe('Ciclo de vida de alertas (endpoints)', () => {
  let alertId = '';

  it('GET /alerts lista las alertas de la finca', async () => {
    const res = await request(app).get('/api/v1/alerts').set('Authorization', auth()).expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    alertId = res.body.data[0].id;
  });

  it('GET /alerts/:id devuelve el detalle con acciones (incluye CREATED)', async () => {
    const res = await request(app).get(`/api/v1/alerts/${alertId}`).set('Authorization', auth()).expect(200);
    expect(res.body.data.id).toBe(alertId);
    expect(res.body.data.actions.some((a: { action: string }) => a.action === 'CREATED')).toBe(true);
  });

  it('POST /alerts/:id/acknowledge → ACKNOWLEDGED', async () => {
    const res = await request(app).post(`/api/v1/alerts/${alertId}/acknowledge`).set('Authorization', auth()).expect(200);
    expect(res.body.data.status).toBe('ACKNOWLEDGED');
  });

  it('POST /alerts/:id/assign → ASSIGNED', async () => {
    const res = await request(app).post(`/api/v1/alerts/${alertId}/assign`)
      .set('Authorization', auth()).send({ assigneeId: ASSIGNEE_ID }).expect(200);
    expect(res.body.data.status).toBe('ASSIGNED');
    expect(res.body.data.assigneeId).toBe(ASSIGNEE_ID);
  });

  it('POST /alerts/:id/close → CLOSED con resolución y responseMs', async () => {
    const res = await request(app).post(`/api/v1/alerts/${alertId}/close`)
      .set('Authorization', auth()).send({ resolution: 'Animal reingresado al potrero' }).expect(200);
    expect(res.body.data.status).toBe('CLOSED');

    const closed = await prisma.alert.findUnique({ where: { id: alertId } });
    expect(closed?.resolution).toBe('Animal reingresado al potrero');
    expect(closed?.responseMs).not.toBeNull();
  });

  it('cerrar una alerta ya cerrada → 409', async () => {
    await request(app).post(`/api/v1/alerts/${alertId}/close`)
      .set('Authorization', auth()).send({ resolution: 'otra vez' }).expect(409);
  });

  it('las acciones del ciclo de vida quedaron en audit_logs', async () => {
    const logs = await prisma.auditLog.findMany({ where: { farmId: FARM_ID, entityId: alertId } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('ALERT_ACKNOWLEDGED');
    expect(actions).toContain('ALERT_ASSIGNED');
    expect(actions).toContain('ALERT_CLOSED');
  });
});
