import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../core/middleware/validate.middleware';
import { authenticate } from '../../core/middleware/auth.middleware';
import { registerSchema, loginSchema } from './auth.validator';

export const router = Router();

router.post('/register', validate({ body: registerSchema }), (req, res, next) => authController.register(req, res, next));
router.post('/login', validate({ body: loginSchema }), (req, res, next) => authController.login(req, res, next));
router.get('/profile', authenticate, (req, res, next) => authController.getProfile(req, res, next));
