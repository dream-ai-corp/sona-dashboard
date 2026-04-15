import { prisma } from '../../config/database';
import { UpdateSettingsInput } from './settings.validator';

const SECRET_FIELDS = [
  'googleClientSecret',
  'openrouterApiKey',
  'lmstudioApiKey',
  'fcmServerKey',
  'firebasePrivateKey',
] as const;

function maskSecrets<T extends Record<string, unknown>>(row: T | null): T | null {
  if (!row) return row;
  const masked = { ...row };
  for (const field of SECRET_FIELDS) {
    const v = masked[field];
    if (typeof v === 'string' && v.length > 0) {
      (masked as Record<string, unknown>)[field] = '••••••••';
    }
  }
  return masked;
}

export class SettingsService {
  async getRaw(userId: string) {
    const existing = await prisma.userSettings.findUnique({ where: { userId } });
    if (existing) return existing;
    return prisma.userSettings.create({ data: { userId } });
  }

  async getMasked(userId: string) {
    const row = await this.getRaw(userId);
    return maskSecrets(row);
  }

  async update(userId: string, input: UpdateSettingsInput) {
    const data: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (typeof value === 'string' && value === '••••••••') continue;
      data[key] = value === '' ? null : value;
    }
    await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.getMasked(userId);
  }
}

export const settingsService = new SettingsService();
