import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';

import { logger } from '@common/utils/logger';
import { notFound } from '@common/middleware/not-found.middleware';
import { errorHandler } from '@common/middleware/error-handler.middleware';
import { prisma } from '@prisma/prisma.service';
import { redisClient } from '@redis/redis.service';

// ── Servicios de tiempo real (Sprint 3) ──────────────────────────────────────
import { initQueues, closeQueues } from '@workers/queues';
import { wsGateway } from '@realtime/ws.gateway';
import { mqttService } from '@gps/mqtt.service';

// ── Módulos de rutas (se irán agregando sprint a sprint) ─────────────────────
import { authRouter }    from '@auth/auth.router';
import { animalsRouter } from '@animals/animals.router';
import { devicesRouter } from '@admin/devices/devices.router';

// ── Configuración ─────────────────────────────────────────────────────────────
const PORT       = parseInt(process.env['PORT'] ?? '4000', 10);
const API_PREFIX = process.env['API_PREFIX'] ?? '/api/v1';
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
const NODE_ENV   = process.env['NODE_ENV'] ?? 'development';

// ── Aplicación Express ────────────────────────────────────────────────────────
const app = express();

// ── Middlewares de seguridad ───────────────────────────────────────────────────
app.use(helmet());                      // Cabeceras de seguridad HTTP
app.use(cors({
  origin:      CORS_ORIGIN,
  credentials: true,                    // Necesario para cookies HttpOnly (refresh token)
  methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
}));

// ── Middlewares de parseo ──────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Necesario para leer req.cookies (refresh token)

// ── Logging de requests HTTP ───────────────────────────────────────────────────
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: { write: (msg) => logger.http(msg.trim()) },
  // No loguear health checks para no saturar los logs
  skip: (req) => req.url === '/health',
}));

// ── Health check (sin prefijo, para Docker / Railway) ────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status:  'ok',
    service: 'smartcow-api',
    version: process.env['npm_package_version'] ?? '0.1.0',
    env:     NODE_ENV,
  });
});

// ── Rutas de la API ────────────────────────────────────────────────────────────
app.use(`${API_PREFIX}/auth`,          authRouter);
app.use(`${API_PREFIX}/animals`,       animalsRouter);
app.use(`${API_PREFIX}/admin/devices`, devicesRouter);

// Sprint 3+: agregar aquí los demás routers
// app.use(`${API_PREFIX}/geofences`, geofenceRouter);
// app.use(`${API_PREFIX}/alerts`,    alertsRouter);
// app.use(`${API_PREFIX}/analytics`, analyticsRouter);

// ── Manejo de rutas no encontradas y errores ──────────────────────────────────
// Orden OBLIGATORIO: notFound → errorHandler
app.use(notFound);
app.use(errorHandler);

// ── Servidor HTTP (envuelve Express para Socket.IO en sprints futuros) ────────
const httpServer = createServer(app);

// ── Arranque ──────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Verificar conexión a PostgreSQL antes de aceptar tráfico
  await prisma.$connect();
  logger.info('PostgreSQL conectado');

  // Verificar conexión a Redis
  await redisClient.ping();
  logger.info('Redis conectado');

  // Colas productoras Bull MQ (los consumidores corren en el proceso worker aparte)
  initQueues();

  // WebSocket Gateway (Socket.IO) adjunto al mismo servidor HTTP
  wsGateway.init(httpServer);

  // Ingesta MQTT de telemetría IoT
  mqttService.connect();
  logger.info('MQTT service inicializado');

  httpServer.listen(PORT, () => {
    logger.info(`smartcow-api arrancado`, {
      port:      PORT,
      env:       NODE_ENV,
      apiPrefix: API_PREFIX,
    });
  });
}

// ── Cierre graceful ───────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`Señal ${signal} recibida — cerrando servidor...`);

  // Cerrar primero los servicios de tiempo real para dejar de aceptar eventos
  await Promise.allSettled([
    mqttService.disconnect(),
    wsGateway.close(),
    closeQueues(),
  ]);

  httpServer.close(async () => {
    await prisma.$disconnect();
    redisClient.disconnect();
    logger.info('Servidor cerrado correctamente');
    process.exit(0);
  });

  // Forzar cierre si tarda más de 10 segundos
  setTimeout(() => {
    logger.error('Cierre forzado tras timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

bootstrap().catch((err: unknown) => {
  logger.error('Error fatal durante bootstrap', { err });
  process.exit(1);
});

export { app, httpServer };
