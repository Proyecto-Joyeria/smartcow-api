import type { Server as HttpServer } from 'http';
import { Server as IOServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type Redis from 'ioredis';

import { logger } from '@common/utils/logger';
import { subscribeToFarm, type GpsEventPayload } from '@redis/redis.service';
import type { JwtPayload } from '@auth/auth.types';

// ═══════════════════════════════════════════════════════════════════════════════
// WebSocket Gateway (Socket.IO) — Sprint 3
//
// Namespace dinámico por finca: /farms/{farmId}. El JWT se valida en el handshake
// ANTES de aceptar el socket. Cada finca con clientes activos mantiene UNA sola
// suscripción Redis (refcount), no una por socket, para no fugar conexiones.
// ═══════════════════════════════════════════════════════════════════════════════

const JWT_PUBLIC_KEY = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');
const CORS_ORIGIN    = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';

/** Suscripción Redis compartida por todos los sockets de una finca */
interface FarmSubscription {
  subscriber: Redis;
  refCount:   number;
}

class WsGateway {
  private io: IOServer | null = null;
  private readonly farmSubscriptions = new Map<string, FarmSubscription>();

  /** Adjunta Socket.IO al servidor HTTP y configura el namespace por finca. */
  init(httpServer: HttpServer): void {
    this.io = new IOServer(httpServer, {
      cors: { origin: CORS_ORIGIN, credentials: true },
    });

    // Namespace dinámico: /farms/{farmId} (farmId es un cuid → [\w-]+)
    const farms = this.io.of(/^\/farms\/[\w-]+$/);
    farms.use((socket, next) => this.authenticate(socket, next));
    farms.on('connection', (socket) => this.onConnection(socket));

    logger.info('WebSocket gateway inicializado', { namespace: '/farms/:farmId' });
  }

  /**
   * Middleware de handshake: valida el JWT RS256 y que la finca del token coincida
   * con la del namespace. Rechaza tempTokens 2FA y tokens inválidos.
   */
  private authenticate(socket: Socket, next: (err?: Error) => void): void {
    const authToken  = socket.handshake.auth['token'] as string | undefined;
    const queryToken = typeof socket.handshake.query['token'] === 'string'
      ? socket.handshake.query['token']
      : undefined;
    const token = authToken ?? queryToken;

    if (!token) {
      next(new Error('UNAUTHORIZED: token de autenticación requerido'));
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as JwtPayload;

      // Rechazar tempTokens del flujo 2FA — no son access tokens válidos
      if ('type' in payload && (payload as Record<string, unknown>)['type'] === '2fa_pending') {
        next(new Error('UNAUTHORIZED: token temporal no válido para WebSocket'));
        return;
      }

      // El farmId del namespace debe coincidir con el del token (aislamiento)
      const nsFarmId = socket.nsp.name.split('/')[2];
      if (!nsFarmId || payload.farmId !== nsFarmId) {
        next(new Error('FORBIDDEN: la finca del token no coincide con el namespace'));
        return;
      }

      socket.data.user = payload;
      next();
    } catch {
      next(new Error('UNAUTHORIZED: token inválido o expirado'));
    }
  }

  private onConnection(socket: Socket): void {
    const user   = socket.data.user as JwtPayload;
    const farmId = user.farmId;

    socket.join(`farm:${farmId}`);
    this.ensureFarmSubscription(farmId);

    logger.info('WS: cliente conectado', { farmId, socketId: socket.id, userId: user.sub });

    // ── Eventos cliente → servidor ─────────────────────────────────────────────
    socket.on('subscribe:animal', (data: { animalId?: string }) => {
      if (data?.animalId) {
        void socket.join(`animal:${data.animalId}`);
        logger.debug('WS: suscrito a animal', { socketId: socket.id, animalId: data.animalId });
      }
    });

    socket.on('unsubscribe:animal', (data: { animalId?: string }) => {
      if (data?.animalId) {
        void socket.leave(`animal:${data.animalId}`);
      }
    });

    socket.on('ping', (data: { ts?: number }) => {
      socket.emit('pong', { ts: data?.ts ?? null, serverTs: Date.now() });
    });

    // ── Limpieza al desconectar ────────────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
      this.releaseFarmSubscription(farmId);
      logger.info('WS: cliente desconectado', { farmId, socketId: socket.id, reason });
    });
  }

  /**
   * Garantiza una única suscripción Redis por finca. El primer socket de la finca
   * la crea; los siguientes solo incrementan el refcount. El callback reemite cada
   * evento de posición a los clientes de esa finca.
   */
  private ensureFarmSubscription(farmId: string): void {
    const existing = this.farmSubscriptions.get(farmId);
    if (existing) {
      existing.refCount += 1;
      return;
    }

    const subscriber = subscribeToFarm(farmId, (payload: GpsEventPayload) => {
      this.io?.of(`/farms/${farmId}`).to(`farm:${farmId}`).emit('animal:position', payload);
    });

    this.farmSubscriptions.set(farmId, { subscriber, refCount: 1 });
    logger.debug('WS: suscripción Redis creada para finca', { farmId });
  }

  /** Decrementa el refcount; cuando llega a 0 cierra la suscripción Redis. */
  private releaseFarmSubscription(farmId: string): void {
    const sub = this.farmSubscriptions.get(farmId);
    if (!sub) return;

    sub.refCount -= 1;
    if (sub.refCount <= 0) {
      void sub.subscriber.unsubscribe();
      void sub.subscriber.quit();
      this.farmSubscriptions.delete(farmId);
      logger.debug('WS: suscripción Redis cerrada para finca', { farmId });
    }
  }

  /** Cierra el gateway y todas las suscripciones Redis en el shutdown graceful. */
  async close(): Promise<void> {
    for (const sub of this.farmSubscriptions.values()) {
      void sub.subscriber.unsubscribe();
      void sub.subscriber.quit();
    }
    this.farmSubscriptions.clear();

    await new Promise<void>((resolve) => {
      if (!this.io) { resolve(); return; }
      this.io.close(() => resolve());
    });
  }
}

export const wsGateway = new WsGateway();
