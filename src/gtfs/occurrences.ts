import type { Timetable } from "../types";
import {
  getGtfsRouteTimeZone,
  getGtfsStopDepartures,
  type GtfsStopDeparture,
  type StopDepartureQuery,
} from "./database";

const DAY_MS = 86_400_000;
const TWO_SERVICE_DAYS_SECONDS = 172_800;
const DEFAULT_WINDOW_DAYS = 30;

export interface GtfsOccurrence {
  timetableId: string;
  departureDate: Date;
  /** Human clock time in the route agency's timezone. */
  departureTime: string;
  /** GTFS service day, which can differ from departureDate for 24:00+ trips. */
  serviceDate: string;
  timezone: string;
  feedId: string;
  routeId: string;
  stopId: string;
  tripId: string;
  serviceId: string;
  headsign: string | null;
  frequencyBased: boolean;
}

export interface GtfsOccurrenceDependencies {
  getRouteTimeZone: (feedId: string, routeId: string) => Promise<string | null>;
  getStopDepartures: (
    query: StopDepartureQuery,
  ) => Promise<GtfsStopDeparture[]>;
}

export interface ResolveGtfsOccurrenceOptions {
  now?: Date;
  windowEnd?: Date;
  /** Safety ceiling after filtering and de-duplication, per timetable. */
  maxOccurrencesPerTimetable?: number;
  dependencies?: GtfsOccurrenceDependencies;
}

const defaultDependencies: GtfsOccurrenceDependencies = {
  getRouteTimeZone: getGtfsRouteTimeZone,
  getStopDepartures: getGtfsStopDepartures,
};

type CalendarDate = { year: number; month: number; day: number };
type WallClock = CalendarDate & {
  hour: number;
  minute: number;
  second: number;
};

function validatedTimeZone(value: string | null): string {
  if (!value) throw new Error("The GTFS feed has no agency timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    throw new Error(`The GTFS feed has an invalid agency timezone: ${value}`);
  }
}

function partsInTimeZone(date: Date, timezone: string): WallClock {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function calendarDateString(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return (
    Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)
  );
}

/** Convert a GTFS service-day time to an absolute instant in agency timezone. */
export function gtfsServiceTimeToDate(
  serviceDate: CalendarDate,
  totalSeconds: number,
  timezone: string,
): Date {
  if (!Number.isSafeInteger(totalSeconds) || totalSeconds < 0) {
    throw new Error("GTFS service time must be a non-negative integer");
  }
  const targetWallMs =
    Date.UTC(serviceDate.year, serviceDate.month - 1, serviceDate.day) +
    totalSeconds * 1000;
  let instantMs = targetWallMs;

  // Intl exposes timezone conversion but not its inverse. Iteratively adjusting
  // the observed wall clock converges for normal times and across offset changes.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = partsInTimeZone(new Date(instantMs), timezone);
    const observedWallMs = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const difference = targetWallMs - observedWallMs;
    instantMs += difference;
    if (difference === 0) break;
  }
  return new Date(instantMs);
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function matchesLinkedSource(
  table: Timetable,
  departure: GtfsStopDeparture,
): boolean {
  const source = table.gtfsSource;
  if (!source) return false;
  if (departure.routeId !== source.routeId) return false;
  if (
    source.directionId !== undefined &&
    departure.directionId !== source.directionId
  )
    return false;
  if (
    source.updatePolicy !== "automatic" &&
    source.serviceIds.length &&
    !source.serviceIds.includes(departure.serviceId)
  )
    return false;
  if (source.headsign) {
    if (normalizedText(departure.headsign) !== normalizedText(source.headsign))
      return false;
  }
  return departure.exact;
}

function occurrenceClockTime(date: Date, timezone: string): string {
  const parts = partsInTimeZone(date, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Resolve linked GTFS timetables without flattening them into weekday/time
 * rules. Calendar exceptions, agency timezone, exact frequency trips and
 * 24:00+ stop times are evaluated from the imported feed on every refresh.
 */
export async function resolveGtfsOccurrences(
  timetables: Timetable[],
  options: ResolveGtfsOccurrenceOptions = {},
): Promise<GtfsOccurrence[]> {
  const now = options.now ?? new Date();
  const windowEnd =
    options.windowEnd ?? new Date(now.getTime() + DEFAULT_WINDOW_DAYS * DAY_MS);
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(windowEnd.getTime()) ||
    windowEnd <= now
  ) {
    throw new Error("GTFS occurrence window must end after now");
  }
  const maximum = Math.max(
    1,
    Math.min(10_000, options.maxOccurrencesPerTimetable ?? 2_000),
  );
  const dependencies = options.dependencies ?? defaultDependencies;
  const all: GtfsOccurrence[] = [];

  for (const table of timetables) {
    if (!table.enabled || table.source !== "gtfs" || !table.gtfsSource)
      continue;
    const source = table.gtfsSource;
    const timezone = validatedTimeZone(
      await dependencies.getRouteTimeZone(source.feedId, source.routeId),
    );
    const firstWallDate = partsInTimeZone(now, timezone);
    const lastWallDate = partsInTimeZone(windowEnd, timezone);
    // The previous service day is necessary for departures encoded as 24:00+
    // that occur shortly after midnight on the current wall-clock date.
    let serviceDay = addCalendarDays(firstWallDate, -1);
    const finalServiceDay: CalendarDate = lastWallDate;
    const seen = new Set<string>();
    let tableCount = 0;

    while (
      compareCalendarDates(serviceDay, finalServiceDay) <= 0 &&
      tableCount < maximum
    ) {
      const serviceDate = calendarDateString(serviceDay);
      const serviceDayStart = gtfsServiceTimeToDate(serviceDay, 0, timezone);
      const startSeconds = Math.max(
        0,
        Math.floor((now.getTime() - serviceDayStart.getTime()) / 1000),
      );
      const endSeconds = Math.min(
        TWO_SERVICE_DAYS_SECONDS,
        Math.max(
          startSeconds + 1,
          Math.ceil((windowEnd.getTime() - serviceDayStart.getTime()) / 1000),
        ),
      );
      const departures = await dependencies.getStopDepartures({
        feedId: source.feedId,
        stopId: source.stopId,
        serviceDate,
        startSeconds,
        endSeconds,
        routeId: source.routeId,
        directionId: source.directionId,
        limit: 1000,
      });

      for (const departure of departures) {
        if (!matchesLinkedSource(table, departure)) continue;
        const departureDate = gtfsServiceTimeToDate(
          serviceDay,
          departure.departure.totalSeconds,
          timezone,
        );
        if (departureDate < now || departureDate >= windowEnd) continue;
        const wallDate = partsInTimeZone(departureDate, timezone);
        if (table.excludedDates?.includes(calendarDateString(wallDate)))
          continue;
        const key = `${table.id}\u0000${departureDate.getTime()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({
          timetableId: table.id,
          departureDate,
          departureTime: occurrenceClockTime(departureDate, timezone),
          serviceDate,
          timezone,
          feedId: source.feedId,
          routeId: source.routeId,
          stopId: source.stopId,
          tripId: departure.tripId,
          serviceId: departure.serviceId,
          headsign: departure.stopHeadsign || departure.headsign,
          frequencyBased: departure.frequencyBased,
        });
        tableCount += 1;
        if (tableCount >= maximum) break;
      }
      serviceDay = addCalendarDays(serviceDay, 1);
    }
  }

  return all.sort(
    (a, b) =>
      a.departureDate.getTime() - b.departureDate.getTime() ||
      a.timetableId.localeCompare(b.timetableId) ||
      a.tripId.localeCompare(b.tripId),
  );
}
