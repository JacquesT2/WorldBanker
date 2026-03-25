import type { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// Shared schemas
export const RegisterSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(100),
  bank_name: z.string().min(3).max(60),
  starting_town_id: z.string().min(1),
});

export const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const SetDepositRateSchema = z.object({
  town_id: z.string(),
  rate: z.number().min(0).max(0.15),
});

export const AcceptLoanSchema = z.object({
  offered_rate: z.number().min(0.02).max(0.30),
});

export const PurchaseLicenseSchema = z.object({
  town_id: z.string(),
});

export const InfrastructureInvestSchema = z.object({
  town_id: z.string(),
  infra_type: z.enum(['roads', 'port', 'granary', 'walls', 'market']),
  amount: z.number().min(100),
});
