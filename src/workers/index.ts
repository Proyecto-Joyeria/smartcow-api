import 'dotenv/config';
import { Worker, type Job } from 'bullmq';

import { logger } from '@common/utils/logger';
import {
  QUEUE_NAMES,
  QUEUE_CONCURRENCY,
  bullConnection,
  type PersistGpsJobData,
  type EvaluateAlertsJobData,
} from '@workers/queues';
import { persistGpsProcessor } from '@workers/processors/persist-gps.processor';
import { evaluateAlertsProcessor } from '@workers/processors/evaluate-alerts.processor';

// ═══════════════════════════════════════════════════════════════════════════════
// Entry point del proceso worker — Sprint 3
//
// Corre SEPARADO de la API (npm run dev:worker). Consume las colas Bull MQ que la
// API alimenta con la telemetría IoT. Cada Worker usa su propia conexión Redis
// porque ejecuta comandos bloqueantes.
// ═══════════════════════════════════════════════════════════════════════════════

const workers: Worker[] = [];

function attachLifecycle(worker: Worker, queueName: string): void {
  worker.on('completed', (job: Job) => {
    logger.debug('Worker: job completado', { queue: queueName, jobId: job.id });
  });
  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error('Worker: job falló', {
      queue:    queueName,
      jobId:    job?.id,
      attempts: job?.attemptsMade,
      message:  err.message,
    });
  });
  worker.on('error', (err: Error) => {
    logger.error('Worker: error interno', { queue: queueName, message: err.message });
  });
}

function startWorkers(): void {
  const persistGpsWorker = new Worker<PersistGpsJobData>(
    QUEUE_NAMES.PERSIST_GPS,
    persistGpsProcessor,
    { connection: bullConnection, concurrency: QUEUE_CONCURRENCY.PERSIST_GPS },
  );
  attachLifecycle(persistGpsWorker, QUEUE_NAMES.PERSIST_GPS);

  const evaluateAlertsWorker = new Worker<EvaluateAlertsJobData>(
    QUEUE_NAMES.EVALUATE_ALERTS,
    evaluateAlertsProcessor,
    { connection: bullConnection, concurrency: QUEUE_CONCURRENCY.EVALUATE_ALERTS },
  );
  attachLifecycle(evaluateAlertsWorker, QUEUE_NAMES.EVALUATE_ALERTS);

  workers.push(persistGpsWorker, evaluateAlertsWorker);

  logger.info('Workers Bull MQ arrancados', {
    queues: [
      { name: QUEUE_NAMES.PERSIST_GPS,     concurrency: QUEUE_CONCURRENCY.PERSIST_GPS },
      { name: QUEUE_NAMES.EVALUATE_ALERTS, concurrency: QUEUE_CONCURRENCY.EVALUATE_ALERTS },
    ],
  });
}

// ── Cierre graceful ─────────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`Worker: señal ${signal} recibida — cerrando workers...`);
  await Promise.all(workers.map((w) => w.close()));
  logger.info('Worker: cerrado correctamente');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

startWorkers();
