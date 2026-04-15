import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';

export class SettingsController {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsService.getMasked(req.user!.userId);
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingsService.update(req.user!.userId, req.body);
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  }
}

export const settingsController = new SettingsController();
