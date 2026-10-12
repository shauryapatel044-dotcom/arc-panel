/**
 * src/middleware/validate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic Zod validation middleware factory.
 *
 * Usage:
 *   import { validate } from '../middleware/validate';
 *   import { z } from 'zod';
 *
 *   const MySchema = z.object({ name: z.string() });
 *   router.post('/', validate(MySchema), handler);
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// ─── validate factory ─────────────────────────────────────────────────────────

/**
 * Returns Express middleware that validates req.body against the provided
 * Zod schema. On failure, responds with 400 and a list of field errors.
 * On success, req.body is replaced with the parsed (and coerced) result.
 *
 * @param schema - A Zod schema to validate req.body against
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({
        error: 'Validation failed.',
        details: errors,
      });
      return;
    }

    // Replace req.body with the parsed, coerced, and stripped data
    req.body = result.data;
    next();
  };
}

// ─── validateQuery factory ────────────────────────────────────────────────────

/**
 * Like validate() but validates req.query instead of req.body.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({
        error: 'Invalid query parameters.',
        details: errors,
      });
      return;
    }

    req.query = result.data as typeof req.query;
    next();
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a ZodError into a flat array of human-readable field error objects.
 */
function formatZodErrors(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}
