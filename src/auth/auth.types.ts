import type { UserRole } from '@prisma/client';
import type { LoginDto, RegisterDto, TwoFactorVerifyDto } from '@auth/auth.schemas';

// ── Permisos RBAC ─────────────────────────────────────────────────────────────
// Formato: "recurso:acción"
// Usados en authorize.guard.ts y embebidos en el JWT payload

export type Permission =
  | 'animals:read'
  | 'animals:write'
  | 'animals:delete'
  | 'animals:import'
  | 'geofences:read'
  | 'geofences:write'
  | 'geofences:delete'
  | 'alerts:read'
  | 'alerts:acknowledge'
  | 'alerts:assign'
  | 'alerts:close'
  | 'admin:users'
  | 'admin:devices'
  | 'analytics:read'
  | 'analytics:reports';

// Mapa de permisos por rol — fuente de verdad del sistema RBAC
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    'animals:read', 'animals:write', 'animals:delete', 'animals:import',
    'geofences:read', 'geofences:write', 'geofences:delete',
    'alerts:read', 'alerts:acknowledge', 'alerts:assign', 'alerts:close',
    'admin:users', 'admin:devices',
    'analytics:read', 'analytics:reports',
  ],
  ADMIN: [
    'animals:read', 'animals:write', 'animals:delete', 'animals:import',
    'geofences:read', 'geofences:write', 'geofences:delete',
    'alerts:read', 'alerts:acknowledge', 'alerts:assign', 'alerts:close',
    'admin:users', 'admin:devices',
    'analytics:read', 'analytics:reports',
  ],
  VET: [
    'animals:read', 'animals:write',
    'geofences:read',
    'alerts:read', 'alerts:acknowledge', 'alerts:close',
    'analytics:read',
  ],
  OPERATOR: [
    'animals:read',
    'geofences:read',
    'alerts:read', 'alerts:acknowledge',
  ],
};

// ── JWT Payloads ──────────────────────────────────────────────────────────────

/** Payload del access token (vigencia 8h) */
export interface JwtPayload {
  sub:         string;       // userId
  farmId:      string;
  role:        UserRole;
  permissions: Permission[];
  iat?:        number;       // issued at (agregado por jsonwebtoken)
  exp?:        number;       // expiration (agregado por jsonwebtoken)
}

/**
 * Payload del temp token emitido cuando el usuario tiene 2FA activo.
 * Vigencia corta (5 min). Solo sirve para completar el flujo en /2fa/verify.
 */
export interface TempTokenPayload {
  sub:    string;   // userId
  farmId: string;
  role:   UserRole;
  type:   '2fa_pending';
  iat?:   number;
  exp?:   number;
}

// ── DTOs de respuesta ─────────────────────────────────────────────────────────

/**
 * Resultado interno de operaciones de autenticación.
 * El controller extrae rawRefreshToken → cookie HttpOnly y devuelve
 * { accessToken, expiresIn } al cliente en el body.
 */
export interface AuthTokensDto {
  accessToken:     string;
  expiresIn:       number; // segundos hasta que expira el access token
  rawRefreshToken: string; // token raw para la cookie — NO incluir en el body de respuesta
}

/** Respuesta de /login cuando 2FA SÍ está activo */
export interface TwoFactorRequiredDto {
  twoFactorRequired: true;
  tempToken:         string; // JWT de 5 min para completar en /2fa/verify
}

/** Respuesta de GET /2fa/setup */
export interface TwoFactorSetupDto {
  secret:    string; // Base32 para introducir manualmente en el authenticator
  qrCodeUrl: string; // Data URL PNG del QR code
}

// ── Interfaces de capas ───────────────────────────────────────────────────────

/** Contrato público del AuthRepository — solo acceso a datos */
export interface IAuthRepository {
  findUserByEmail(email: string): Promise<UserWithFarm | null>;
  findUserById(userId: string): Promise<UserWithFarm | null>;
  createUserWithFarm(data: CreateUserWithFarmInput): Promise<UserWithFarm>;
  updateUserLoginSuccess(userId: string): Promise<void>;
  updateUserLoginFailed(userId: string, attempts: number, lockedUntil: Date | null): Promise<void>;
  updateTwoFactorSecret(userId: string, encryptedSecret: string): Promise<void>;
  enableTwoFactor(userId: string): Promise<void>;
  saveRefreshToken(data: SaveRefreshTokenInput): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;
}

/** Contrato público del AuthService — lógica de negocio */
export interface IAuthService {
  login(dto: LoginDto): Promise<AuthTokensDto | TwoFactorRequiredDto>;
  register(dto: RegisterDto): Promise<AuthTokensDto>;
  logout(refreshToken: string): Promise<void>;
  refreshTokens(refreshToken: string): Promise<AuthTokensDto>;
  generateTwoFactorSecret(userId: string, email: string): Promise<TwoFactorSetupDto>;
  verifyTwoFactor(dto: TwoFactorVerifyDto): Promise<AuthTokensDto>;
}

// ── Tipos de datos internos ───────────────────────────────────────────────────

/** Usuario con su relación UserFarm (necesaria para extraer farmId y role) */
export interface UserWithFarm {
  id:              string;
  email:           string;
  passwordHash:    string;
  firstName:       string;
  lastName:        string;
  twoFactorSecret: string | null;
  twoFactorEnabled: boolean;
  loginAttempts:   number;
  lockedUntil:     Date | null;
  active:          boolean;
  userFarms: {
    farmId: string;
    role:   UserRole;
  }[];
}

export interface CreateUserWithFarmInput {
  email:        string;
  passwordHash: string;
  firstName:    string;
  lastName:     string;
  phone?:       string;
  farmName:     string;
}

export interface SaveRefreshTokenInput {
  tokenHash: string;
  userId:    string;
  farmId:    string;
  expiresAt: Date;
}

export interface StoredRefreshToken {
  tokenHash: string;
  userId:    string;
  farmId:    string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// ── Extensión de Express Request ──────────────────────────────────────────────
// Permite usar req.user en controllers con tipado completo

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId:      string;
        farmId:      string;
        role:        UserRole;
        permissions: Permission[];
      };
    }
  }
}
