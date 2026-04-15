import { z } from 'zod';

export const updateSettingsSchema = z.object({
  googleClientId: z.string().nullable().optional(),
  googleClientSecret: z.string().nullable().optional(),
  googleRedirectUri: z.string().nullable().optional(),
  openrouterApiKey: z.string().nullable().optional(),
  openrouterModel: z.string().nullable().optional(),
  lmstudioBaseUrl: z.string().nullable().optional(),
  lmstudioModel: z.string().nullable().optional(),
  lmstudioApiKey: z.string().nullable().optional(),
  fcmServerKey: z.string().nullable().optional(),
  firebaseProjectId: z.string().nullable().optional(),
  firebaseClientEmail: z.string().nullable().optional(),
  firebasePrivateKey: z.string().nullable().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
