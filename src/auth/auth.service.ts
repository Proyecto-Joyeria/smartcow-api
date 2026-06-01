import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

import { authRepository } from '@auth/auth.repository';
import { redisIncrWithTtl, redisDel, redisGet, redisSet } from '@redis/redis.service';
import { AppError } from '@common/utils/app-error';
import { logger } from '@common/utils/logger';

import type {
  IAuthService,
  JwtPayload,
  TempTokenPayload,
  AuthTokensDto,
  TwoFactorRequiredDto,
  TwoFactorSetupDto,
  UserWithFarm,
} from '@auth/auth.types';
import { ROLE_PERMISSIONS } from '@auth/auth.types';
import type { LoginDto, RegisterDto, TwoFactorVerifyDto } from '@auth/auth.schemas';

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS       = 5;
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutos
const BCRYPT_ROUNDS            = 12;

// Las claves RSA pueden llegar con \n literales desde el archivo .env
const JWT_PRIVATE_KEY        = (process.env['JWT_PRIVATE_KEY']        ?? '').replace(/\\n/g, '\n');
const JWT_PUBLIC_KEY         = (process.env['JWT_PUBLIC_KEY']         ?? '').replace(/\\n/g, '\n');
const JWT_ACCESS_EXPIRES_IN  =  process.env['JWT_ACCESS_EXPIRES_IN']  ?? '8h';
const JWT_REFRESH_EXPIRES_IN =  process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d';

// Clave AES-256: 64 hex chars = 32 bytes
const TWO_FACTOR_KEY = process.env['TWO_FACTOR_ENCRYPTION_KEY'] ?? '';

// ── Claves Redis ──────────────────────────────────────────────────────────────
// Nota: el prefijo smartcow: es añadido automáticamente por el cliente Redis
const loginAttemptsKey = (userId: string) => `auth:login-attempts:${userId}`;
const accountLockedKey = (userId: string) => `auth:account-locked:${userId}`;

// ── Helpers privados ──────────────────────────────────────────────────────────

/** Convierte "8h" → 28800 (segundos) */
function parseExpiresInToSeconds(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 8 * 3600;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  return parseInt(match[1] ?? '8', 10) * (multipliers[match[2] ?? 'h'] ?? 3600);
}

/** Convierte "30d" → milisegundos */
function parseExpiresInToMs(value: string): number {
  return parseExpiresInToSeconds(value) * 1000;
}

/** Cifra un plaintext con AES-256-CBC. Formato salida: "ivHex:ciphertextHex" */
function encryptSecret(plaintext: string): string {
  const key     = Buffer.from(TWO_FACTOR_KEY, 'hex'); // 32 bytes → AES-256
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-cbc', key, iv);
  const payload = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${payload.toString('hex')}`;
}

/** Descifra un ciphertext con AES-256-CBC */
function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Formato de secreto 2FA inválido');
  }
  const key      = Buffer.from(TWO_FACTOR_KEY, 'hex');
  const iv       = Buffer.from(parts[0], 'hex');
  const payload  = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
}

/** SHA-256 del token raw — es lo que se almacena en BD */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Firma el access token RS256 con el payload completo del usuario */
function signAccessToken(user: UserWithFarm): { token: string; expiresIn: number } {
  const farmEntry = user.userFarms[0];
  if (!farmEntry) {
    throw new AppError(403, 'FORBIDDEN', 'El usuario no pertenece a ninguna finca');
  }

  const payload: JwtPayload = {
    sub:         user.id,
    farmId:      farmEntry.farmId,
    role:        farmEntry.role,
    permissions: ROLE_PERMISSIONS[farmEntry.role],
  };

  const token = jwt.sign(payload, JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);

  return { token, expiresIn: parseExpiresInToSeconds(JWT_ACCESS_EXPIRES_IN) };
}

// ── AuthService ───────────────────────────────────────────────────────────────

export class AuthService implements IAuthService {

  // ── login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthTokensDto | TwoFactorRequiredDto> {
    const user = await authRepository.findUserByEmail(dto.email);

    // Siempre ejecutar bcrypt.compare para evitar timing attacks por enumeración de emails
    if (!user || !user.active) {
      await bcrypt.compare(dto.password, '$2b$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    // Verificar bloqueo en Redis (más rápido que consultar BD)
    const isLockedRedis = await redisGet<boolean>(accountLockedKey(user.id));
    if (isLockedRedis || (user.lockedUntil !== null && user.lockedUntil > new Date())) {
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        'Cuenta bloqueada temporalmente. Intenta de nuevo en 15 minutos.',
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      // Incrementar contador en Redis con TTL de 15 min
      const attempts = await redisIncrWithTtl(
        loginAttemptsKey(user.id),
        LOCKOUT_DURATION_SECONDS,
      );

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_SECONDS * 1000);
        await authRepository.updateUserLoginFailed(user.id, attempts, lockedUntil);
        await redisSet(accountLockedKey(user.id), true, LOCKOUT_DURATION_SECONDS);

        logger.warn('AuthService: cuenta bloqueada por múltiples intentos fallidos', {
          userId:   user.id,
          attempts,
        });

        throw new AppError(
          423,
          'ACCOUNT_LOCKED',
          'Cuenta bloqueada 15 minutos por múltiples intentos fallidos.',
        );
      }

      await authRepository.updateUserLoginFailed(user.id, attempts, null);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    // ── Login exitoso ─────────────────────────────────────────────────────────
    await authRepository.updateUserLoginSuccess(user.id);
    await redisDel(loginAttemptsKey(user.id), accountLockedKey(user.id));
    logger.info('AuthService: login exitoso', { userId: user.id });

    // Si tiene 2FA activo → devolver tempToken en lugar del accessToken
    if (user.twoFactorEnabled) {
      const farmEntry = user.userFarms[0];
      if (!farmEntry) {
        throw new AppError(403, 'FORBIDDEN', 'El usuario no pertenece a ninguna finca');
      }

      const tempPayload: TempTokenPayload = {
        sub:    user.id,
        farmId: farmEntry.farmId,
        role:   farmEntry.role,
        type:   '2fa_pending',
      };

      const tempToken = jwt.sign(tempPayload, JWT_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '5m',
      } as jwt.SignOptions);

      return { twoFactorRequired: true, tempToken };
    }

    return this.issueTokens(user);
  }

  // ── register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    const existing = await authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Ya existe una cuenta con ese correo electrónico');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await authRepository.createUserWithFarm({
      email:        dto.email,
      passwordHash,
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      phone:        dto.phone,
      farmName:     dto.farmName,
    });

    logger.info('AuthService: usuario registrado', { userId: user.id, email: dto.email });

    return this.issueTokens(user);
  }

  // ── logout ─────────────────────────────────────────────────────────────────

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    const stored    = await authRepository.findRefreshToken(tokenHash);

    if (stored) {
      await authRepository.revokeRefreshToken(tokenHash);
      logger.info('AuthService: logout exitoso', { userId: stored.userId });
    }
  }

  // ── refreshTokens ──────────────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string): Promise<AuthTokensDto> {
    const tokenHash = hashToken(rawRefreshToken);
    const stored    = await authRepository.findRefreshToken(tokenHash);

    if (!stored) {
      throw new AppError(401, 'INVALID_TOKEN', 'Refresh token inválido');
    }

    // Token revocado → posible robo. Revocar TODOS los tokens del usuario (fail-safe).
    if (stored.revokedAt !== null) {
      await authRepository.revokeAllUserTokens(stored.userId);
      logger.warn('AuthService: reutilización de refresh token revocado detectada', {
        userId: stored.userId,
      });
      throw new AppError(401, 'INVALID_TOKEN', 'Refresh token inválido o ya utilizado');
    }

    if (stored.expiresAt < new Date()) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Refresh token expirado. Inicia sesión de nuevo.');
    }

    // Rotación: revocar token actual antes de emitir el nuevo
    await authRepository.revokeRefreshToken(tokenHash);

    const user = await authRepository.findUserById(stored.userId);
    if (!user || !user.active) {
      throw new AppError(401, 'UNAUTHORIZED', 'Usuario no encontrado o inactivo');
    }

    return this.issueTokens(user);
  }

  // ── generateTwoFactorSecret ────────────────────────────────────────────────

  async generateTwoFactorSecret(userId: string, email: string): Promise<TwoFactorSetupDto> {
    const secret = speakeasy.generateSecret({
      name:   `SmartCow (${email})`,
      length: 20,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Error al generar el secreto 2FA');
    }

    const encryptedSecret = encryptSecret(secret.base32);
    await authRepository.updateTwoFactorSecret(userId, encryptedSecret);

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    logger.info('AuthService: secreto 2FA generado', { userId });

    return { secret: secret.base32, qrCodeUrl };
  }

  // ── verifyTwoFactor ────────────────────────────────────────────────────────

  async verifyTwoFactor(dto: TwoFactorVerifyDto): Promise<AuthTokensDto> {
    let payload: TempTokenPayload;

    try {
      payload = jwt.verify(dto.tempToken, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
      }) as TempTokenPayload;
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Token temporal inválido o expirado');
    }

    if (payload.type !== '2fa_pending') {
      throw new AppError(401, 'INVALID_TOKEN', 'Tipo de token incorrecto');
    }

    const user = await authRepository.findUserById(payload.sub);
    if (!user || !user.active) {
      throw new AppError(401, 'UNAUTHORIZED', 'Usuario no encontrado o inactivo');
    }

    if (!user.twoFactorSecret) {
      throw new AppError(400, 'TWO_FACTOR_INVALID', '2FA no configurado para este usuario');
    }

    const plainSecret = decryptSecret(user.twoFactorSecret);

    const isValid = speakeasy.totp.verify({
      secret:   plainSecret,
      encoding: 'base32',
      token:    dto.token,
      window:   1, // Tolerancia de ±30 segundos (1 ventana de cada lado)
    });

    if (!isValid) {
      throw new AppError(401, 'TWO_FACTOR_INVALID', 'Código 2FA inválido o expirado');
    }

    // Primer verify después del setup → activar 2FA en BD
    if (!user.twoFactorEnabled) {
      await authRepository.enableTwoFactor(user.id);
    }

    logger.info('AuthService: verificación 2FA exitosa', { userId: user.id });

    return this.issueTokens(user);
  }

  // ── issueTokens (privado) ──────────────────────────────────────────────────

  private async issueTokens(user: UserWithFarm): Promise<AuthTokensDto> {
    const { token: accessToken, expiresIn } = signAccessToken(user);

    const farmEntry = user.userFarms[0];
    if (!farmEntry) {
      throw new AppError(403, 'FORBIDDEN', 'El usuario no pertenece a ninguna finca');
    }

    // Generar refresh token como 32 bytes aleatorios en hex (64 chars)
    const rawRefreshToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash         = hashToken(rawRefreshToken);
    const refreshExpiresAt  = new Date(Date.now() + parseExpiresInToMs(JWT_REFRESH_EXPIRES_IN));

    await authRepository.saveRefreshToken({
      tokenHash,
      userId:    user.id,
      farmId:    farmEntry.farmId,
      expiresAt: refreshExpiresAt,
    });

    return { accessToken, expiresIn, rawRefreshToken };
  }
}

export const authService = new AuthService();
