import { z } from 'zod';
import { lifeAreaSchema, paginationSchema } from '@plm/shared';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  lifeArea: lifeAreaSchema,
  type: z.enum(['INCOME', 'EXPENSE']),
  budgetMonthly: z.number().positive().optional(),
  isFixedCharge: z.boolean().optional(),
});

export const createTransactionSchema = z.object({
  categoryId: z.string().uuid(),
  accountId: z.string().uuid().optional().nullable(),
  amount: z.number(),
  description: z.string().min(1).max(255),
  date: z.coerce.date(),
  lifeArea: lifeAreaSchema,
  status: z.enum(['REALIZED', 'SCHEDULED']).optional(),
});

export const transactionQuerySchema = paginationSchema.extend({
  lifeArea: lifeAreaSchema.optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  status: z.enum(['REALIZED', 'SCHEDULED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  startingBalance: z.number(),
  referenceDate: z.coerce.date(),
  currency: z.string().length(3).optional(),
  isPrimary: z.boolean().optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

export const recurrenceTypeSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM']);

export const createSeriesSchema = z.object({
  categoryId: z.string().uuid(),
  accountId: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(255),
  amount: z.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE']),
  lifeArea: lifeAreaSchema,
  recurrenceType: recurrenceTypeSchema,
  interval: z.number().int().positive().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  monthOfYear: z.number().int().min(1).max(12).optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  paused: z.boolean().optional(),
});

export const updateSeriesSchema = createSeriesSchema.partial();

export const projectionQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: z.enum(['day', 'week', 'month', 'year']).optional(),
  accountId: z.string().uuid().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;
export type ProjectionQuery = z.infer<typeof projectionQuerySchema>;
