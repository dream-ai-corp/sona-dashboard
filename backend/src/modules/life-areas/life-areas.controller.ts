import { Request, Response, NextFunction } from 'express';
import { lifeAreasService } from './life-areas.service';

export class LifeAreasController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await lifeAreasService.list(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await lifeAreasService.upsert(req.user!.userId, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async bulkUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await lifeAreasService.bulkUpdate(req.user!.userId, req.body.preferences);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async reset(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await lifeAreasService.reset(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const lifeAreasController = new LifeAreasController();
