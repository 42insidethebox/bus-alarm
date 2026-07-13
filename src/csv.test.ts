import { describe, expect, it } from "vitest";
import { exportTimetablesCsv } from "./csv";
import { Timetable } from "./types";
const timetable: Timetable = {
  id: "t",
  name: "Bus, 47",
  description: 'Toward "town"',
  source: "photo",
  times: ["06:42"],
  days: [1, 2, 3, 4, 5],
  alertMinutes: 5,
  alertMinutesList: [10, 5],
  excludedDates: [],
  pausedUntil: null,
  enabled: true,
  locationIds: ["p"],
  locationId: "p",
};
describe("CSV export", () =>
  it("includes escaped timetable and place metadata", () =>
    expect(
      exportTimetablesCsv(
        [timetable],
        [
          {
            id: "p",
            name: "Home",
            latitude: 46.5,
            longitude: 6.6,
            radius: 150,
          },
        ],
      ),
    ).toContain(
      '"Bus, 47","Toward ""town""",06:42,1|2|3|4|5,10|5,Home,46.5,6.6,150,photo',
    )));

it("preserves linked GTFS metadata without fabricating departure rows", () => {
  const csv = exportTimetablesCsv(
    [
      {
        ...timetable,
        source: "gtfs",
        times: [],
        days: [],
        gtfsSource: {
          feedId: "feed",
          feedName: "Regional Transit",
          feedVersion: "2026-07",
          routeId: "r42",
          routeLabel: "42",
          stopId: "central",
          stopName: "Central",
          directionId: 1,
          headsign: "Marina",
          serviceIds: ["weekday"],
          updatePolicy: "automatic",
        },
      },
    ],
    [],
  );
  expect(csv).toContain(
    "gtfs,Regional Transit,42,Central,1,Marina,Linked schedule metadata only",
  );
});

it("exports all selected places in stable positional columns", () => {
  const csv = exportTimetablesCsv(
    [{ ...timetable, locationIds: ["p", "work"] }],
    [
      { id: "p", name: "Home", latitude: 46.5, longitude: 6.6, radius: 150 },
      {
        id: "work",
        name: "Work",
        latitude: 46.6,
        longitude: 6.7,
        radius: 200,
      },
    ],
  );
  expect(csv).toContain("Home|Work,46.5|46.6,6.6|6.7,150|200");
  expect(csv).toContain(",p|work");
});
