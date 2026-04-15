import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import {
  CreateCategoryInput,
  CreateTransactionInput,
  TransactionQuery,
  CreateAccountInput,
  UpdateAccountInput,
  CreateSeriesInput,
  UpdateSeriesInput,
  ProjectionQuery,
} from './finance.validator';
import {
  computeProjection,
  ProjectionPoint,
  ProjectionSeries,
  ProjectionTransaction,
  Granularity,
} from './projection.engine';

const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

export class FinanceService {
  // ==================== Categories ====================
  async createCategory(userId: string, input: CreateCategoryInput) {
    return prisma.financeCategory.create({
      data: { ...input, userId, budgetMonthly: input.budgetMonthly ?? null },
    });
  }

  async getCategories(userId: string) {
    return prisma.financeCategory.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async updateCategory(userId: string, id: string, input: Partial<CreateCategoryInput>) {
    return prisma.financeCategory.update({ where: { id, userId }, data: input });
  }

  async deleteCategory(userId: string, id: string) {
    return prisma.financeCategory.delete({ where: { id, userId } });
  }

  // ==================== Transactions ====================
  async createTransaction(userId: string, input: CreateTransactionInput) {
    return prisma.financeTransaction.create({
      data: {
        userId,
        categoryId: input.categoryId,
        accountId: input.accountId ?? null,
        amount: input.amount,
        description: input.description,
        date: input.date,
        lifeArea: input.lifeArea,
        status: input.status ?? (input.date > new Date() ? 'SCHEDULED' : 'REALIZED'),
      },
      include: { category: true },
    });
  }

  async getTransactions(userId: string, query: TransactionQuery) {
    const where: Prisma.FinanceTransactionWhereInput = { userId };
    if (query.lifeArea) where.lifeArea = query.lifeArea;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.accountId) where.accountId = query.accountId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = query.from;
      if (query.to) where.date.lte = query.to;
    }

    const [items, total] = await Promise.all([
      prisma.financeTransaction.findMany({
        where,
        include: { category: true },
        orderBy: { date: query.sortOrder || 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.financeTransaction.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async updateTransaction(userId: string, id: string, input: Partial<CreateTransactionInput>) {
    return prisma.financeTransaction.update({
      where: { id, userId },
      data: input,
      include: { category: true },
    });
  }

  async deleteTransaction(userId: string, id: string) {
    return prisma.financeTransaction.delete({ where: { id, userId } });
  }

  // ==================== Capital accounts ====================
  async createAccount(userId: string, input: CreateAccountInput) {
    if (input.isPrimary) {
      await prisma.capitalAccount.updateMany({ where: { userId }, data: { isPrimary: false } });
    }
    return prisma.capitalAccount.create({
      data: {
        userId,
        name: input.name,
        startingBalance: input.startingBalance,
        referenceDate: input.referenceDate,
        currency: input.currency ?? 'EUR',
        isPrimary: input.isPrimary ?? false,
      },
    });
  }

  async getAccounts(userId: string) {
    return prisma.capitalAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  async updateAccount(userId: string, id: string, input: UpdateAccountInput) {
    if (input.isPrimary) {
      await prisma.capitalAccount.updateMany({ where: { userId }, data: { isPrimary: false } });
    }
    return prisma.capitalAccount.update({ where: { id, userId }, data: input });
  }

  async deleteAccount(userId: string, id: string) {
    return prisma.capitalAccount.delete({ where: { id, userId } });
  }

  // ==================== Recurring series ====================
  async createSeries(userId: string, input: CreateSeriesInput) {
    return prisma.financeRecurringSeries.create({
      data: {
        userId,
        categoryId: input.categoryId,
        accountId: input.accountId ?? null,
        description: input.description,
        amount: input.amount,
        type: input.type,
        lifeArea: input.lifeArea,
        recurrenceType: input.recurrenceType,
        interval: input.interval ?? 1,
        daysOfWeek: input.daysOfWeek ?? [],
        dayOfMonth: input.dayOfMonth ?? null,
        monthOfYear: input.monthOfYear ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        paused: input.paused ?? false,
      },
    });
  }

  async getSeries(userId: string) {
    return prisma.financeRecurringSeries.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSeries(userId: string, id: string, input: UpdateSeriesInput) {
    return prisma.financeRecurringSeries.update({ where: { id, userId }, data: input });
  }

  async deleteSeries(userId: string, id: string) {
    return prisma.financeRecurringSeries.delete({ where: { id, userId } });
  }

  // ==================== Projection ====================
  async getProjection(userId: string, query: ProjectionQuery): Promise<{
    account: { id: string; name: string; startingBalance: number; referenceDate: string } | null;
    points: ProjectionPoint[];
  }> {
    const granularity: Granularity = query.granularity ?? 'month';
    const today = new Date();
    const from = query.from ?? new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const to = query.to ?? new Date(today.getFullYear() + 1, today.getMonth(), 0);

    // Pick account: provided > primary > first
    let account = query.accountId
      ? await prisma.capitalAccount.findFirst({ where: { id: query.accountId, userId } })
      : await prisma.capitalAccount.findFirst({ where: { userId, isPrimary: true } });
    if (!account) {
      account = await prisma.capitalAccount.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    }

    const startingBalance = account ? toNum(account.startingBalance) : 0;
    const referenceDate = account ? account.referenceDate : from;

    // Load transactions relevant to the projection window (pre-roll + window)
    const loadFrom = referenceDate < from ? referenceDate : from;
    const txs = await prisma.financeTransaction.findMany({
      where: {
        userId,
        date: { gte: loadFrom, lte: to },
        ...(account ? { OR: [{ accountId: account.id }, { accountId: null }] } : {}),
      },
    });

    const realized: ProjectionTransaction[] = [];
    const scheduled: ProjectionTransaction[] = [];
    for (const t of txs) {
      const amt = Math.abs(toNum(t.amount));
      // Type inferred from sign if explicit not reliable; use status + amount sign
      // Convention: positive amount = income, negative = expense (legacy), but
      // we also allow `type` to be inferred from category if sign is positive.
      // For simplicity here: sign drives direction.
      const type: 'INCOME' | 'EXPENSE' = toNum(t.amount) >= 0 ? 'INCOME' : 'EXPENSE';
      const p: ProjectionTransaction = { id: t.id, date: t.date, amount: amt, type };
      if (t.status === 'SCHEDULED') scheduled.push(p);
      else realized.push(p);
    }

    const seriesRows = await prisma.financeRecurringSeries.findMany({
      where: { userId, paused: false, ...(account ? { OR: [{ accountId: account.id }, { accountId: null }] } : {}) },
    });
    const series: ProjectionSeries[] = seriesRows.map((s) => ({
      id: s.id,
      type: s.type,
      amount: toNum(s.amount),
      recurrenceType: s.recurrenceType,
      interval: s.interval,
      daysOfWeek: s.daysOfWeek,
      dayOfMonth: s.dayOfMonth,
      monthOfYear: s.monthOfYear,
      startDate: s.startDate,
      endDate: s.endDate,
      paused: s.paused,
    }));

    const points = computeProjection({
      startingBalance,
      referenceDate,
      from,
      to,
      granularity,
      realized,
      scheduled,
      series,
    });

    return {
      account: account
        ? {
            id: account.id,
            name: account.name,
            startingBalance,
            referenceDate: account.referenceDate.toISOString().slice(0, 10),
          }
        : null,
      points,
    };
  }

  // ==================== Dashboard KPIs (FIN-22) ====================
  async getDashboardSummary(userId: string): Promise<{
    currentCapital: number;
    net30d: number;
    projected12m: number;
    topCategories: Array<{ name: string; lifeArea: string; spent: number }>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in12m = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    const ago30d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);

    const [currentProjection, futureProjection] = await Promise.all([
      this.getProjection(userId, { from: today, to: today, granularity: 'day' }),
      this.getProjection(userId, { from: in12m, to: in12m, granularity: 'day' }),
    ]);

    const currentCapital = currentProjection.points.length > 0
      ? currentProjection.points[0].balance
      : 0;
    const projected12m = futureProjection.points.length > 0
      ? futureProjection.points[0].balance
      : 0;

    const txs30d = await prisma.financeTransaction.findMany({
      where: { userId, date: { gte: ago30d, lte: today }, status: 'REALIZED' },
      include: { category: true },
    });

    const net30d = txs30d.reduce((sum, t) => sum + toNum(t.amount), 0);

    const catMap = new Map<string, { name: string; lifeArea: string; spent: number }>();
    for (const t of txs30d) {
      if (toNum(t.amount) >= 0 || !t.category) continue;
      const key = t.category.id;
      const existing = catMap.get(key);
      if (existing) {
        existing.spent += Math.abs(toNum(t.amount));
      } else {
        catMap.set(key, { name: t.category.name, lifeArea: t.category.lifeArea, spent: Math.abs(toNum(t.amount)) });
      }
    }

    const topCategories = Array.from(catMap.values())
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);

    return { currentCapital, net30d, projected12m, topCategories };
  }

  // ==================== Summary (kept for compatibility) ====================
  async getMonthlySummary(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const transactions = await prisma.financeTransaction.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      include: { category: true },
    });

    const categories = await prisma.financeCategory.findMany({ where: { userId } });

    const summary = categories.map((cat) => {
      const catTransactions = transactions.filter((t) => t.categoryId === cat.id);
      const spent = catTransactions.reduce((sum, t) => sum + toNum(t.amount), 0);
      return {
        category: cat,
        spent: Math.abs(spent),
        budget: cat.budgetMonthly ? toNum(cat.budgetMonthly) : null,
        remaining: cat.budgetMonthly ? toNum(cat.budgetMonthly) - Math.abs(spent) : null,
      };
    });

    const totalIncome = transactions
      .filter((t) => toNum(t.amount) > 0)
      .reduce((sum, t) => sum + toNum(t.amount), 0);
    const totalExpenses = transactions
      .filter((t) => toNum(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(toNum(t.amount)), 0);

    return { summary, totalIncome, totalExpenses, balance: totalIncome - totalExpenses };
  }
}

export const financeService = new FinanceService();
