import { prisma } from '@prisma/prisma.service';
import type {
  IAuthRepository,
  UserWithFarm,
  CreateUserWithFarmInput,
  SaveRefreshTokenInput,
  StoredRefreshToken,
} from '@auth/auth.types';
import { UserRole } from '@prisma/client';

// Selector reutilizable — incluye userFarms para extraer farmId y role
const USER_WITH_FARM_SELECT = {
  id:               true,
  email:            true,
  passwordHash:     true,
  firstName:        true,
  lastName:         true,
  twoFactorSecret:  true,
  twoFactorEnabled: true,
  loginAttempts:    true,
  lockedUntil:      true,
  active:           true,
  userFarms: {
    select: {
      farmId: true,
      role:   true,
    },
  },
} as const;

export class AuthRepository implements IAuthRepository {
  async findUserByEmail(email: string): Promise<UserWithFarm | null> {
    return prisma.user.findUnique({
      where:  { email },
      select: USER_WITH_FARM_SELECT,
    });
  }

  async findUserById(userId: string): Promise<UserWithFarm | null> {
    return prisma.user.findUnique({
      where:  { id: userId },
      select: USER_WITH_FARM_SELECT,
    });
  }

  /**
   * Transacción atómica: crea User + Farm + UserFarm en una sola operación.
   * Si cualquier paso falla, se hace rollback completo — nunca quedan datos huérfanos.
   */
  async createUserWithFarm(data: CreateUserWithFarmInput): Promise<UserWithFarm> {
    return prisma.$transaction(async (tx) => {
      const farm = await tx.farm.create({
        data: { name: data.farmName },
      });

      const user = await tx.user.create({
        data: {
          email:        data.email,
          passwordHash: data.passwordHash,
          firstName:    data.firstName,
          lastName:     data.lastName,
          phone:        data.phone,
          userFarms: {
            create: {
              farmId: farm.id,
              role:   UserRole.ADMIN, // El primer usuario de una finca siempre es ADMIN
            },
          },
        },
        select: USER_WITH_FARM_SELECT,
      });

      return user;
    });
  }

  async updateUserLoginSuccess(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: 0,
        lockedUntil:   null,
        lastLoginAt:   new Date(),
      },
    });
  }

  async updateUserLoginFailed(
    userId: string,
    attempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data:  { loginAttempts: attempts, lockedUntil },
    });
  }

  async updateTwoFactorSecret(userId: string, encryptedSecret: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data:  { twoFactorSecret: encryptedSecret },
    });
  }

  async enableTwoFactor(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data:  { twoFactorEnabled: true },
    });
  }

  async saveRefreshToken(data: SaveRefreshTokenInput): Promise<void> {
    await prisma.refreshToken.create({ data });
  }

  async findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        tokenHash: true,
        userId:    true,
        farmId:    true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { tokenHash },
      data:  { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  }
}

// Instancia singleton exportada — los servicios la importan directamente
export const authRepository = new AuthRepository();
