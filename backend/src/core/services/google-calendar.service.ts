import { google, Auth, calendar_v3 } from 'googleapis';
import { prisma } from '../../config/database';
import { settingsService } from '../../modules/settings/settings.service';
import { AppError } from '../middleware/error-handler.middleware';

function translateGoogleError(err: unknown): never {
  if (err instanceof AppError) throw err;

  const e = err as { response?: { data?: { error?: string; error_description?: string } }; message?: string; code?: number | string };
  const data = e?.response?.data;
  if (data?.error === 'invalid_client') {
    throw new AppError(
      400,
      'GOOGLE_INVALID_CLIENT',
      'Google rejected the OAuth client. Re-check your Client ID and Client Secret in Settings — they must match the OAuth client created in Google Cloud Console.',
    );
  }
  if (data?.error === 'invalid_grant') {
    throw new AppError(
      400,
      'GOOGLE_INVALID_GRANT',
      'Google refresh token is no longer valid (revoked, expired, or wrong client). Click Disconnect, then Connect Google again.',
    );
  }
  if (data?.error_description || data?.error) {
    throw new AppError(400, 'GOOGLE_OAUTH_ERROR', `Google OAuth error: ${data.error_description || data.error}`);
  }
  if (typeof e?.code === 'number' && (e.code === 401 || e.code === 403)) {
    throw new AppError(e.code, 'GOOGLE_AUTH_ERROR', e.message || 'Google rejected the request');
  }
  throw new AppError(502, 'GOOGLE_API_ERROR', `Google API error: ${e?.message || 'unknown'}`);
}

function eventStart(evt: calendar_v3.Schema$Event): Date | null {
  if (evt.start?.dateTime) return new Date(evt.start.dateTime);
  if (evt.start?.date) return new Date(evt.start.date + 'T00:00:00');
  return null;
}
function eventEnd(evt: calendar_v3.Schema$Event): Date | null {
  if (evt.end?.dateTime) return new Date(evt.end.dateTime);
  if (evt.end?.date) return new Date(evt.end.date + 'T23:59:59');
  return null;
}

export class GoogleCalendarService {
  private async buildOAuthClient(userId: string): Promise<Auth.OAuth2Client> {
    const settings = await settingsService.getRaw(userId);
    if (!settings.googleClientId || !settings.googleClientSecret || !settings.googleRedirectUri) {
      throw new AppError(400, 'GOOGLE_NOT_CONFIGURED', 'Google Calendar credentials not set in Settings');
    }
    return new google.auth.OAuth2(
      settings.googleClientId,
      settings.googleClientSecret,
      settings.googleRedirectUri,
    );
  }

  async getAuthUrl(userId: string, state: string): Promise<string> {
    const client = await this.buildOAuthClient(userId);
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state,
    });
  }

  async handleCallback(code: string, userId: string) {
    try {
      const client = await this.buildOAuthClient(userId);
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) {
        throw new AppError(400, 'NO_REFRESH_TOKEN', 'Google did not return a refresh token. Revoke access and try again.');
      }
      await prisma.user.update({
        where: { id: userId },
        data: { googleRefreshToken: tokens.refresh_token },
      });
      return { connected: true };
    } catch (err) {
      translateGoogleError(err);
    }
  }

  async disconnect(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { googleRefreshToken: null },
    });
    return { connected: false };
  }

  async getStatus(userId: string) {
    const settings = await settingsService.getRaw(userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      configured: Boolean(settings.googleClientId && settings.googleClientSecret && settings.googleRedirectUri),
      connected: Boolean(user.googleRefreshToken),
    };
  }

  private async getCalendarClient(userId: string) {
    const client = await this.buildOAuthClient(userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.googleRefreshToken) {
      throw new AppError(400, 'GOOGLE_NOT_CONNECTED', 'Google Calendar not connected for this user');
    }
    client.setCredentials({ refresh_token: user.googleRefreshToken });
    return google.calendar({ version: 'v3', auth: client });
  }

  async listCalendars(userId: string) {
    try {
      const calendar = await this.getCalendarClient(userId);
      const response = await calendar.calendarList.list({ showHidden: true });
      const items = response.data.items || [];
      return items.map((c) => ({
        id: c.id || '',
        summary: c.summary || '(unnamed)',
        description: c.description || null,
        primary: Boolean(c.primary),
        backgroundColor: c.backgroundColor || null,
        foregroundColor: c.foregroundColor || null,
        accessRole: c.accessRole || null,
      }));
    } catch (err) {
      translateGoogleError(err);
    }
  }

  async setSelectedCalendars(userId: string, calendarIds: string[]) {
    await prisma.user.update({
      where: { id: userId },
      data: { selectedGoogleCalendarIds: calendarIds },
    });
    return { selected: calendarIds };
  }

  async setLocalCalendarVisibility(userId: string, hidden: boolean) {
    await prisma.user.update({
      where: { id: userId },
      data: { hideLocalCalendar: hidden },
    });
    return { hideLocalCalendar: hidden };
  }

  async syncEvents(userId: string, timeMin: Date, timeMax: Date) {
    let calendar;
    try {
      calendar = await this.getCalendarClient(userId);
    } catch (err) {
      translateGoogleError(err);
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // Look up the user's full calendarList (best-effort) so we can both expand the
    // default selection AND attach a name/color to each imported event.
    const calendarMeta: Record<string, { name: string; color: string | null }> = {};
    let allCalendarIds: string[] = [];
    try {
      const list = await calendar!.calendarList.list({ showHidden: true });
      for (const c of list.data.items || []) {
        if (c.id) {
          calendarMeta[c.id] = { name: c.summary || '(unnamed)', color: c.backgroundColor || null };
          allCalendarIds.push(c.id);
        }
      }
    } catch {
      // swallow - fall back to primary
    }
    if (allCalendarIds.length === 0) allCalendarIds = ['primary'];

    // If the user hasn't picked any specific calendars, sync ALL of theirs.
    let calendarIds = user.selectedGoogleCalendarIds;
    if (calendarIds.length === 0) calendarIds = allCalendarIds;

    let fetched = 0;
    let imported = 0;
    let updated = 0;
    const errorsPerCalendar: Record<string, string> = {};

    for (const calId of calendarIds) {
      let pageToken: string | undefined = undefined;
      const calItems: calendar_v3.Schema$Event[] = [];
      try {
        for (;;) {
          const response: { data: calendar_v3.Schema$Events } = await calendar!.events.list({
            calendarId: calId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            pageToken,
          });
          for (const item of response.data.items || []) calItems.push(item);
          if (!response.data.nextPageToken) break;
          pageToken = response.data.nextPageToken;
        }
      } catch (err) {
        const e = err as { message?: string };
        errorsPerCalendar[calId] = e?.message || 'failed';
        continue;
      }

      fetched += calItems.length;
      const meta = calendarMeta[calId] || { name: calId === 'primary' ? 'Primary' : calId, color: null };

      for (const evt of calItems) {
        if (!evt.id) continue;
        const start = eventStart(evt);
        const end = eventEnd(evt);
        if (!start || !end) continue;

        const existing = await prisma.calendarEvent.findFirst({
          where: { userId, googleEventId: evt.id },
        });
        const data = {
          title: evt.summary || '(untitled)',
          description: evt.description || null,
          startTime: start,
          endTime: end,
          allDay: !evt.start?.dateTime,
          googleCalendarId: calId,
          googleCalendarName: meta.name,
          googleColor: meta.color,
        };
        if (existing) {
          await prisma.calendarEvent.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.calendarEvent.create({
            data: {
              userId,
              lifeArea: 'ORGANISATION',
              googleEventId: evt.id,
              ...data,
            },
          });
          imported++;
        }
      }
    }

    return {
      fetched,
      imported,
      updated,
      calendars: calendarIds.length,
      errors: Object.keys(errorsPerCalendar).length > 0 ? errorsPerCalendar : undefined,
    };
  }

  async pushEvent(userId: string, event: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
  }) {
    const calendar = await this.getCalendarClient(userId);
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.description,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
      },
    });
    return response.data;
  }
}

export const googleCalendarService = new GoogleCalendarService();
