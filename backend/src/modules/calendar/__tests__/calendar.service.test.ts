import { CalendarService } from '../calendar.service';
import { prisma } from '../../../config/database';
import { LifeArea } from '@plm/shared';

jest.mock('../../../config/database', () => ({
  prisma: {
    calendarEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    lifeAreaObjective: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    timeAllocation: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    routine: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  },
}));

describe('CalendarService', () => {
  let service: CalendarService;
  const userId = 'user-1';

  beforeEach(() => {
    service = new CalendarService();
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create a calendar event', async () => {
      const input = {
        title: 'Gym',
        lifeArea: LifeArea.SANTE,
        startTime: new Date('2026-04-14T08:00:00Z'),
        endTime: new Date('2026-04-14T09:00:00Z'),
        allDay: false,
      };
      (prisma.calendarEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-1', ...input, userId });

      const result = await service.createEvent(userId, input);
      expect(result.title).toBe('Gym');
    });
  });

  describe('getObjectives', () => {
    it('should return objectives filtered by life area', async () => {
      (prisma.lifeAreaObjective.findMany as jest.Mock).mockResolvedValue([
        { id: 'obj-1', title: 'Lose weight', lifeArea: LifeArea.SANTE },
      ]);

      const result = await service.getObjectives(userId, LifeArea.SANTE);
      expect(result).toHaveLength(1);
      expect(prisma.lifeAreaObjective.findMany).toHaveBeenCalledWith({
        where: { userId, lifeArea: LifeArea.SANTE },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
