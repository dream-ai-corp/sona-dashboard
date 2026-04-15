import { Router } from 'express';
import { settingsController } from './settings.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { updateSettingsSchema } from './settings.validator';

export const router = Router();
router.use(authenticate);

router.get('/', (req, res, next) => settingsController.get(req, res, next));
router.put('/', validate({ body: updateSettingsSchema }), (req, res, next) => settingsController.update(req, res, next));
