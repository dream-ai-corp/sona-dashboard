import { z } from 'zod';
import { lifeAreaSchema } from '@plm/shared';

export const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  lifeArea: lifeAreaSchema,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  allDay: z.boolean().default(false),
});

export const updateEventSchema = createEventSchema.partial();

export const createObjectiveSchema = z.object({
  lifeArea: lifeAreaSchema,
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  targetDate: z.coerce.date().optional(),
});

export const updateObjectiveSchema = createObjectiveSchema.partial().extend({
  status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED']).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
});

export const timeAllocationSchema = z.object({
  allocations: z.array(z.object({
    lifeArea: lifeAreaSchema,
    percentage: z.number().int().min(0).max(100),
  })),
}).refine(
  (data) => data.allocations.reduce((sum, a) => sum + a.percentage, 0) <= 100,
  { message: 'Total allocation must not exceed 100%' },
);

export const availableSlotsSchema = z.object({
  date: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(15).max(480),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>;
