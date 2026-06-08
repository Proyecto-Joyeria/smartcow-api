import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (deben declararse ANTES de los imports que los usan) ─────────────────

vi.mock('@auth/auth.repository', () => ({
  authRepository: {
    findUserByEmail:        vi.fn(),
    findUserById:           vi.fn(),
    createUserWithFarm:     vi.fn(),
    updateUserLoginFailed:  vi.fn(),
    updateUserLoginSuccess: vi.fn(),
    saveRefreshToken:       vi.fn(),
    findRefreshToken:       vi.fn(),
    revokeRefreshToken:     vi.fn(),
    revokeAllUserTokens:    vi.fn(),
    updateTwoFactorSecret:  vi.fn(),
    enableTwoFactor:        vi.fn(),
  },
}));

vi.mock('@redis/redis.service', () => ({
  redisGet:          vi.fn(),
  redisSet:          vi.fn(),
  redisDel:          vi.fn(),
  redisIncrWithTtl:  vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash:    vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign:   vi.fn(),
    verify: vi.fn(),
    decode: vi.fn(),
  },
}));

vi.mock('speakeasy', () => ({
  default: {
    generateSecret: vi.fn(),
    totp: { verify: vi.fn() },
  },
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}));

import { authService } from '@auth/auth.service';
import { authRepository } from '@auth/auth.repository';
import { redisGet, redisSet, redisDel, redisIncrWithTtl } from '@redis/redis.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import type { UserWithFarm } from '@auth/auth.types';
import { UserRole } from '@prisma/client';

// ── Factories ─────────────────────────────────────────────────────────────────

import crypto from 'crypto';

const FARM_ID = 'farm-test-001';
const USER_ID = 'user-test-001';
const TEST_2FA_KEY = '9c98df603b718a2b44090d295e06f789c959c3167d680fca1254f2defd9e477c';
const TEST_PLAIN_SECRET = 'JBSWY3DPEHPK3PXP';

/** Cifra un plaintext con la misma lógica que auth.service.ts para poder
 *  pasar valores válidos en los tests de verifyTwoFactor. */
function encryptForTest(plaintext: string): string {
  const key     = Buffer.from(TEST_2FA_KEY, 'hex');
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-cbc', key, iv);
  const payload = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${payload.toString('hex')}`;
}

function buildUser(overrides: Partial<UserWithFarm> = {}): UserWithFarm {
  return {
    id:               USER_ID,
    email:            'test@test.com',
    passwordHash:     '$2b$12$hashedpassword',
    firstName:        'Test',
    lastName:         'User',
    phone:            null,
    twoFactorSecret:  null,
    twoFactorEnabled: false,
    loginAttempts:    0,
    lockedUntil:      null,
    lastLoginAt:      null,
    active:           true,
    createdAt:        new Date(),
    updatedAt:        new Date(),
    userFarms: [
      {
        id:        'uf-001',
        userId:    USER_ID,
        farmId:    FARM_ID,
        role:      UserRole.ADMIN,
        createdAt: new Date(),
      },
    ],
    refreshTokens: [],
    ...overrides,
  };
}

// ── login ──────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna accessToken y refreshToken en login exitoso', async () => {
    const user = buildUser();
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user);
    vi.mocked(redisGet).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(authRepository.updateUserLoginSuccess).mockResolvedValue(undefined as never);
    vi.mocked(redisDel).mockResolvedValue(undefined as never);
    vi.mocked(jwt.sign).mockReturnValue('mock.access.token' as never);
    vi.mocked(authRepository.saveRefreshToken).mockResolvedValue(undefined as never);

    const result = await authService.login({ email: 'test@test.com', password: 'Test123!' });

    expect(result).toMatchObject({ accessToken: 'mock.access.token' });
    expect(authRepository.updateUserLoginSuccess).toHaveBeenCalledWith(USER_ID);
    expect(authRepository.saveRefreshToken).toHaveBeenCalledOnce();
  });

  it('lanza 401 cuando el usuario no existe', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      authService.login({ email: 'noexiste@test.com', password: 'Test123!' }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: 'INVALID_CREDENTIALS' });
  });

  it('lanza 401 y incrementa contador cuando la contraseña es incorrecta', async () => {
    const user = buildUser();
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user);
    vi.mocked(redisGet).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    vi.mocked(redisIncrWithTtl).mockResolvedValue(1);
    vi.mocked(authRepository.updateUserLoginFailed).mockResolvedValue(undefined as never);

    await expect(
      authService.login({ email: 'test@test.com', password: 'wrong' }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: 'INVALID_CREDENTIALS' });

    expect(redisIncrWithTtl).toHaveBeenCalledOnce();
  });

  it('lanza 429 RATE_LIMITED cuando la cuenta está bloqueada en Redis', async () => {
    const user = buildUser();
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user);
    vi.mocked(redisGet).mockResolvedValue(true);

    await expect(
      authService.login({ email: 'test@test.com', password: 'Test123!' }),
    ).rejects.toMatchObject({ statusCode: 429, errorCode: 'RATE_LIMITED' });
  });

  it('bloquea la cuenta al alcanzar MAX_LOGIN_ATTEMPTS', async () => {
    const user = buildUser();
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user);
    vi.mocked(redisGet).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    vi.mocked(redisIncrWithTtl).mockResolvedValue(5); // exactamente el límite
    vi.mocked(authRepository.updateUserLoginFailed).mockResolvedValue(undefined as never);
    vi.mocked(redisSet).mockResolvedValue(undefined as never);

    await expect(
      authService.login({ email: 'test@test.com', password: 'wrong' }),
    ).rejects.toMatchObject({ statusCode: 429, errorCode: 'RATE_LIMITED' });

    expect(redisSet).toHaveBeenCalledOnce();
  });

  it('devuelve twoFactorRequired cuando el usuario tiene 2FA activo', async () => {
    const user = buildUser({ twoFactorEnabled: true, twoFactorSecret: 'iv:encrypted' });
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user);
    vi.mocked(redisGet).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(authRepository.updateUserLoginSuccess).mockResolvedValue(undefined as never);
    vi.mocked(redisDel).mockResolvedValue(undefined as never);
    vi.mocked(jwt.sign).mockReturnValue('temp.token.2fa' as never);

    const result = await authService.login({ email: 'test@test.com', password: 'Test123!' });

    expect(result).toMatchObject({ twoFactorRequired: true, tempToken: 'temp.token.2fa' });
  });
});

// ── register ───────────────────────────────────────────────────────────────────

describe('AuthService.register', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crea usuario y finca en registro exitoso', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$hashedpassword' as never);
    vi.mocked(authRepository.createUserWithFarm).mockResolvedValue(buildUser());
    vi.mocked(jwt.sign).mockReturnValue('new.access.token' as never);
    vi.mocked(authRepository.saveRefreshToken).mockResolvedValue(undefined as never);

    const result = await authService.register({
      email:     'nuevo@test.com',
      password:  'Test123!',
      firstName: 'Nuevo',
      lastName:  'Usuario',
      farmName:  'Finca Nueva',
    });

    expect(result).toMatchObject({ accessToken: 'new.access.token' });
    expect(authRepository.createUserWithFarm).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nuevo@test.com', farmName: 'Finca Nueva' }),
    );
  });

  it('lanza 409 CONFLICT si el email ya existe', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(buildUser());

    await expect(
      authService.register({
        email:     'test@test.com',
        password:  'Test123!',
        firstName: 'Test',
        lastName:  'User',
        farmName:  'Finca',
      }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'CONFLICT' });

    expect(authRepository.createUserWithFarm).not.toHaveBeenCalled();
  });
});

// ── logout ─────────────────────────────────────────────────────────────────────

describe('AuthService.logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revoca el refresh token cuando existe', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue({
      id:        'rt-001',
      tokenHash: 'hash',
      userId:    USER_ID,
      farmId:    FARM_ID,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      createdAt: new Date(),
    });
    vi.mocked(authRepository.revokeRefreshToken).mockResolvedValue(undefined as never);

    await authService.logout('rawRefreshToken');

    expect(authRepository.revokeRefreshToken).toHaveBeenCalledOnce();
  });

  it('no lanza error si el refresh token no existe', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue(null);

    await expect(authService.logout('tokenInexistente')).resolves.toBeUndefined();
    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });
});

// ── blacklistAccessToken / isTokenBlacklisted ──────────────────────────────────

describe('AuthService.blacklistAccessToken + isTokenBlacklisted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('añade el token a Redis con TTL del tiempo restante hasta expiración', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // expira en 1h
    vi.mocked(jwt.decode).mockReturnValue({ exp: futureExp, sub: USER_ID } as never);
    vi.mocked(redisSet).mockResolvedValue(undefined as never);

    await authService.blacklistAccessToken('raw.access.token');

    expect(redisSet).toHaveBeenCalledWith(
      expect.stringContaining('auth:token-blacklist:'),
      true,
      expect.any(Number),
    );
  });

  it('no lanza error si el token ya expiró', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60;
    vi.mocked(jwt.decode).mockReturnValue({ exp: pastExp } as never);

    await expect(authService.blacklistAccessToken('expired.token')).resolves.toBeUndefined();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('isTokenBlacklisted retorna true si el token está en Redis', async () => {
    vi.mocked(redisGet).mockResolvedValue(true);

    const result = await authService.isTokenBlacklisted('blacklisted.token');

    expect(result).toBe(true);
  });

  it('isTokenBlacklisted retorna false si el token no está en Redis', async () => {
    vi.mocked(redisGet).mockResolvedValue(null);

    const result = await authService.isTokenBlacklisted('valid.token');

    expect(result).toBe(false);
  });
});

// ── refreshTokens ──────────────────────────────────────────────────────────────

describe('AuthService.refreshTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  const storedToken = {
    id: 'rt-001', tokenHash: 'hash', userId: USER_ID, farmId: FARM_ID,
    expiresAt: new Date(Date.now() + 86400000), revokedAt: null, createdAt: new Date(),
  };

  it('lanza 401 si el refresh token no existe', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue(null);

    await expect(authService.refreshTokens('noExiste')).rejects.toMatchObject({
      statusCode: 401,
      errorCode:  'INVALID_TOKEN',
    });
  });

  it('revoca todos los tokens si el token ya fue revocado (robo detectado)', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue({
      ...storedToken, revokedAt: new Date(),
    });
    vi.mocked(authRepository.revokeAllUserTokens).mockResolvedValue(undefined as never);

    await expect(authService.refreshTokens('revoked')).rejects.toMatchObject({
      statusCode: 401,
      errorCode:  'INVALID_TOKEN',
    });
    expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith(USER_ID);
  });

  it('lanza 401 TOKEN_EXPIRED si el refresh token expiró', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue({
      ...storedToken, expiresAt: new Date(Date.now() - 1000),
    });

    await expect(authService.refreshTokens('expired')).rejects.toMatchObject({
      statusCode: 401,
      errorCode:  'TOKEN_EXPIRED',
    });
  });

  it('rota el token y devuelve nuevos tokens en caso exitoso', async () => {
    vi.mocked(authRepository.findRefreshToken).mockResolvedValue(storedToken);
    vi.mocked(authRepository.revokeRefreshToken).mockResolvedValue(undefined as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(buildUser());
    vi.mocked(jwt.sign).mockReturnValue('new.access.token' as never);
    vi.mocked(authRepository.saveRefreshToken).mockResolvedValue(undefined as never);

    const result = await authService.refreshTokens('validRaw');

    expect(result.accessToken).toBe('new.access.token');
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledOnce();
    expect(authRepository.saveRefreshToken).toHaveBeenCalledOnce();
  });
});

// ── login — cuenta bloqueada por DB lockedUntil ────────────────────────────────

describe('AuthService.login — lockedUntil en BD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lanza 429 cuando lockedUntil en BD es futuro (Redis no tiene la clave)', async () => {
    const user = buildUser({ lockedUntil: new Date(Date.now() + 60000) });
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user);
    vi.mocked(redisGet).mockResolvedValue(null); // Redis no tiene la clave

    await expect(
      authService.login({ email: 'test@test.com', password: 'Test123!' }),
    ).rejects.toMatchObject({ statusCode: 429, errorCode: 'RATE_LIMITED' });
  });
});

// ── generateTwoFactorSecret ────────────────────────────────────────────────────

describe('AuthService.generateTwoFactorSecret', () => {
  beforeEach(() => vi.clearAllMocks());

  it('genera secreto TOTP y devuelve base32 + qrCodeUrl', async () => {
    vi.mocked(speakeasy.generateSecret).mockReturnValue({
      base32:      'JBSWY3DPEHPK3PXP',
      otpauth_url: 'otpauth://totp/SmartCow%20(test%40test.com)?secret=JBSWY3DPEHPK3PXP',
    } as never);
    vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,abc' as never);
    vi.mocked(authRepository.updateTwoFactorSecret).mockResolvedValue(undefined as never);

    const result = await authService.generateTwoFactorSecret(USER_ID, 'test@test.com');

    expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.qrCodeUrl).toContain('data:image/png');
    expect(authRepository.updateTwoFactorSecret).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
    );
  });
});

// ── verifyTwoFactor ────────────────────────────────────────────────────────────

describe('AuthService.verifyTwoFactor', () => {
  beforeEach(() => vi.clearAllMocks());

  const TEMP_TOKEN = 'temp.token.2fa';

  it('lanza 401 si el tempToken es inválido', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('invalid'); });

    await expect(
      authService.verifyTwoFactor({ tempToken: 'bad.token', token: '123456' }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: 'INVALID_TOKEN' });
  });

  it('lanza 401 si el tipo de token no es 2fa_pending', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, type: 'access', farmId: FARM_ID } as never);

    await expect(
      authService.verifyTwoFactor({ tempToken: TEMP_TOKEN, token: '123456' }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: 'INVALID_TOKEN' });
  });

  it('lanza 401 si el usuario no existe', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, type: '2fa_pending' } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(null);

    await expect(
      authService.verifyTwoFactor({ tempToken: TEMP_TOKEN, token: '123456' }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: 'UNAUTHORIZED' });
  });

  it('lanza 400 si el usuario no tiene secreto 2FA', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, type: '2fa_pending' } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(buildUser({ twoFactorSecret: null }));

    await expect(
      authService.verifyTwoFactor({ tempToken: TEMP_TOKEN, token: '123456' }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'TWO_FACTOR_INVALID' });
  });

  it('lanza 401 si el código TOTP es incorrecto', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, type: '2fa_pending' } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(
      buildUser({ twoFactorEnabled: true, twoFactorSecret: encryptForTest(TEST_PLAIN_SECRET) }),
    );
    vi.mocked(speakeasy.totp.verify).mockReturnValue(false as never);

    await expect(
      authService.verifyTwoFactor({ tempToken: TEMP_TOKEN, token: '000000' }),
    ).rejects.toMatchObject({ statusCode: 401, errorCode: 'TWO_FACTOR_INVALID' });
  });

  it('emite tokens si el código TOTP es correcto (2FA ya activado)', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, type: '2fa_pending' } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(
      buildUser({ twoFactorEnabled: true, twoFactorSecret: encryptForTest(TEST_PLAIN_SECRET) }),
    );
    vi.mocked(speakeasy.totp.verify).mockReturnValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue('new.access.token' as never);
    vi.mocked(authRepository.saveRefreshToken).mockResolvedValue(undefined as never);

    const result = await authService.verifyTwoFactor({ tempToken: TEMP_TOKEN, token: '123456' });

    expect(result.accessToken).toBe('new.access.token');
    expect(authRepository.enableTwoFactor).not.toHaveBeenCalled();
  });

  it('activa 2FA en BD en el primer verify (twoFactorEnabled=false)', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: USER_ID, type: '2fa_pending' } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(
      buildUser({ twoFactorEnabled: false, twoFactorSecret: encryptForTest(TEST_PLAIN_SECRET) }),
    );
    vi.mocked(speakeasy.totp.verify).mockReturnValue(true as never);
    vi.mocked(authRepository.enableTwoFactor).mockResolvedValue(undefined as never);
    vi.mocked(jwt.sign).mockReturnValue('new.access.token' as never);
    vi.mocked(authRepository.saveRefreshToken).mockResolvedValue(undefined as never);

    await authService.verifyTwoFactor({ tempToken: TEMP_TOKEN, token: '123456' });

    expect(authRepository.enableTwoFactor).toHaveBeenCalledWith(USER_ID);
  });
});
