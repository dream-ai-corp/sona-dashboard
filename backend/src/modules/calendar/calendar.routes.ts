import { Router } from 'express';
import { calendarController } from './calendar.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { createEventSchema, createObjectiveSchema, timeAllocationSchema, availableSlotsSchema } from './calendar.validator';

export const router = Router();

// Google OAuth callback runs WITHOUT the JWT auth middleware (state token carries the user)
router.get('/google/callback', (req, res, next) => calendarController.googleCallback(req, res, next));

router.use(authenticate);

// Events
router.post('/events', validate({ body: createEventSchema }), (req, res, next) => calendarController.createEvent(req, res, next));
router.get('/events', (req, res, next) => calendarController.getEvents(req, res, next));
router.put('/events/:id', (req, res, next) => calendarController.updateEvent(req, res, next));
router.delete('/events/:id', (req, res, next) => calendarController.deleteEvent(req, res, next));

// Objectives
router.post('/objectives', validate({ body: createObjectiveSchema }), (req, res, next) => calendarController.createObjective(req, res, next));
router.get('/objectives', (req, res, next) => calendarController.getObjectives(req, res, next));
router.put('/objectives/:id', (req, res, next) => calendarController.updateObjective(req, res, next));
router.delete('/objectives/:id', (req, res, next) => calendarController.deleteObjective(req, res, next));

// Time Allocations
router.put('/time-allocations', validate({ body: timeAllocationSchema }), (req, res, next) => calendarController.setTimeAllocations(req, res, next));
router.get('/time-allocations', (req, res, next) => calendarController.getTimeAllocations(req, res, next));

// Smart Scheduling
router.get('/available-slots', validate({ query: availableSlotsSchema }), (req, res, next) => calendarController.getAvailableSlots(req, res, next));

// Google Calendar integration
router.get('/google/status', (req, res, next) => calendarController.googleStatus(req, res, next));
router.get('/google/auth-url', (req, res, next) => calendarController.googleAuthUrl(req, res, next));
router.delete('/google', (req, res, next) => calendarController.googleDisconnect(req, res, next));
router.post('/google/sync', (req, res, next) => calendarController.googleSync(req, res, next));
router.get('/google/calendars', (req, res, next) => calendarController.googleListCalendars(req, res, next));
router.put('/google/selected-calendars', (req, res, next) => calendarController.googleSetSelectedCalendars(req, res, next));

// Calendar sources (local + connected externals)
router.get('/sources', (req, res, next) => calendarController.getCalendarSources(req, res, next));
router.put('/local/visibility', (req, res, next) => calendarController.setLocalVisibility(req, res, next));
