import { Request, Response, NextFunction } from 'express';
import { routinesService } from './routines.service';

export class RoutinesController {
  async createRoutine(req: Request, res: Response, next: NextFunction) {
    try {
      const routine = await routinesService.createRoutine(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: routine });
    } catch (err) { next(err); }
  }

  async getRoutines(req: Request, res: Response, next: NextFunction) {
    try {
      const routines = await routinesService.getRoutines(req.user!.userId);
      res.json({ success: true, data: routines });
    } catch (err) { next(err); }
  }

  async getRoutine(req: Request, res: Response, next: NextFunction) {
    try {
      const routine = await routinesService.getRoutine(req.user!.userId, req.params.id as string);
      res.json({ success: true, data: routine });
    } catch (err) { next(err); }
  }

  async updateRoutine(req: Request, res: Response, next: NextFunction) {
    try {
      const routine = await routinesService.updateRoutine(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data: routine });
    } catch (err) { next(err); }
  }

  async deleteRoutine(req: Request, res: Response, next: NextFunction) {
    try {
      await routinesService.deleteRoutine(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  async toggleAlarm(req: Request, res: Response, next: NextFunction) {
    try {
      const routine = await routinesService.toggleAlarm(req.user!.userId, req.params.id as string);
      res.json({ success: true, data: routine });
    } catch (err) { next(err); }
  }

  // Presets
  async listPresets(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = routinesService.listPresets();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async instantiatePreset(req: Request, res: Response, next: NextFunction) {
    try {
      const routine = await routinesService.instantiatePreset(req.user!.userId, req.params.presetId as string);
      res.status(201).json({ success: true, data: routine });
    } catch (err) { next(err); }
  }

  // Export / Import
  async exportRoutine(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await routinesService.exportRoutine(req.user!.userId, req.params.id as string);
      const slug = String(doc.routine.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="routine-${slug}.json"`);
      res.send(JSON.stringify(doc, null, 2));
    } catch (err) { next(err); }
  }

  async importRoutine(req: Request, res: Response, next: NextFunction) {
    try {
      const routine = await routinesService.importRoutine(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: routine });
    } catch (err) { next(err); }
  }
}

export const routinesController = new RoutinesController();
