import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, z } from 'zod';

// ─── Body / query validation ──────────────────────────────────────────────────

export function validate(schema: ZodSchema, target: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const input  = target === 'query' ? req.query : req.body;
    const result = schema.safeParse(input);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }
    if (target === 'query') {
      // Assign coerced/defaulted values back so handlers can read typed values
      req.query = result.data as typeof req.query;
    } else {
      req.body = result.data;
    }
    next();
  };
}

// Alias used in Phase 3 (same behaviour — validates request body against Zod schema)
export const validateBody = validate;

// ─── Common field validators (reusable across routes) ─────────────────────────

export const zPhone = z
  .string()
  .trim()
  .regex(/^\+91[6-9]\d{9}$|^[6-9]\d{9}$/, 'Enter a valid Indian mobile number');

export const zText = (maxLen = 500) =>
  z.string().trim().max(maxLen).refine(
    (s) => !/<[^>]+>/.test(s) && !s.includes('\0'),
    'HTML and null bytes are not allowed',
  );

export const zUuid = () => z.string().uuid('Must be a valid UUID');
export const zPage = () => z.coerce.number().int().min(1).default(1);
export const zLimit = (max = 50) => z.coerce.number().int().min(1).max(max).default(max);
