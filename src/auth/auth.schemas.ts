import { z } from 'zod';

// ── Login ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email:    z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

// ── Register ──────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email:     z.string().email('Email inválido').toLowerCase().trim(),
  password:  z
    .string()
    .min(8,  'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede superar 72 caracteres') // límite de bcrypt
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
      'La contraseña debe tener al menos una mayúscula, una minúscula, un número y un carácter especial',
    ),
  firstName: z.string().min(1, 'El nombre es requerido').max(100).trim(),
  lastName:  z.string().min(1, 'El apellido es requerido').max(100).trim(),
  farmName:  z.string().min(1, 'El nombre de la finca es requerido').max(100).trim(),
  phone:     z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Formato de teléfono inválido. Usar formato E.164: +573001234567')
    .optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

// ── Refresh token ─────────────────────────────────────────────────────────────
// El token llega en cookie HttpOnly, no en el body.
// Este schema valida que la cookie exista (se usa en el controller, no en el body).

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'El refresh token es requerido'),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;

// ── 2FA — verificar código TOTP ───────────────────────────────────────────────

export const TwoFactorVerifySchema = z.object({
  // Token TOTP de 6 dígitos generado por Google Authenticator o compatible
  token:       z.string().length(6, 'El código 2FA debe tener exactamente 6 dígitos').regex(/^\d{6}$/, 'El código 2FA solo puede contener dígitos'),
  // tempToken emitido por /login cuando el usuario tiene 2FA activo
  tempToken:   z.string().min(1, 'El token temporal es requerido'),
});

export type TwoFactorVerifyDto = z.infer<typeof TwoFactorVerifySchema>;

// ── 2FA — setup (no necesita body, usa el JWT del usuario autenticado) ────────
// No hay schema de entrada para GET /2fa/setup
