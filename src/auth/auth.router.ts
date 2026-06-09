import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { AuthController } from '@auth/auth.controller';
import { authenticate } from '@common/middleware/authenticate.middleware';

// ── Rate limiters ─────────────────────────────────────────────────────────────

const WINDOW_MS     = parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000',  10);
const MAX_GENERAL   = parseInt(process.env['RATE_LIMIT_MAX']       ?? '100',    10);
const MAX_AUTH      = parseInt(process.env['RATE_LIMIT_AUTH_MAX']  ?? '10',     10);

/** Rate limiter general: 100 req/min por IP para todas las rutas de auth */
const generalLimiter = rateLimit({
  windowMs:         WINDOW_MS,
  max:              MAX_GENERAL,
  standardHeaders:  true,  // Expone RateLimit-* headers (RFC 6585)
  legacyHeaders:    false,
  message: {
    statusCode: 429,
    error:      'TOO_MANY_REQUESTS',
    message:    'Demasiadas solicitudes. Intenta de nuevo en un minuto.',
    details:    null,
  },
});

/** Rate limiter estricto: 10 req/min por IP para login, register y 2fa/verify */
const strictLimiter = rateLimit({
  windowMs:         WINDOW_MS,
  max:              MAX_AUTH,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    statusCode: 429,
    error:      'TOO_MANY_REQUESTS',
    message:    'Demasiados intentos de autenticación. Espera 1 minuto antes de intentar de nuevo.',
    details:    null,
  },
});

// ── Router ────────────────────────────────────────────────────────────────────

export const authRouter = Router();

// Aplicar rate limiter general a TODAS las rutas del módulo
authRouter.use(generalLimiter);

// POST /auth/login — público, rate limit estricto
authRouter.post('/login',    strictLimiter, AuthController.login);

// POST /auth/register — público, rate limit estricto
authRouter.post('/register', strictLimiter, AuthController.register);

// POST /auth/logout — requiere cookie refreshToken (no JWT), rate limit general
authRouter.post('/logout', AuthController.logout);

// POST /auth/refresh — requiere cookie refreshToken, rate limit general
authRouter.post('/refresh', AuthController.refresh);

// GET /auth/me — requiere JWT válido; devuelve el usuario autenticado (con farmId)
authRouter.get('/me', authenticate, AuthController.me);

// GET /auth/2fa/setup — requiere JWT válido (usuario autenticado)
authRouter.get('/2fa/setup', authenticate, AuthController.setupTwoFactor);

// POST /auth/2fa/verify — público (tiene tempToken en body), rate limit estricto
authRouter.post('/2fa/verify', strictLimiter, AuthController.verifyTwoFactor);
