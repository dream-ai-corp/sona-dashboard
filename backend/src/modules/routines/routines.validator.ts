import { z } from 'zod';
import { lifeAreaSchema } from '@plm/shared';

export const routineStepKindSchema = z.enum([
  'SILENCE',
  'AFFIRMATIONS',
  'VISUALIZATION',
  'EXERCISE',
  'READING',
  'SCRIBING',
  'MEDITATION',
  'WORKOUT',
  'BREATHING',
  'STRETCHING',
  'CUSTOM',
]);

export const routineStepMediaKindSchema = z.enum(['VIDEO', 'AUDIO', 'DOCUMENT', 'LINK']);

export const routineStepInputSchema = z.object({
  title: z.string().min(1).max(255),
  kind: routineStepKindSchema.default('CUSTOM'),
  durationMinutes: z.number().int().min(1).max(480),
  mediaUrl: z.string().url().optional().nullable(),
  mediaKind: routineStepMediaKindSchema.optional().nullable(),
  mediaAutoplay: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

export const recurrenceInputSchema = z.object({
  type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM']),
  interval: z.number().int().min(1).default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export const createRoutineSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  lifeArea: lifeAreaSchema,
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional().nullable(),
  alarmEnabled: z.boolean().default(true),
  recurrence: recurrenceInputSchema.optional(),
  steps: z.array(routineStepInputSchema).default([]),
});

export const updateRoutineSchema = createRoutineSchema.partial();

// Import a full routine (as exported by /export) — same shape plus an
// optional version field for forward-compat.
export const importRoutineSchema = z.object({
  version: z.number().int().optional(),
  routine: createRoutineSchema,
});

export type RoutineStepInput = z.infer<typeof routineStepInputSchema>;
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
export type ImportRoutineInput = z.infer<typeof importRoutineSchema>;
