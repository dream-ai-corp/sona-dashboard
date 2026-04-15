import { z } from 'zod';
import { lifeAreaSchema } from '@plm/shared';

export const upsertPreferenceSchema = z.object({
  lifeArea: lifeAreaSchema,
  label: z.string().min(1).max(100).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  archived: z.boolean().optional(),
});

export const bulkUpdateSchema = z.object({
  preferences: z.array(upsertPreferenceSchema),
});

export type UpsertPreferenceInput = z.infer<typeof upsertPreferenceSchema>;
