import { Router } from 'express';
import { financeController } from './finance.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import {
  createCategorySchema,
  createTransactionSchema,
  transactionQuerySchema,
  createAccountSchema,
  updateAccountSchema,
  createSeriesSchema,
  updateSeriesSchema,
  projectionQuerySchema,
} from './finance.validator';

export const router = Router();
router.use(authenticate);

// Categories
router.post('/categories', validate({ body: createCategorySchema }), (req, res, next) => financeController.createCategory(req, res, next));
router.get('/categories', (req, res, next) => financeController.getCategories(req, res, next));
router.put('/categories/:id', (req, res, next) => financeController.updateCategory(req, res, next));
router.delete('/categories/:id', (req, res, next) => financeController.deleteCategory(req, res, next));

// Transactions
router.post('/transactions', validate({ body: createTransactionSchema }), (req, res, next) => financeController.createTransaction(req, res, next));
router.get('/transactions', validate({ query: transactionQuerySchema }), (req, res, next) => financeController.getTransactions(req, res, next));
router.put('/transactions/:id', (req, res, next) => financeController.updateTransaction(req, res, next));
router.delete('/transactions/:id', (req, res, next) => financeController.deleteTransaction(req, res, next));

// Capital accounts
router.post('/accounts', validate({ body: createAccountSchema }), (req, res, next) => financeController.createAccount(req, res, next));
router.get('/accounts', (req, res, next) => financeController.getAccounts(req, res, next));
router.put('/accounts/:id', validate({ body: updateAccountSchema }), (req, res, next) => financeController.updateAccount(req, res, next));
router.delete('/accounts/:id', (req, res, next) => financeController.deleteAccount(req, res, next));

// Recurring series
router.post('/series', validate({ body: createSeriesSchema }), (req, res, next) => financeController.createSeries(req, res, next));
router.get('/series', (req, res, next) => financeController.getSeries(req, res, next));
router.put('/series/:id', validate({ body: updateSeriesSchema }), (req, res, next) => financeController.updateSeries(req, res, next));
router.delete('/series/:id', (req, res, next) => financeController.deleteSeries(req, res, next));

// Dashboard KPIs (FIN-22)
router.get('/dashboard', (req, res, next) => financeController.getDashboard(req, res, next));

// Projection + summary
router.get('/projection', validate({ query: projectionQuerySchema }), (req, res, next) => financeController.getProjection(req, res, next));
router.get('/summary/:year/:month', (req, res, next) => financeController.getMonthlySummary(req, res, next));
