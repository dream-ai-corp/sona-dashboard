import { z } from 'zod';
import { LifeArea } from '../enums/life-areas';

export const lifeAreaSchema = z.nativeEnum(LifeArea);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidSchema = z.string().uuid();

export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine(
  (data) => data.from <= data.to,
  { message: 'Start date must be before or equal to end date' }
);

export const monetaryAmountSchema = z.number()
  .multipleOf(0.01)
  .refine((val) => Math.abs(val) < 1_000_000_000, {
    message: 'Amount must be less than 1 billion',
  });
