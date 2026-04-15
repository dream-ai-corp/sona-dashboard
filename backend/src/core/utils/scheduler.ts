export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface OccupiedSlot {
  start: Date;
  end: Date;
  lifeArea?: string;
}

export class SmartScheduler {
  private activeHoursStart = 7; // 07:00
  private activeHoursEnd = 22; // 22:00

  findAvailableSlots(
    date: Date,
    durationMinutes: number,
    occupiedSlots: OccupiedSlot[],
  ): TimeSlot[] {
    const dayStart = new Date(date);
    dayStart.setHours(this.activeHoursStart, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(this.activeHoursEnd, 0, 0, 0);

    // Sort occupied slots by start time
    const sorted = [...occupiedSlots]
      .filter(s => s.start < dayEnd && s.end > dayStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const available: TimeSlot[] = [];
    let cursor = dayStart.getTime();
    const durationMs = durationMinutes * 60 * 1000;

    for (const slot of sorted) {
      const gapStart = cursor;
      const gapEnd = slot.start.getTime();

      if (gapEnd - gapStart >= durationMs) {
        available.push({
          start: new Date(gapStart),
          end: new Date(gapStart + durationMs),
        });
      }
      cursor = Math.max(cursor, slot.end.getTime());
    }

    // Check remaining time after last occupied slot
    if (dayEnd.getTime() - cursor >= durationMs) {
      available.push({
        start: new Date(cursor),
        end: new Date(cursor + durationMs),
      });
    }

    return available;
  }
}

export const smartScheduler = new SmartScheduler();
