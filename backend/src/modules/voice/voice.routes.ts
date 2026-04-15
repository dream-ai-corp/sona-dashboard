import { Router } from 'express';
import { voiceController } from './voice.controller';
import { authenticate } from '../../core/middleware/auth.middleware';

export const router = Router();
router.use(authenticate);

router.post('/chat', (req, res, next) => voiceController.chat(req, res, next));
router.post('/command', (req, res, next) => voiceController.processCommand(req, res, next));
router.post('/session/clear', (req, res, next) => voiceController.clearSession(req, res, next));
