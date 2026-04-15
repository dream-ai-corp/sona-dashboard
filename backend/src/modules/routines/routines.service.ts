import { prisma } from '../../config/database';
import { notificationService } from '../../core/services/notification.service';
import {
  CreateRoutineInput,
  UpdateRoutineInput,
  RoutineStepInput,
  ImportRoutineInput,
} from './routines.validator';
import { findPreset, presets, RoutinePreset } from './routines.presets';

export const ROUTINE_EXPORT_VERSION = 1;

export class RoutinesService {
  async createRoutine(userId: string, input: CreateRoutineInput) {
    const { recurrence, steps, ...routineData } = input;

    let recurringRuleId: string | undefined;
    if (recurrence) {
      const rule = await prisma.recurringRule.create({
        data: {
          userId,
          type: recurrence.type,
          interval: recurrence.interval,
          daysOfWeek: recurrence.daysOfWeek ?? [],
          dayOfMonth: recurrence.dayOfMonth,
          startDate: new Date(),
        },
      });
      recurringRuleId = rule.id;
    }

    const routine = await prisma.routine.create({
      data: {
        ...routineData,
        userId,
        recurringRuleId,
        steps: {
          create: steps.map((s, i) => ({ ...this.stepData(s), orderIndex: i })),
        },
      },
      include: { recurringRule: true, steps: { orderBy: { orderIndex: 'asc' } } },
    });

    if (routine.alarmEnabled && routine.timeOfDay) {
      await this.scheduleNextAlarm(routine);
    }

    return routine;
  }

  async getRoutines(userId: string) {
    return prisma.routine.findMany({
      where: { userId },
      include: { recurringRule: true, steps: { orderBy: { orderIndex: 'asc' } } },
      orderBy: [{ timeOfDay: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getRoutine(userId: string, id: string) {
    return prisma.routine.findFirstOrThrow({
      where: { id, userId },
      include: { recurringRule: true, steps: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async updateRoutine(userId: string, id: string, input: UpdateRoutineInput) {
    const { recurrence, steps, ...routineData } = input;

    return prisma.$transaction(async (tx) => {
      await tx.routine.findFirstOrThrow({ where: { id, userId } });

      if (steps !== undefined) {
        await tx.routineStep.deleteMany({ where: { routineId: id } });
        await tx.routineStep.createMany({
          data: steps.map((s, i) => ({
            routineId: id,
            orderIndex: i,
            ...this.stepData(s),
          })),
        });
      }

      return tx.routine.update({
        where: { id },
        data: routineData as Parameters<typeof tx.routine.update>[0]['data'],
        include: { recurringRule: true, steps: { orderBy: { orderIndex: 'asc' } } },
      });
    });
  }

  async deleteRoutine(userId: string, id: string) {
    await prisma.routine.findFirstOrThrow({ where: { id, userId } });
    return prisma.routine.delete({ where: { id } });
  }

  async toggleAlarm(userId: string, id: string) {
    const routine = await prisma.routine.findFirstOrThrow({ where: { id, userId } });
    return prisma.routine.update({
      where: { id },
      data: { alarmEnabled: !routine.alarmEnabled },
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  // ==================== Presets ====================

  listPresets(): RoutinePreset[] {
    return presets;
  }

  async instantiatePreset(userId: string, presetId: string) {
    const preset = findPreset(presetId);
    if (!preset) throw new Error(`Unknown preset: ${presetId}`);
    return this.createRoutine(userId, preset.routine);
  }

  // ==================== Import / Export ====================

  async exportRoutine(userId: string, id: string) {
    const routine = await this.getRoutine(userId, id);
    return {
      version: ROUTINE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      routine: {
        title: routine.title,
        description: routine.description,
        lifeArea: routine.lifeArea,
        timeOfDay: routine.timeOfDay,
        alarmEnabled: routine.alarmEnabled,
        steps: routine.steps.map((s) => ({
          title: s.title,
          kind: s.kind,
          durationMinutes: s.durationMinutes,
          mediaUrl: s.mediaUrl,
          mediaKind: s.mediaKind,
          mediaAutoplay: s.mediaAutoplay,
          notes: s.notes,
        })),
      },
    };
  }

  async importRoutine(userId: string, input: ImportRoutineInput) {
    if (input.version && input.version > ROUTINE_EXPORT_VERSION) {
      throw new Error(`Routine export version ${input.version} is newer than supported (${ROUTINE_EXPORT_VERSION})`);
    }
    return this.createRoutine(userId, input.routine);
  }

  // ==================== Helpers ====================

  private stepData(s: RoutineStepInput) {
    return {
      title: s.title,
      kind: s.kind,
      durationMinutes: s.durationMinutes,
      mediaUrl: s.mediaUrl ?? null,
      mediaKind: s.mediaKind ?? null,
      mediaAutoplay: s.mediaAutoplay,
      notes: s.notes ?? null,
    };
  }

  private async scheduleNextAlarm(routine: {
    id: string;
    userId: string;
    title: string;
    timeOfDay: string | null;
  }) {
    if (!routine.timeOfDay) return;
    const [hours, minutes] = routine.timeOfDay.split(':').map(Number);
    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    if (scheduledAt <= now) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    await notificationService.schedule({
      userId: routine.userId,
      title: `Routine: ${routine.title}`,
      body: `Time for ${routine.title}`,
      scheduledAt,
      moduleSource: 'routines',
      referenceId: routine.id,
    });
  }
}

export const routinesService = new RoutinesService();
