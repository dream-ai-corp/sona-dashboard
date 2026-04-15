import { Router, Request, Response, NextFunction } from 'express';
import { projectsService } from './projects.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { createProjectSchema, updateProjectSchema } from './projects.validator';

export const router = Router();
router.use(authenticate);

router.get('/', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = projectsService.getProjects();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = projectsService.getProject(req.params.id as string);
    if (!data) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate({ body: createProjectSchema }), (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = projectsService.createProject(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validate({ body: updateProjectSchema }), (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = projectsService.updateProject(req.params.id as string, req.body);
    if (!data) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const ok = projectsService.deleteProject(req.params.id as string);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
