import type { ChannelRecord, ScheduleSlots } from './db.js';

function getLocalParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) === 24 ? 0 : Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  // Start with a UTC guess and refine by comparing formatted zoned parts
  let utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let i = 0; i < 3; i++) {
    const local = getLocalParts(utcGuess, timeZone);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const actualAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0, 0);
    const diffMs = desiredAsUtc - actualAsUtc;
    if (diffMs === 0) break;
    utcGuess = new Date(utcGuess.getTime() + diffMs);
  }
  return utcGuess;
}

export function computeNextScheduleSlot(
  slots: ScheduleSlots,
  timeZone: string,
  occupiedIsoTimes: string[],
  fromDate = new Date(),
  minLeadMinutes = 15
): string {
  const validDays = new Set(slots.days?.length ? slots.days : [0, 1, 2, 3, 4, 5, 6]);
  const sortedTimes = [...(slots.times?.length ? slots.times : ['18:00'])]
    .map((t) => {
      const [h, m] = t.split(':').map((n) => Number(n));
      return {
        hour: Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 18,
        minute: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0,
      };
    })
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  const occupiedMinutes = new Set(
    occupiedIsoTimes
      .filter(Boolean)
      .map((iso) => Math.floor(new Date(iso).getTime() / 60000))
      .filter((n) => Number.isFinite(n))
  );

  const earliestMs = fromDate.getTime() + minLeadMinutes * 60 * 1000;
  const startLocal = getLocalParts(fromDate, timeZone);

  for (let dayOffset = 0; dayOffset < 90; dayOffset++) {
    const probeDate = new Date(Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day + dayOffset, 12, 0, 0));
    const localDay = getLocalParts(probeDate, timeZone);
    if (!validDays.has(localDay.weekday)) continue;

    for (const slot of sortedTimes) {
      const candidate = zonedDateTimeToUtc(
        localDay.year,
        localDay.month,
        localDay.day,
        slot.hour,
        slot.minute,
        timeZone
      );
      if (candidate.getTime() < earliestMs) continue;
      const candidateMinute = Math.floor(candidate.getTime() / 60000);
      // Avoid collisions within +/- 15 minutes of an already scheduled video on this channel
      let collides = false;
      for (let delta = -15; delta <= 15; delta++) {
        if (occupiedMinutes.has(candidateMinute + delta)) {
          collides = true;
          break;
        }
      }
      if (!collides) {
        return candidate.toISOString();
      }
    }
  }

  return new Date(earliestMs + 60 * 60 * 1000).toISOString();
}

export function formatSlotSuggestion(channel: ChannelRecord, timeZone: string, occupiedIsoTimes: string[]): string {
  return computeNextScheduleSlot(channel.scheduleSlots, timeZone, occupiedIsoTimes);
}
