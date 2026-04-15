import { Router } from 'express';
import { routinesController } from './routines.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { createRoutineSchema, updateRoutineSchema, importRoutineSchema } from './routines.validator';

export const router = Router();
router.use(authenticate);

// Presets — must be registered before /:id to avoid route collision
router.get('/presets', (req, res, next) => routinesController.listPresets(req, res, next));
router.post('/presets/:presetId', (req, res, next) => routinesController.instantiatePreset(req, res, next));

// Import (must come before /:id)
router.post('/import', validate({ body: importRoutineSchema }), (req, res, next) => routinesController.importRoutine(req, res, next));

// CRUD
router.post('/', validate({ body: createRoutineSchema }), (req, res, next) => routinesController.createRoutine(req, res, next));
router.get('/', (req, res, next) => routinesController.getRoutines(req, res, next));
router.get('/:id', (req, res, next) => routinesController.getRoutine(req, res, next));
router.get('/:id/export', (req, res, next) => routinesController.exportRoutine(req, res, next));
router.put('/:id', validate({ body: updateRoutineSchema }), (req, res, next) => routinesController.updateRoutine(req, res, next));
router.delete('/:id', (req, res, next) => routinesController.deleteRoutine(req, res, next));
router.post('/:id/toggle-alarm', (req, res, next) => routinesController.toggleAlarm(req, res, next));
