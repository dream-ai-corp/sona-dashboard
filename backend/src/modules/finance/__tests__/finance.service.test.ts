import { FinanceService } from '../finance.service';
import { prisma } from '../../../config/database';
import { LifeArea } from '@plm/shared';

jest.mock('../../../config/database', () => ({
  prisma: {
    financeCategory: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    financeTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe('FinanceService', () => {
  let service: FinanceService;
  const userId = 'user-1';

  beforeEach(() => {
    service = new FinanceService();
    jest.clearAllMocks();
  });

  describe('createCategory', () => {
    it('should create a finance category', async () => {
      const input = { name: 'Groceries', lifeArea: LifeArea.SANTE, type: 'EXPENSE' as const, budgetMonthly: 500 };
      (prisma.financeCategory.create as jest.Mock).mockResolvedValue({ id: 'cat-1', ...input, userId });

      const result = await service.createCategory(userId, input);

      expect(result.name).toBe('Groceries');
      expect(prisma.financeCategory.create).toHaveBeenCalledWith({
        data: { ...input, userId, budgetMonthly: 500 },
      });
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const mockTransactions = [
        { id: 'tx-1', amount: -50, description: 'Food', date: new Date() },
      ];
      (prisma.financeTransaction.findMany as jest.Mock).mockResolvedValue(mockTransactions);
      (prisma.financeTransaction.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getTransactions(userId, { page: 1, limit: 20, sortOrder: 'desc' });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });
});
