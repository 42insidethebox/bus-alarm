import { describe, expect, it } from "vitest";
import { parseBackup } from "./backup";
const valid = {
  version: 1,
  exportedAt: "2026-07-12",
  places: [],
  timetables: [
    {
      id: "t1",
      name: "Bus",
      times: ["06:42"],
      days: [1, 2],
      alertMinutes: 5,
      enabled: true,
      locationId: null,
    },
  ],
};
describe("backup validation", () => {
  it("migrates a legacy single-place backup to locationIds", () => {
    const parsed = parseBackup(
      JSON.stringify({
        ...valid,
        places: [
          { id: "home", name: "Home", latitude: 1, longitude: 2, radius: 150 },
        ],
        timetables: [{ ...valid.timetables[0], locationId: "home" }],
      }),
    );
    expect(parsed.timetables[0]).toMatchObject({
      locationIds: ["home"],
      locationId: "home",
    });
  });
  it("accepts multiple known places", () => {
    const places = ["home", "work"].map((id) => ({
      id,
      name: id,
      latitude: 1,
      longitude: 2,
      radius: 150,
    }));
    expect(
      parseBackup(
        JSON.stringify({
          ...valid,
          places,
          timetables: [
            { ...valid.timetables[0], locationIds: ["home", "work"] },
          ],
        }),
      ).timetables[0].locationIds,
    ).toEqual(["home", "work"]);
  });
  it("rejects an unknown selected place", () =>
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...valid,
          timetables: [{ ...valid.timetables[0], locationIds: ["missing"] }],
        }),
      ),
    ).toThrow());
  it("accepts a linked GTFS timetable without flattened times", () =>
    expect(
      parseBackup(
        JSON.stringify({
          ...valid,
          timetables: [
            {
              ...valid.timetables[0],
              source: "gtfs",
              times: [],
              days: [],
              gtfsSource: {
                feedId: "feed",
                feedName: "Transit",
                feedVersion: "1",
                routeId: "42",
                routeLabel: "42",
                stopId: "central",
                stopName: "Central",
                serviceIds: ["weekday"],
                updatePolicy: "automatic",
              },
            },
          ],
        }),
      ).timetables[0].source,
    ).toBe("gtfs"));
  it("rejects malformed JSON", () =>
    expect(() => parseBackup("oops")).toThrow());
  it("rejects invalid departure times", () =>
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...valid,
          timetables: [{ ...valid.timetables[0], times: ["25:99"] }],
        }),
      ),
    ).toThrow());
});
