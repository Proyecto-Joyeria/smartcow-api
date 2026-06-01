import { PrismaClient } from '@prisma/client';
import { logger } from '@common/utils/logger';

const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

// Nivel de log de Prisma según entorno:
// - development: query + error + warn
// - production: solo error
const prismaLogLevels: ('query' | 'info' | 'warn' | 'error')[] =
  NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'];

// Singleton — un solo PrismaClient por proceso para reutilizar el pool de conexiones.
// En dev, tsx recarga el módulo en cada cambio, lo que crearía múltiples instancias
// si no guardamos la referencia en globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogLevels,
  });

if (NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Redirigir los logs de Prisma a Winston
prisma.$on('warn' as never, (e: { message: string }) => {
  logger.warn('Prisma warn', { message: e.message });
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});
