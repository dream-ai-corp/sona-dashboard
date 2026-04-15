import { Request, Response, NextFunction } from 'express';
import { calendarService } from './calendar.service';
import { googleCalendarService } from '../../core/services/google-calendar.service';
import { LifeArea } from '@plm/shared';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

export class CalendarController {
  async createEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await calendarService.createEvent(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: event });
    } catch (err) { next(err); }
  }

  async getEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to, lifeArea } = req.query;
      const events = await calendarService.getEvents(
        req.user!.userId,
        new Date(from as string),
        new Date(to as string),
        lifeArea as LifeArea | undefined,
      );
      res.json({ success: true, data: events });
    } catch (err) { next(err); }
  }

  async updateEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await calendarService.updateEvent(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data: event });
    } catch (err) { next(err); }
  }

  async deleteEvent(req: Request, res: Response, next: NextFunction) {
    try {
      await calendarService.deleteEvent(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  async createObjective(req: Request, res: Response, next: NextFunction) {
    try {
      const objective = await calendarService.createObjective(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: objective });
    } catch (err) { next(err); }
  }

  async getObjectives(req: Request, res: Response, next: NextFunction) {
    try {
      const objectives = await calendarService.getObjectives(req.user!.userId, req.query.lifeArea as LifeArea | undefined);
      res.json({ success: true, data: objectives });
    } catch (err) { next(err); }
  }

  async updateObjective(req: Request, res: Response, next: NextFunction) {
    try {
      const objective = await calendarService.updateObjective(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data: objective });
    } catch (err) { next(err); }
  }

  async deleteObjective(req: Request, res: Response, next: NextFunction) {
    try {
      await calendarService.deleteObjective(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  async setTimeAllocations(req: Request, res: Response, next: NextFunction) {
    try {
      const allocations = await calendarService.setTimeAllocations(req.user!.userId, req.body.allocations);
      res.json({ success: true, data: allocations });
    } catch (err) { next(err); }
  }

  async getTimeAllocations(req: Request, res: Response, next: NextFunction) {
    try {
      const allocations = await calendarService.getTimeAllocations(req.user!.userId);
      res.json({ success: true, data: allocations });
    } catch (err) { next(err); }
  }

  async googleStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const status = await googleCalendarService.getStatus(req.user!.userId);
      res.json({ success: true, data: status });
    } catch (err) { next(err); }
  }

  async googleAuthUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const stateToken = jwt.sign({ userId: req.user!.userId }, config.jwt.secret, { expiresIn: '10m' });
      const url = await googleCalendarService.getAuthUrl(req.user!.userId, stateToken);
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  }

  async googleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code || !state) {
        res.status(400).send('Missing code or state');
        return;
      }
      const decoded = jwt.verify(state, config.jwt.secret) as { userId: string };
      await googleCalendarService.handleCallback(code, decoded.userId);
      res.redirect(`${config.frontendUrl}/calendar?google=connected`);
    } catch (err) { next(err); }
  }

  async googleDisconnect(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await googleCalendarService.disconnect(req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async googleListCalendars(req: Request, res: Response, next: NextFunction) {
    try {
      const calendars = await googleCalendarService.listCalendars(req.user!.userId);
      res.json({ success: true, data: calendars });
    } catch (err) { next(err); }
  }

  async googleSetSelectedCalendars(req: Request, res: Response, next: NextFunction) {
    try {
      const ids: string[] = Array.isArray(req.body.calendarIds) ? req.body.calendarIds : [];
      const result = await googleCalendarService.setSelectedCalendars(req.user!.userId, ids);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async setLocalVisibility(req: Request, res: Response, next: NextFunction) {
    try {
      const hidden = Boolean(req.body.hidden);
      const result = await googleCalendarService.setLocalCalendarVisibility(req.user!.userId, hidden);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getCalendarSources(req: Request, res: Response, next: NextFunction) {
    try {
      const sources = await calendarService.getSources(req.user!.userId);
      res.json({ success: true, data: sources });
    } catch (err) { next(err); }
  }

  async googleSync(req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      // Pull a wide window so day/week/month views all have data.
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);
      const result = await googleCalendarService.syncEvents(req.user!.userId, from, to);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getAvailableSlots(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, durationMinutes } = req.query;
      const slots = await calendarService.getAvailableSlots(
        req.user!.userId,
        new Date(date as string),
        parseInt(durationMinutes as string, 10),
      );
      res.json({ success: true, data: slots });
    } catch (err) { next(err); }
  }
}

export const calendarController = new CalendarController();
