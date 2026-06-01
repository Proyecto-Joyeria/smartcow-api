import Redis from 'ioredis';
import { logger } from '@common/utils/logger';

const REDIS_URL        = process.env['REDIS_URL']        ?? 'redis://localhost:6379';
const REDIS_KEY_PREFIX = process.env['REDIS_KEY_PREFIX'] ?? 'smartcow:';

// ── Configuración de reconexión ───────────────────────────────────────────────
// Backoff exponencial: 50ms → 100ms → 200ms → ... → máx 2000ms
const RECONNECT_MAX_DELAY_MS = 2_000;
const RECONNECT_MAX_ATTEMPTS = 20;

function retryStrategy(times: number): number | null {
  if (times > RECONNECT_MAX_ATTEMPTS) {
    logger.error('Redis: número máximo de reintentos alcanzado. Abortando reconexión.');
    return null; // Detiene los reintentos
  }
  const delay = Math.min(50 * Math.pow(2, times - 1), RECONNECT_MAX_DELAY_MS);
  logger.warn(`Redis: reintentando conexión (intento ${times})`, { delayMs: delay });
  return delay;
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// Un solo cliente para operaciones de lectura/escritura.
// Las operaciones pub/sub requieren clientes dedicados (crear con redisClient.duplicate()).
export const redisClient = new Redis(REDIS_URL, {
  keyPrefix:      REDIS_KEY_PREFIX,
  retryStrategy,
  maxRetriesPerRequest: null, // BullMQ requiere null para manejar sus propios reintentos
  enableReadyCheck:     true,
  lazyConnect:          false,
});

// ── Eventos de ciclo de vida ──────────────────────────────────────────────────
redisClient.on('connect', () => {
  logger.info('Redis: conexión establecida', { url: REDIS_URL });
});

redisClient.on('ready', () => {
  logger.info('Redis: cliente listo para recibir comandos');
});

redisClient.on('error', (err: Error) => {
  logger.error('Redis: error de cliente', { message: err.message });
});

redisClient.on('close', () => {
  logger.warn('Redis: conexión cerrada');
});

redisClient.on('reconnecting', (delayMs: number) => {
  logger.warn('Redis: reconectando...', { delayMs });
});

redisClient.on('end', () => {
  logger.warn('Redis: todas las reconexiones agotadas, cliente desconectado');
});

// ── Helpers tipados ───────────────────────────────────────────────────────────

/**
 * Obtiene un valor JSON deserializado desde Redis.
 * Retorna null si la clave no existe o si el valor no es JSON válido.
 */
export async function redisGet<T>(key: string): Promise<T | null> {
  const raw = await redisClient.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    logger.warn('Redis: valor no es JSON válido', { key });
    return null;
  }
}

/**
 * Almacena un valor JSON serializado en Redis con TTL en segundos.
 * Si ttlSeconds es 0 o no se pasa, la clave no expira.
 */
export async function redisSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await redisClient.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await redisClient.set(key, serialized);
  }
}

/**
 * Elimina una o más claves de Redis.
 */
export async function redisDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await redisClient.del(...keys);
}

/**
 * Incrementa un contador y establece TTL solo en la primera escritura.
 * Útil para rate limiting y contadores de intentos de login.
 * Retorna el valor del contador tras el incremento.
 */
export async function redisIncrWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const pipeline = redisClient.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ttlSeconds, 'NX'); // NX: solo setea TTL si no existe
  const results = await pipeline.exec();
  const incrResult = results?.[0];
  return (incrResult?.[1] as number | null) ?? 0;
}
