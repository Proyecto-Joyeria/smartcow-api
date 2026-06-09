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

// ═══════════════════════════════════════════════════════════════════════════════
// GPS en tiempo real — Sprint 3
//
// El flujo de tiempo real NUNCA toca PostgreSQL. La posición vigente de cada animal
// vive en Redis (HSET con TTL 24h) para lecturas < 2ms desde el mapa. La persistencia
// histórica la hace el worker persist-gps de forma asíncrona.
//
// Nota sobre pub/sub: ioredis NO aplica `keyPrefix` a los canales de PUBLISH/SUBSCRIBE,
// solo a las claves. Por eso publisher y subscriber usan el mismo nombre de canal literal.
// ═══════════════════════════════════════════════════════════════════════════════

const POSITION_TTL_SECONDS      = 24 * 60 * 60; // 24h
const DEVICE_ROUTING_TTL_SECONDS = 60 * 60;     // 1h

/** Clave del hash de posición vigente de un animal */
const animalPositionKey = (animalId: string): string => `animal:${animalId}:position`;
/** Set de animalIds con posición activa por finca (para getAllFarmPositions) */
const farmPositionsKey  = (farmId: string): string => `farm:${farmId}:positions`;
/** Canal pub/sub de eventos en tiempo real de una finca */
const farmChannel       = (farmId: string): string => `farm:${farmId}:channel`;
/** Hash de routing deviceId → { animalId, farmId } (cache del lookup de PostgreSQL) */
const deviceRoutingKey  = (deviceId: string): string => `device:${deviceId}`;

/** Posición geográfica vigente de un animal almacenada en Redis */
export interface RedisAnimalPosition {
  animalId: string;
  farmId:   string;
  lat:      number;
  lng:      number;
  ts:       number;   // unix ms del fix GPS
  speed:    number;   // km/h
}

/** Payload publicado en el canal pub/sub de la finca (lo consume el WS gateway) */
export interface GpsEventPayload {
  animalId: string;
  lat:      number;
  lng:      number;
  ts:       number;
  speed:    number;
}

/** Resolución deviceId → animal + finca (cacheada para evitar hit a PostgreSQL) */
export interface DeviceRouting {
  animalId: string;
  farmId:   string;
}

/**
 * Actualiza la posición vigente de un animal en Redis con TTL de 24h.
 * Además registra el animal en el set de la finca para poder listarlas todas.
 * Operación de tiempo real: debe completar en milisegundos.
 */
export async function setAnimalPosition(
  animalId: string,
  farmId:   string,
  lat:      number,
  lng:      number,
  ts:       number,
  speed:    number,
): Promise<void> {
  const key = animalPositionKey(animalId);
  const pipeline = redisClient.pipeline();
  pipeline.hset(key, { animalId, farmId, lat, lng, ts, speed });
  pipeline.expire(key, POSITION_TTL_SECONDS);
  pipeline.sadd(farmPositionsKey(farmId), animalId);
  pipeline.expire(farmPositionsKey(farmId), POSITION_TTL_SECONDS);
  await pipeline.exec();
}

/** Devuelve la posición más reciente de un animal, o null si no hay dato en cache. */
export async function getAnimalPosition(animalId: string): Promise<RedisAnimalPosition | null> {
  const raw = await redisClient.hgetall(animalPositionKey(animalId));
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    animalId: raw['animalId'] ?? animalId,
    farmId:   raw['farmId']   ?? '',
    lat:      Number(raw['lat']),
    lng:      Number(raw['lng']),
    ts:       Number(raw['ts']),
    speed:    Number(raw['speed'] ?? 0),
  };
}

/** Devuelve las posiciones vigentes de todos los animales de una finca. */
export async function getAllFarmPositions(farmId: string): Promise<RedisAnimalPosition[]> {
  const animalIds = await redisClient.smembers(farmPositionsKey(farmId));
  if (animalIds.length === 0) return [];

  const pipeline = redisClient.pipeline();
  for (const id of animalIds) pipeline.hgetall(animalPositionKey(id));
  const results = await pipeline.exec();
  if (!results) return [];

  const positions: RedisAnimalPosition[] = [];
  results.forEach(([, value], idx) => {
    const raw = value as Record<string, string> | null;
    if (raw && Object.keys(raw).length > 0) {
      positions.push({
        animalId: raw['animalId'] ?? animalIds[idx] ?? '',
        farmId:   raw['farmId']   ?? farmId,
        lat:      Number(raw['lat']),
        lng:      Number(raw['lng']),
        ts:       Number(raw['ts']),
        speed:    Number(raw['speed'] ?? 0),
      });
    }
  });
  return positions;
}

/** Publica un evento de posición en el canal pub/sub de la finca. */
export async function publishGpsEvent(farmId: string, payload: GpsEventPayload): Promise<void> {
  await redisClient.publish(farmChannel(farmId), JSON.stringify(payload));
}

/**
 * Suscribe un callback al canal pub/sub de una finca usando una conexión dedicada
 * (los clientes en modo suscriptor no pueden ejecutar otros comandos).
 * Devuelve el cliente suscriptor — el llamador DEBE invocar `.unsubscribe()` y
 * `.quit()` sobre él al limpiar recursos para no fugar conexiones.
 */
export function subscribeToFarm(
  farmId:   string,
  callback: (payload: GpsEventPayload) => void,
): Redis {
  const subscriber = redisClient.duplicate();
  const channel = farmChannel(farmId);

  subscriber.subscribe(channel).catch((err: Error) => {
    logger.error('Redis: error al suscribirse al canal de finca', { farmId, message: err.message });
  });

  subscriber.on('message', (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      callback(JSON.parse(message) as GpsEventPayload);
    } catch {
      logger.warn('Redis: mensaje pub/sub no es JSON válido', { channel: ch });
    }
  });

  return subscriber;
}

/** Cachea el routing deviceId → { animalId, farmId } por 1h (HSET device:{id}). */
export async function cacheDeviceRouting(
  deviceId: string,
  animalId: string,
  farmId:   string,
): Promise<void> {
  const key = deviceRoutingKey(deviceId);
  const pipeline = redisClient.pipeline();
  pipeline.hset(key, { animalId, farmId });
  pipeline.expire(key, DEVICE_ROUTING_TTL_SECONDS);
  await pipeline.exec();
}

/** Lee el routing cacheado de un device, o null si no está en cache. */
export async function getCachedDeviceRouting(deviceId: string): Promise<DeviceRouting | null> {
  const raw = await redisClient.hgetall(deviceRoutingKey(deviceId));
  if (!raw || !raw['animalId'] || !raw['farmId']) return null;
  return { animalId: raw['animalId'], farmId: raw['farmId'] };
}
