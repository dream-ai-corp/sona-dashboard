import { RoutinesService } from '../routines.service';
import { prisma } from '../../../config/database';
import { LifeArea } from '@plm/shared';

jest.mock('../../../config/database', () => ({
  prisma: {
    routine: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    routineStep: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    recurringRule: {
      create: jest.fn(),
    },
    notification: { create: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({
        routine: {
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r-1' }),
          update: jest.fn().mockResolvedValue({ id: 'r-1', steps: [] }),
        },
        routineStep: { deleteMany: jest.fn(), createMany: jest.fn() },
      }),
    ),
  },
}));

jest.mock('../../../core/services/notification.service', () => ({
  notificationService: { schedule: jest.fn() },
}));

describe('RoutinesService', () => {
  let service: RoutinesService;
  const userId = 'user-1';

  beforeEach(() => {
    service = new RoutinesService();
    jest.clearAllMocks();
  });

  describe('createRoutine', () => {
    it('creates a routine with nested steps', async () => {
      const input = {
        title: 'Morning',
        lifeArea: LifeArea.SANTE,
        timeOfDay: '07:00',
        alarmEnabled: true,
        steps: [
          { title: 'Silence', kind: 'SILENCE' as const, durationMinutes: 10, mediaAutoplay: false },
          { title: 'Exercise', kind: 'EXERCISE' as const, durationMinutes: 10, mediaAutoplay: true, mediaUrl: 'https://example.com/music' },
        ],
      };
      (prisma.routine.create as jest.Mock).mockResolvedValue({
        id: 'routine-1',
        ...input,
        userId,
        recurringRule: null,
        steps: [],
      });

      await service.createRoutine(userId, input);

      const call = (prisma.routine.create as jest.Mock).mock.calls[0]![0];
      expect(call.data.steps.create).toHaveLength(2);
      expect(call.data.steps.create[0]).toMatchObject({ title: 'Silence', orderIndex: 0 });
      expect(call.data.steps.create[1]).toMatchObject({ title: 'Exercise', orderIndex: 1 });
    });

    it('creates a routine with weekly recurrence', async () => {
      const input = {
        title: 'Gym',
        lifeArea: LifeArea.SANTE,
        timeOfDay: '18:00',
        alarmEnabled: true,
        steps: [],
        recurrence: { type: 'WEEKLY' as const, interval: 1, daysOfWeek: [1, 3, 5] },
      };
      (prisma.recurringRule.create as jest.Mock).mockResolvedValue({ id: 'rule-1' });
      (prisma.routine.create as jest.Mock).mockResolvedValue({
        id: 'routine-2',
        ...input,
        userId,
        recurringRuleId: 'rule-1',
        steps: [],
      });

      await service.createRoutine(userId, input);
      expect(prisma.recurringRule.create).toHaveBeenCalled();
    });
  });

  describe('presets', () => {
    it('includes the SAVERS Miracle Morning preset', () => {
      const list = service.listPresets();
      const savers = list.find((p) => p.id === 'miracle-morning-savers');
      expect(savers).toBeDefined();
      expect(savers!.routine.steps).toHaveLength(6);
      const durations = savers!.routine.steps.map((s) => s.durationMinutes);
      expect(durations).toEqual([10, 10, 10, 10, 10, 10]);
      expect(savers!.routine.steps.map((s) => s.kind)).toEqual([
        'SILENCE', 'AFFIRMATIONS', 'VISUALIZATION', 'EXERCISE', 'READING', 'SCRIBING',
      ]);
    });
  });

  describe('toggleAlarm', () => {
    it('toggles alarm enabled state', async () => {
      (prisma.routine.findFirstOrThrow as jest.Mock).mockResolvedValue({
        id: 'routine-1', alarmEnabled: true,
      });
      (prisma.routine.update as jest.Mock).mockResolvedValue({
        id: 'routine-1', alarmEnabled: false, steps: [],
      });

      await service.toggleAlarm(userId, 'routine-1');
      expect(prisma.routine.update).toHaveBeenCalledWith({
        where: { id: 'routine-1' },
        data: { alarmEnabled: false },
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      });
    });
  });
});
