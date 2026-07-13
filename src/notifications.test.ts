import { afterEach, describe, expect, it, vi } from "vitest";

import type { Timetable } from "./types";

type TestNotificationRequest = {
  content: { body: string; data: Record<string, unknown> };
  trigger: { date: Date };
};

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  schedule: vi.fn(
    async (_request: TestNotificationRequest) => "notification-id",
  ),
  resolve: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  cancelAllScheduledNotificationsAsync: mocks.cancel,
  scheduleNotificationAsync: mocks.schedule,
}));
vi.mock("expo-constants", () => ({ default: { appOwnership: "standalone" } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./gtfs/occurrences", () => ({
  resolveGtfsOccurrences: mocks.resolve,
}));

import { isTimetableLocationEligible, reschedule } from "./notifications";

function linkedTimetable(): Timetable {
  return {
    id: "linked-42",
    name: "Route 42",
    description: "",
    source: "gtfs",
    gtfsSource: {
      feedId: "feed-1",
      feedName: "Example Transit",
      feedVersion: null,
      routeId: "route-42",
      routeLabel: "42",
      stopId: "downtown",
      stopName: "Downtown",
      directionId: 1,
      headsign: "Marina",
      serviceIds: ["daily"],
      updatePolicy: "ask",
    },
    // These values must never be interpreted for a linked timetable.
    times: ["09:00"],
    days: [0, 1, 2, 3, 4, 5, 6],
    alertMinutes: 5,
    alertMinutesList: [5],
    excludedDates: [],
    pausedUntil: null,
    enabled: true,
    locationIds: [],
    locationId: null,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("notification scheduling", () => {
  it("is eligible near any selected place, but not near an unrelated place", () => {
    const table = {
      ...linkedTimetable(),
      locationIds: ["home", "work"],
      locationId: "home",
    };
    const places = [
      { id: "home", name: "Home", latitude: 1, longitude: 1, radius: 100 },
      { id: "work", name: "Work", latitude: 2, longitude: 2, radius: 100 },
    ];
    expect(
      isTimetableLocationEligible(table, places, undefined, ["work"]),
    ).toBe(true);
    expect(isTimetableLocationEligible(table, places, undefined, ["gym"])).toBe(
      false,
    );
  });

  it("treats an empty place list as Anywhere", () => {
    expect(
      isTimetableLocationEligible(linkedTimetable(), [], undefined, []),
    ).toBe(true);
  });

  it("schedules linked GTFS occurrences and never flattens preview times", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T08:00:00.000Z"));
    mocks.resolve.mockResolvedValue([
      {
        timetableId: "linked-42",
        departureDate: new Date("2026-07-12T10:00:00.000Z"),
        departureTime: "10:00",
        serviceDate: "2026-07-12",
        timezone: "UTC",
        feedId: "feed-1",
        routeId: "route-42",
        stopId: "downtown",
        tripId: "trip-42",
        serviceId: "daily",
        headsign: "Marina",
        frequencyBased: false,
      },
    ]);

    await expect(reschedule([linkedTimetable()], [])).resolves.toBe(1);

    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.schedule).toHaveBeenCalledOnce();
    const request = mocks.schedule.mock.calls[0]![0];
    expect(request.content.body).toBe("Departure at 10:00");
    expect(request.content.data).toMatchObject({
      timetableId: "linked-42",
      gtfsFeedId: "feed-1",
      gtfsTripId: "trip-42",
      gtfsServiceDate: "2026-07-12",
    });
    expect(request.trigger.date.toISOString()).toBe("2026-07-12T09:55:00.000Z");
  });

  it("keeps rebuilding other alarms when a linked feed cannot resolve", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T08:00:00.000Z"));
    mocks.resolve.mockRejectedValue(new Error("feed removed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const manual: Timetable = {
      ...linkedTimetable(),
      id: "manual",
      name: "Manual alarm",
      source: "manual",
      gtfsSource: undefined,
      times: ["09:00"],
    };

    await expect(
      reschedule([linkedTimetable(), manual], []),
    ).resolves.toBeGreaterThan(0);
    expect(mocks.schedule).toHaveBeenCalled();
    expect(
      mocks.schedule.mock.calls.every(
        ([request]) => request.content.data.timetableId === "manual",
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});
