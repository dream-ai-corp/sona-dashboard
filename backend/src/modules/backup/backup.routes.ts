import { Router } from 'express';
import express from 'express';
import { backupController } from './backup.controller';
import { authenticate } from '../../core/middleware/auth.middleware';

export const router = Router();
router.use(authenticate);

// Larger body limit for import (full app state can be several MB)
router.get('/export', (req, res, next) => backupController.exportAll(req, res, next));
router.post(
  '/import',
  express.json({ limit: '50mb' }),
  (req, res, next) => backupController.importAll(req, res, next),
);
