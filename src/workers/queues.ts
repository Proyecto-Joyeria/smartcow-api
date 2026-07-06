import { Queue, type JobsOptions, type ConnectionOptions } from 'bullmq';

import { logger } from '@common/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// Definición central de colas Bull MQ — Sprint 3
//
// Este módulo lo importan DOS procesos distintos:
//   - La API (productor): encola jobs desde gps.service tras recibir telemetría.
//   - El worker (consumidor): src/workers/index.ts crea los Worker que procesan.
//
// Por eso aquí solo viven: nombres de cola, tipos de job, opciones por defecto y
// las instancias productoras (lazy). Los Worker se crean en index.ts.
// ═══════════════════════════════════════════════════════════════════════════════

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

/**
 * Opciones de conexión para Bull MQ, parseadas de REDIS_URL.
 *
 * Pasamos un OBJETO de opciones (no una instancia ioredis) deliberadamente:
 *   1. Bull MQ empaqueta su propia copia de ioredis; pasar una instancia del ioredis
 *      de primer nivel produce un choque de identidad de tipos. Con opciones, Bull MQ
 *      instancia su propio cliente y el problema desaparece.
 *   2. Cada Queue/Worker recibe su propia conexión interna — justo lo que necesitan
 *      los Worker, que ejecutan comandos bloqueantes.
 *
 * `maxRetriesPerRequest: null` es OBLIGATORIO para Bull MQ.
 */
function parseBullConnection(): ConnectionOptions {
  const url = new URL(REDIS_URL);
  const conn: Record<string, unknown> = {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 6379,
    maxRetriesPerRequest: null,
  };
  if (url.password) conn['password'] = decodeURIComponent(url.password);
  if (url.username && url.username !== 'default') conn['username'] = decodeURIComponent(url.username);
  if (url.pathname.length > 1) conn['db'] = parseInt(url.pathname.slice(1), 10);
  if (url.protocol === 'rediss:') conn['tls'] = {};
  return conn as ConnectionOptions;
}

export const bullConnection: ConnectionOptions = parseBullConnection();

// ── Nombres de cola ─────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  PERSIST_GPS:      'persist-gps',
  EVALUATE_ALERTS:  'evaluate-alerts',
  NOTIFICATIONS:    'notifications',   // Sprint 5
  PERIODIC_CHECKS:  'periodic-checks', // Sprint 5 (sensor offline / inmovilidad)
} as const;

// ── Tipos de datos de los jobs ──────────────────────────────────────────────────

/** Snapshot completo de una lectura de telemetría, resuelto a animal + finca */
export interface TelemetryJobData {
  deviceId:        string;
  animalId:        string;
  farmId:          string;
  firmwareVersion: string;
  gps: {
    lat:        number;
    lng:        number;
    alt:        number | null;
    accuracy:   number | null;
    speedKmh:   number | null;
    recordedAt: string;  // ISO 8601 (los jobs se serializan a JSON → no Date)
  };
  vitals: {
    tempC:      number;
    heartBpm:   number;
    activity:   number;
    batteryPct: number;
    recordedAt: string;  // ISO 8601
  };
}

export type PersistGpsJobData     = TelemetryJobData;
export type EvaluateAlertsJobData = TelemetryJobData;

/** Job de notificación de una alerta (email/SMS según prioridad). Sprint 5. */
export interface NotificationJobData {
  alertId:     string;
  farmId:      string;
  animalId:    string;
  ruleId:      string;
  priority:    'CRITICAL' | 'WARNING' | 'INFO';
  title:       string;
  description: string;
}

/** Job del barrido periódico de reglas dependientes de estado. Sprint 5. */
export interface PeriodicChecksJobData {
  kind: 'sensor-offline-and-immobility';
}

// ── Opciones por defecto (reintentos + backoff, según architecture.md) ──────────

/** persist-gps: prioridad Alta, 5 reintentos */
export const PERSIST_GPS_JOB_OPTS: JobsOptions = {
  attempts:        5,
  backoff:         { type: 'exponential', delay: 1_000 },
  removeOnComplete: 1_000,  // conserva las últimas 1000 para inspección
  removeOnFail:     5_000,
};

/** evaluate-alerts: prioridad Crítica, 3 reintentos */
export const EVALUATE_ALERTS_JOB_OPTS: JobsOptions = {
  attempts:        3,
  backoff:         { type: 'exponential', delay: 1_000 },
  removeOnComplete: 1_000,
  removeOnFail:     5_000,
};

/** notifications: 3 reintentos con backoff largo (SendGrid/Twilio 5xx) — IDD §8.1 */
export const NOTIFICATIONS_JOB_OPTS: JobsOptions = {
  attempts:        3,
  backoff:         { type: 'exponential', delay: 30_000 }, // 30s → 2min → 8min aprox
  removeOnComplete: 1_000,
  removeOnFail:     5_000,
};

/** Concurrencia de cada Worker (la consume index.ts al crear los Worker) */
export const QUEUE_CONCURRENCY = {
  PERSIST_GPS:     10,
  EVALUATE_ALERTS: 5,
  NOTIFICATIONS:   5,
  PERIODIC_CHECKS: 1,
} as const;

/** Cada cuánto corre el barrido periódico (sensor offline / inmovilidad). */
export const PERIODIC_CHECKS_EVERY_MS = 5 * 60 * 1000; // 5 min

// ── Instancias productoras (lazy singletons) ────────────────────────────────────

let persistGpsQueue:     Queue<PersistGpsJobData>       | null = null;
let evaluateAlertsQueue: Queue<EvaluateAlertsJobData>   | null = null;
let notificationsQueue:  Queue<NotificationJobData>     | null = null;
let periodicChecksQueue: Queue<PeriodicChecksJobData>   | null = null;

export function getPersistGpsQueue(): Queue<PersistGpsJobData> {
  if (!persistGpsQueue) {
    // Cast: los genéricos condicionales de Queue en Bull MQ v5 no se unifican con
    // la anotación simple, pero el runtime es correcto.
    persistGpsQueue = new Queue(QUEUE_NAMES.PERSIST_GPS, {
      connection:        bullConnection,
      defaultJobOptions: PERSIST_GPS_JOB_OPTS,
    }) as Queue<PersistGpsJobData>;
  }
  return persistGpsQueue;
}

export function getEvaluateAlertsQueue(): Queue<EvaluateAlertsJobData> {
  if (!evaluateAlertsQueue) {
    evaluateAlertsQueue = new Queue(QUEUE_NAMES.EVALUATE_ALERTS, {
      connection:        bullConnection,
      defaultJobOptions: EVALUATE_ALERTS_JOB_OPTS,
    }) as Queue<EvaluateAlertsJobData>;
  }
  return evaluateAlertsQueue;
}

export function getNotificationsQueue(): Queue<NotificationJobData> {
  if (!notificationsQueue) {
    notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
      connection:        bullConnection,
      defaultJobOptions: NOTIFICATIONS_JOB_OPTS,
    }) as Queue<NotificationJobData>;
  }
  return notificationsQueue;
}

export function getPeriodicChecksQueue(): Queue<PeriodicChecksJobData> {
  if (!periodicChecksQueue) {
    periodicChecksQueue = new Queue(QUEUE_NAMES.PERIODIC_CHECKS, {
      connection: bullConnection,
    }) as Queue<PeriodicChecksJobData>;
  }
  return periodicChecksQueue;
}

/**
 * Inicializa las colas productoras al arrancar la API (Sprint 3, sección 9).
 * Idempotente: getXQueue() ya es lazy; esto fuerza la creación y deja traza.
 */
export function initQueues(): void {
  getPersistGpsQueue();
  getEvaluateAlertsQueue();
  getNotificationsQueue();
  getPeriodicChecksQueue();
  logger.info('Bull MQ: colas productoras inicializadas', {
    queues: Object.values(QUEUE_NAMES),
  });
}

/**
 * Programa el job repetible del barrido periódico (sensor offline / inmovilidad)
 * cada 5 min. Idempotente: Bull MQ deduplica por `jobId` repetible, así que llamarlo
 * en cada arranque no crea duplicados.
 */
export async function schedulePeriodicChecks(): Promise<void> {
  await getPeriodicChecksQueue().add(
    'scan',
    { kind: 'sensor-offline-and-immobility' },
    {
      repeat:  { every: PERIODIC_CHECKS_EVERY_MS },
      jobId:   'periodic-checks-scan',
      removeOnComplete: 100,
      removeOnFail:     100,
    },
  );
  logger.info('Bull MQ: barrido periódico programado', { everyMs: PERIODIC_CHECKS_EVERY_MS });
}

/** Cierra las colas productoras en el shutdown graceful de la API. */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    persistGpsQueue?.close(),
    evaluateAlertsQueue?.close(),
    notificationsQueue?.close(),
    periodicChecksQueue?.close(),
  ]);
  persistGpsQueue     = null;
  evaluateAlertsQueue = null;
  notificationsQueue  = null;
  periodicChecksQueue = null;
}
