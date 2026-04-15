import { prisma } from '../../config/database';
import { LifeArea } from '@plm/shared';
import { smartScheduler } from '../../core/utils/scheduler';
import { CreateEventInput, CreateObjectiveInput } from './calendar.validator';

export class CalendarService {
  // Events
  async createEvent(userId: string, input: CreateEventInput) {
    return prisma.calendarEvent.create({
      data: { ...input, userId },
    });
  }

  async getEvents(userId: string, from: Date, to: Date, lifeArea?: LifeArea) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const visibleCalendarIds = user.selectedGoogleCalendarIds;

    return prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: from },
        endTime: { lte: to },
        ...(lifeArea && { lifeArea }),
        OR: [
          // Local PLM events (no source)
          ...(user.hideLocalCalendar ? [] : [{ googleCalendarId: null }]),
          // Google events from selected calendars (or any if none picked)
          visibleCalendarIds.length > 0
            ? { googleCalendarId: { in: visibleCalendarIds } }
            : { googleCalendarId: { not: null } },
        ],
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getSources(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Distinct google calendars seen on stored events
    const events = await prisma.calendarEvent.findMany({
      where: { userId, googleCalendarId: { not: null } },
      select: { googleCalendarId: true, googleCalendarName: true, googleColor: true },
      distinct: ['googleCalendarId'],
    });
    const google = events
      .filter((e) => e.googleCalendarId)
      .map((e) => ({
        id: e.googleCalendarId!,
        name: e.googleCalendarName || e.googleCalendarId!,
        color: e.googleColor,
      }));

    return {
      local: { hidden: user.hideLocalCalendar },
      google: {
        selected: user.selectedGoogleCalendarIds,
        seen: google,
      },
    };
  }

  async updateEvent(userId: string, id: string, input: Partial<CreateEventInput>) {
    return prisma.calendarEvent.update({
      where: { id, userId },
      data: input,
    });
  }

  async deleteEvent(userId: string, id: string) {
    return prisma.calendarEvent.delete({ where: { id, userId } });
  }

  // Objectives
  async createObjective(userId: string, input: CreateObjectiveInput) {
    return prisma.lifeAreaObjective.create({
      data: { ...input, userId },
    });
  }

  async getObjectives(userId: string, lifeArea?: LifeArea) {
    return prisma.lifeAreaObjective.findMany({
      where: { userId, ...(lifeArea && { lifeArea }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateObjective(userId: string, id: string, input: Record<string, unknown>) {
    return prisma.lifeAreaObjective.update({
      where: { id, userId },
      data: input,
    });
  }

  async deleteObjective(userId: string, id: string) {
    return prisma.lifeAreaObjective.delete({ where: { id, userId } });
  }

  // Time Allocations
  async setTimeAllocations(userId: string, allocations: { lifeArea: LifeArea; percentage: number }[]) {
    const ops = allocations.map((a) =>
      prisma.timeAllocation.upsert({
        where: { userId_lifeArea: { userId, lifeArea: a.lifeArea } },
        update: { percentage: a.percentage },
        create: { userId, lifeArea: a.lifeArea, percentage: a.percentage },
      }),
    );
    return prisma.$transaction(ops);
  }

  async getTimeAllocations(userId: string) {
    return prisma.timeAllocation.findMany({
      where: { userId },
      orderBy: { lifeArea: 'asc' },
    });
  }

  // Smart Scheduling
  async getAvailableSlots(userId: string, date: Date, durationMinutes: number) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
      },
    });

    const routines = await prisma.routine.findMany({
      where: { userId },
      include: { steps: true },
    });

    const occupied = [
      ...events.map((e) => ({ start: e.startTime, end: e.endTime })),
      ...routines
        .filter((r) => r.timeOfDay)
        .map((r) => {
          const [hours, minutes] = r.timeOfDay!.split(':').map(Number);
          const start = new Date(date);
          start.setHours(hours ?? 0, minutes ?? 0, 0, 0);
          const totalMinutes = r.steps.reduce((sum, s) => sum + s.durationMinutes, 0);
          const end = new Date(start.getTime() + Math.max(totalMinutes, 1) * 60000);
          return { start, end };
        }),
    ];

    return smartScheduler.findAvailableSlots(date, durationMinutes, occupied);
  }
}

export const calendarService = new CalendarService();
