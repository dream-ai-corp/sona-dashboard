import { Router } from 'express';
import { lifeAreasController } from './life-areas.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { upsertPreferenceSchema, bulkUpdateSchema } from './life-areas.validator';

export const router = Router();
router.use(authenticate);

router.get('/', (req, res, next) => lifeAreasController.list(req, res, next));
router.put('/', validate({ body: upsertPreferenceSchema }), (req, res, next) => lifeAreasController.update(req, res, next));
router.put('/bulk', validate({ body: bulkUpdateSchema }), (req, res, next) => lifeAreasController.bulkUpdate(req, res, next));
router.delete('/', (req, res, next) => lifeAreasController.reset(req, res, next));
