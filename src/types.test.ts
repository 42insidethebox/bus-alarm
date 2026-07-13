import { describe, expect, it } from "vitest";

import { Timetable, withoutTimetablePlace } from "./types";

const timetable: Timetable = {
  id: "bus",
  name: "Bus",
  description: "",
  source: "manual",
  times: ["08:00"],
  days: [1],
  alertMinutes: 5,
  alertMinutesList: [5],
  excludedDates: [],
  pausedUntil: null,
  enabled: true,
  locationIds: ["home", "work"],
  locationId: "home",
};

describe("timetable place removal", () => {
  it("keeps a restricted timetable enabled while another place remains", () =>
    expect(withoutTimetablePlace(timetable, "home")).toMatchObject({
      enabled: true,
      locationIds: ["work"],
      locationId: "work",
    }));

  it("disables instead of silently changing the final restriction to Anywhere", () =>
    expect(
      withoutTimetablePlace(
        { ...timetable, locationIds: ["home"], locationId: "home" },
        "home",
      ),
    ).toMatchObject({ enabled: false, locationIds: [], locationId: null }));

  it("does not disable a timetable that was already Anywhere", () =>
    expect(
      withoutTimetablePlace(
        { ...timetable, locationIds: [], locationId: null },
        "home",
      ).enabled,
    ).toBe(true));
});
