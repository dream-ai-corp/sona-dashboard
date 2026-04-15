import { Request, Response, NextFunction } from 'express';
import { financeService } from './finance.service';

export class FinanceController {
  // Categories
  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.createCategory(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.getCategories(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.updateCategory(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
      await financeService.deleteCategory(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Transactions
  async createTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.createTransaction(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await financeService.getTransactions(req.user!.userId, req.query as any);
      res.json({
        success: true,
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
      });
    } catch (err) { next(err); }
  }
  async updateTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.updateTransaction(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      await financeService.deleteTransaction(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Accounts
  async createAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.createAccount(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.getAccounts(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.updateAccount(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      await financeService.deleteAccount(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Recurring series
  async createSeries(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.createSeries(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getSeries(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.getSeries(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateSeries(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.updateSeries(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteSeries(req: Request, res: Response, next: NextFunction) {
    try {
      await financeService.deleteSeries(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Dashboard KPIs (FIN-22)
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.getDashboardSummary(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // Projection + summary
  async getProjection(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await financeService.getProjection(req.user!.userId, req.query as any);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getMonthlySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const year = parseInt(req.params.year as string, 10);
      const month = parseInt(req.params.month as string, 10);
      const data = await financeService.getMonthlySummary(req.user!.userId, year, month);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const financeController = new FinanceController();
