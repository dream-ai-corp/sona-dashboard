import { Request, Response, NextFunction } from 'express';
import { voiceService } from './voice.service';

export class VoiceController {
  async chat(req: Request, res: Response, next: NextFunction) {
    try {
      const message = String(req.body?.message ?? '').trim();
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : undefined;
      if (!message) {
        res.status(400).json({ success: false, error: 'message required' });
        return;
      }
      const result = await voiceService.chat(req.user!.userId, message, sessionId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async processCommand(req: Request, res: Response, next: NextFunction) {
    try {
      const transcript = String(req.body?.transcript ?? '').trim();
      const result = await voiceService.processCommand(req.user!.userId, transcript);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async clearSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : undefined;
      voiceService.clearSession(req.user!.userId, sessionId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}

export const voiceController = new VoiceController();
