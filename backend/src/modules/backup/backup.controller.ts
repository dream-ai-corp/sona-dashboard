import { Request, Response, NextFunction } from 'express';
import { backupService } from './backup.service';

export class BackupController {
  async exportAll(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await backupService.exportAll(req.user!.userId);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="plm-backup-${date}.json"`);
      res.send(JSON.stringify(doc, null, 2));
    } catch (err) { next(err); }
  }

  async importAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await backupService.importAll(req.user!.userId, req.body);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}

export const backupController = new BackupController();
