import { describe, expect, it, vi } from "vitest";

// The resolver is tested with injected persistence functions. Avoid loading
// Expo's native SQLite bridge in the Node test environment.
vi.mock("./database", () => ({
  getGtfsRouteTimeZone: vi.fn(),
  getGtfsStopDepartures: vi.fn(),
}));

import type { Timetable } from "../types";
import type { GtfsStopDeparture } from "./database";
import {
  gtfsServiceTimeToDate,
  resolveGtfsOccurrences,
  type GtfsOccurrenceDependencies,
} from "./occurrences";

function timetable(overrides: Partial<Timetable> = {}): Timetable {
  return {
    id: "linked-42",
    name: "42 to Marina",
    description: "Imported GTFS service",
    source: "gtfs",
    gtfsSource: {
      feedId: "feed-1",
      feedName: "Example Transit",
      feedVersion: "2026-07",
      routeId: "route-42",
      routeLabel: "42",
      stopId: "downtown",
      stopName: "Downtown",
      directionId: 1,
      headsign: "Lakeside Marina",
      serviceIds: ["summer-weekday"],
      updatePolicy: "ask",
    },
    times: [],
    days: [],
    alertMinutes: 5,
    alertMinutesList: [5],
    excludedDates: [],
    pausedUntil: null,
    enabled: true,
    locationIds: [],
    locationId: null,
    ...overrides,
  };
}

function departure(
  totalSeconds: number,
  overrides: Partial<GtfsStopDeparture> = {},
): GtfsStopDeparture {
  return {
    feedId: "feed-1",
    stopId: "downtown",
    routeId: "route-42",
    routeShortName: "42",
    routeLongName: "Downtown - Marina",
    routeType: 3,
    routeColor: null,
    routeTextColor: null,
    tripId: "trip-1",
    serviceId: "summer-weekday",
    directionId: 1,
    headsign: "Lakeside Marina",
    stopHeadsign: null,
    stopSequence: 1,
    departure: {
      raw: `${Math.floor(totalSeconds / 3600)}:30:00`,
      totalSeconds,
      secondsSinceMidnight: totalSeconds % 86_400,
      serviceDayOffset: Math.floor(totalSeconds / 86_400),
    },
    frequencyBased: false,
    exact: true,
    headwaySeconds: null,
    ...overrides,
  };
}

describe("GTFS occurrence resolution", () => {
  it("converts service times using the agency timezone", () => {
    expect(
      gtfsServiceTimeToDate(
        { year: 2026, month: 1, day: 15 },
        25 * 3600 + 30 * 60,
        "Europe/Zurich",
      ).toISOString(),
    ).toBe("2026-01-16T00:30:00.000Z");
  });

  it("checks the previous service day and preserves 24:00+ departures", async () => {
    const getStopDepartures = vi.fn(async (query) =>
      query.serviceDate === "2026-07-11"
        ? [departure(25 * 3600 + 30 * 60)]
        : [],
    );
    const dependencies: GtfsOccurrenceDependencies = {
      getRouteTimeZone: async () => "Europe/Zurich",
      getStopDepartures,
    };

    const result = await resolveGtfsOccurrences([timetable()], {
      now: new Date("2026-07-11T23:00:00.000Z"),
      windowEnd: new Date("2026-07-12T01:00:00.000Z"),
      dependencies,
    });

    expect(getStopDepartures.mock.calls[0]?.[0].serviceDate).toBe("2026-07-11");
    expect(getStopDepartures.mock.calls[0]?.[0].startSeconds).toBe(90_000);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      departureTime: "01:30",
      serviceDate: "2026-07-11",
      timezone: "Europe/Zurich",
    });
    expect(result[0].departureDate.toISOString()).toBe(
      "2026-07-11T23:30:00.000Z",
    );
  });

  it("filters linked metadata, non-exact frequencies, and duplicate instants", async () => {
    const seconds = 8 * 3600;
    const dependencies: GtfsOccurrenceDependencies = {
      getRouteTimeZone: async () => "UTC",
      getStopDepartures: async (query) =>
        query.serviceDate === "2026-07-12"
          ? [
              departure(seconds),
              departure(seconds, { tripId: "duplicate-trip" }),
              departure(seconds + 600, { serviceId: "winter" }),
              departure(seconds + 1200, { headsign: "Airport" }),
              departure(seconds + 1800, {
                exact: false,
                frequencyBased: true,
              }),
            ]
          : [],
    };

    const result = await resolveGtfsOccurrences([timetable()], {
      now: new Date("2026-07-12T07:00:00.000Z"),
      windowEnd: new Date("2026-07-12T10:00:00.000Z"),
      dependencies,
    });

    expect(result).toHaveLength(1);
    expect(result[0].tripId).toBe("trip-1");
    expect(result[0].departureDate.toISOString()).toBe(
      "2026-07-12T08:00:00.000Z",
    );
  });

  it("uses the actual departure date for exclusions after midnight", async () => {
    const dependencies: GtfsOccurrenceDependencies = {
      getRouteTimeZone: async () => "Europe/Zurich",
      getStopDepartures: async (query) =>
        query.serviceDate === "2026-07-11"
          ? [departure(25 * 3600 + 30 * 60)]
          : [],
    };
    const excluded = timetable({ excludedDates: ["2026-07-12"] });

    await expect(
      resolveGtfsOccurrences([excluded], {
        now: new Date("2026-07-11T23:00:00.000Z"),
        windowEnd: new Date("2026-07-12T01:00:00.000Z"),
        dependencies,
      }),
    ).resolves.toEqual([]);
  });
});
