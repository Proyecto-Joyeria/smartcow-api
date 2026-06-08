import type { Request, Response, NextFunction } from 'express';

import { authService } from '@auth/auth.service';
import { authRepository } from '@auth/auth.repository';
import { LoginSchema, RegisterSchema, TwoFactorVerifySchema } from '@auth/auth.schemas';
import { AppError } from '@common/utils/app-error';

// ── Configuración de cookies ───────────────────────────────────────────────────

const NODE_ENV = process.env['NODE_ENV'] ?? 'development';
const IS_PROD  = NODE_ENV === 'production';

// 30 días en milisegundos — coincide con JWT_REFRESH_EXPIRES_IN default
const REFRESH_TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,             // Inaccesible desde JavaScript del navegador
  secure:   IS_PROD,          // Solo HTTPS en producción
  sameSite: 'strict' as const, // Previene CSRF
  maxAge:   REFRESH_TOKEN_COOKIE_MAX_AGE,
  path:     '/api/v1/auth',   // Restringir la cookie solo a rutas de auth
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extrae el refresh token de la cookie HttpOnly */
function extractRefreshToken(req: Request): string {
  const token = req.cookies['refreshToken'] as string | undefined;
  if (!token) {
    throw new AppError(401, 'INVALID_TOKEN', 'Refresh token no encontrado');
  }
  return token;
}

/** Limpia la cookie del refresh token en el navegador */
function clearRefreshCookie(res: Response): void {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: 'strict',
    path:     '/api/v1/auth',
  });
}

// ── AuthController ────────────────────────────────────────────────────────────

export const AuthController = {

  /**
   * POST /auth/login
   * Body: { email, password }
   * Response: { data: { accessToken, expiresIn } } + cookie refreshToken
   * Response (2FA activo): { data: { twoFactorRequired: true, tempToken } }
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto    = LoginSchema.parse(req.body);
      const result = await authService.login(dto);

      // Flujo 2FA: devolver tempToken sin cookie de refresh
      if ('twoFactorRequired' in result) {
        res.status(200).json({ data: result });
        return;
      }

      // Flujo normal: emitir cookie + responder con accessToken
      res.cookie('refreshToken', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          expiresIn:   result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /auth/register
   * Body: { email, password, firstName, lastName, farmName, phone? }
   * Response: { data: { accessToken, expiresIn } } + cookie refreshToken
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto    = RegisterSchema.parse(req.body);
      const result = await authService.register(dto);

      res.cookie('refreshToken', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(201).json({
        data: {
          accessToken: result.accessToken,
          expiresIn:   result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /auth/logout
   * Header: Authorization: Bearer <accessToken>  (para invalidar el access token)
   * Cookie: refreshToken                          (para revocar el refresh token)
   * Response: 204 No Content — siempre, incluso si no hay cookie o token
   */
  async logout(req: Request, res: Response): Promise<void> {
    // Blacklistear el access token si viene en el header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const rawAccessToken = authHeader.slice(7);
      await authService.blacklistAccessToken(rawAccessToken);
    }

    // Revocar el refresh token si viene en la cookie
    const rawRefreshToken = req.cookies['refreshToken'] as string | undefined;
    if (rawRefreshToken) {
      await authService.logout(rawRefreshToken);
    }

    clearRefreshCookie(res);
    res.status(204).send();
  },

  /**
   * POST /auth/refresh
   * Cookie: refreshToken
   * Response: { data: { accessToken, expiresIn } } + nueva cookie refreshToken
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = extractRefreshToken(req);
      const result          = await authService.refreshTokens(rawRefreshToken);

      // Rotar la cookie: nueva cookie con el nuevo refresh token
      res.cookie('refreshToken', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          expiresIn:   result.expiresIn,
        },
      });
    } catch (err) {
      clearRefreshCookie(res);
      next(err);
    }
  },

  /**
   * GET /auth/2fa/setup
   * Header: Authorization: Bearer <accessToken>
   * Response: { data: { secret, qrCodeUrl } }
   */
  async setupTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
      }

      // Recuperar email del usuario para el nombre del QR
      const { userId } = req.user;
      const userRecord = await authRepository.findUserById(userId);

      if (!userRecord) {
        throw new AppError(404, 'NOT_FOUND', 'Usuario no encontrado');
      }

      const result = await authService.generateTwoFactorSecret(userId, userRecord.email);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /auth/2fa/verify
   * Body: { token, tempToken }
   * Response: { data: { accessToken, expiresIn } } + cookie refreshToken
   */
  async verifyTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto    = TwoFactorVerifySchema.parse(req.body);
      const result = await authService.verifyTwoFactor(dto);

      res.cookie('refreshToken', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          expiresIn:   result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
