// Códigos de error internos del sistema — usar siempre estos valores en AppError
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TWO_FACTOR_REQUIRED'
  | 'TWO_FACTOR_INVALID'
  | 'INTERNAL_ERROR';

/**
 * Error esperado del dominio de la aplicación.
 *
 * Usar siempre AppError en controllers y services — nunca lanzar Error nativo.
 * El middleware errorHandler lo convierte al formato estándar de la API.
 *
 * @example
 * throw new AppError(404, 'NOT_FOUND', 'Animal no encontrado');
 * throw new AppError(409, 'CONFLICT',  'El código ya existe en esta finca');
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly details: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    errorCode: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name        = 'AppError';
    this.statusCode  = statusCode;
    this.errorCode   = errorCode;
    this.details     = details ?? null;
    this.isOperational = true; // Distingue errores de dominio de bugs del sistema

    // Preserva el stack trace correctamente en V8
    Error.captureStackTrace(this, this.constructor);
  }
}
