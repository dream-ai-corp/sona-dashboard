import { prisma } from '../../config/database';
import { LifeArea, LIFE_AREAS, LIFE_AREA_LABELS, LIFE_AREA_COLORS } from '@plm/shared';
import { UpsertPreferenceInput } from './life-areas.validator';

export interface ResolvedLifeArea {
  key: LifeArea;
  label: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export class LifeAreasService {
  async list(userId: string): Promise<ResolvedLifeArea[]> {
    const prefs = await prisma.lifeAreaPreference.findMany({ where: { userId } });
    const byKey = new Map(prefs.map((p) => [p.lifeArea, p]));
    return LIFE_AREAS.map((key, idx) => {
      const pref = byKey.get(key as LifeArea);
      return {
        key: key as LifeArea,
        label: pref?.label ?? LIFE_AREA_LABELS[key as LifeArea],
        color: pref?.color ?? LIFE_AREA_COLORS[key as LifeArea],
        sortOrder: pref?.sortOrder ?? idx,
        archived: pref?.archived ?? false,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async upsert(userId: string, input: UpsertPreferenceInput) {
    const data = {
      label: input.label ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? 0,
      archived: input.archived ?? false,
    };
    return prisma.lifeAreaPreference.upsert({
      where: { userId_lifeArea: { userId, lifeArea: input.lifeArea } },
      create: { userId, lifeArea: input.lifeArea, ...data },
      update: data,
    });
  }

  async bulkUpdate(userId: string, prefs: UpsertPreferenceInput[]) {
    await prisma.$transaction(prefs.map((p) => {
      const data = {
        label: p.label ?? null,
        color: p.color ?? null,
        sortOrder: p.sortOrder ?? 0,
        archived: p.archived ?? false,
      };
      return prisma.lifeAreaPreference.upsert({
        where: { userId_lifeArea: { userId, lifeArea: p.lifeArea } },
        create: { userId, lifeArea: p.lifeArea, ...data },
        update: data,
      });
    }));
    return this.list(userId);
  }

  async reset(userId: string) {
    await prisma.lifeAreaPreference.deleteMany({ where: { userId } });
    return this.list(userId);
  }
}

export const lifeAreasService = new LifeAreasService();
