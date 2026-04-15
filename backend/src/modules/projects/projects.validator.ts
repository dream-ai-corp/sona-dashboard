import { z } from 'zod';

const statusSchema = z.enum(['active', 'archived', 'building']);

const projectServiceSchema = z.object({
  name: z.string().min(1),
  port: z.number().int().positive(),
  url: z.string().url(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().max(2000).default(''),
  status: statusSchema.default('active'),
  tags: z.array(z.string().min(1)).default([]),
  git: z.object({ remote: z.string().url() }).optional(),
  services: z.array(projectServiceSchema).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(2000).optional(),
  status: statusSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  git: z.object({ remote: z.string().url() }).nullable().optional(),
  services: z.array(projectServiceSchema).optional(),
});

export type CreateProjectSchemaInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectSchemaInput = z.infer<typeof updateProjectSchema>;
