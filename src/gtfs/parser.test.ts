import { describe, expect, it } from "vitest";
import { parseGtfs, parseGtfsServiceTime, parseRfc4180 } from "./parser";
import { GtfsParseError } from "./types";

function validFeed(): Record<string, string> {
  return {
    "agency.txt":
      "agency_id,agency_name,agency_url,agency_timezone\nA,BusBell Transit,https://example.test,Europe/Zurich\n",
    "stops.txt":
      "stop_id,stop_name,stop_lat,stop_lon\nS1,Downtown,46.51,6.63\nS2,Lakeside,46.52,6.64\n",
    "routes.txt":
      "route_id,agency_id,route_short_name,route_long_name,route_type\nR,A,42,Downtown to Lakeside,3\n",
    "trips.txt":
      "route_id,service_id,trip_id,direction_id\nR,WK,T1,0\n",
    "stop_times.txt":
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,23:50:00,23:50:00,S1,1\nT1,24:30:00,24:30:00,S2,2\n",
    "calendar.txt":
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260101,20261231\n",
  };
}

describe("RFC 4180 parser", () => {
  it("supports quoted delimiters, escaped quotes, CRLF, and embedded newlines", () => {
    expect(parseRfc4180('a,b\r\n"x,y","say ""hi""\nnow"\r\n')).toEqual([
      { values: ["a", "b"], line: 1 },
      { values: ["x,y", 'say "hi"\nnow'], line: 2 },
    ]);
  });

  it.each(['a\n"unterminated', 'a\n"closed"junk']) (
    "rejects malformed CSV: %s",
    (input) => expect(() => parseRfc4180(input)).toThrow(GtfsParseError),
  );

  it("enforces field and record limits during parsing", () => {
    expect(() => parseRfc4180("abcd", { maxFieldLength: 3 })).toThrow(
      /exceeds 3 characters/,
    );
    expect(() => parseRfc4180("a\nb", { maxRecords: 1 })).toThrow(/record limit/);
  });
});

describe("GTFS service times", () => {
  it("preserves times after midnight as a service-day offset", () => {
    expect(parseGtfsServiceTime("25:15:30")).toEqual({
      raw: "25:15:30",
      totalSeconds: 90_930,
      secondsSinceMidnight: 4_530,
      serviceDayOffset: 1,
    });
  });

  it.each(["1:2:03", "23:60:00", "12:00 PM", "-1:00:00"])(
    "rejects malformed time %s",
    (time) => expect(() => parseGtfsServiceTime(time)).toThrow(GtfsParseError),
  );
});

describe("GTFS feed parser", () => {
  it("normalizes and links a valid feed", () => {
    const result = parseGtfs(validFeed());
    expect(result.dataset.routes[0]).toMatchObject({ id: "R", agencyId: "A", type: 3 });
    expect(result.dataset.calendars[0].weekdays).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(result.dataset.stopTimes[1].departureTime).toMatchObject({
      totalSeconds: 88_200,
      serviceDayOffset: 1,
    });
  });

  it("supports calendar_dates-only feeds", () => {
    const feed = validFeed();
    delete feed["calendar.txt"];
    feed["calendar_dates.txt"] = "service_id,date,exception_type\nWK,20260712,1\n";
    expect(parseGtfs(feed).dataset.calendarDates).toHaveLength(1);
  });

  it("parses optional frequencies, shapes, and feed metadata", () => {
    const feed = validFeed();
    feed["trips.txt"] =
      "route_id,service_id,trip_id,shape_id\nR,WK,T1,SH\n";
    feed["frequencies.txt"] =
      "trip_id,start_time,end_time,headway_secs,exact_times\nT1,06:00:00,10:00:00,900,1\n";
    feed["shapes.txt"] =
      "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nSH,46.5,6.6,1\nSH,46.6,6.7,2\n";
    feed["feed_info.txt"] =
      "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\nPublisher,https://data.example.test,en,20260101,20261231\n";
    const { dataset } = parseGtfs(feed);
    expect(dataset.frequencies[0].headwaySeconds).toBe(900);
    expect(dataset.shapes).toHaveLength(2);
    expect(dataset.feedInfo?.publisherName).toBe("Publisher");
  });

  it.each([
    [
      "missing table",
      (feed: Record<string, string>): void => {
        delete feed["stops.txt"];
      },
      "missing stops.txt",
    ],
    [
      "unknown trip route",
      (feed: Record<string, string>): void => {
        feed["trips.txt"] = "route_id,service_id,trip_id\nNOPE,WK,T1\n";
      },
      "unknown route",
    ],
    [
      "unknown stop",
      (feed: Record<string, string>): void => {
        feed["stop_times.txt"] =
          "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,06:00:00,06:00:00,NOPE,1\n";
      },
      "unknown stop",
    ],
    [
      "duplicate stop ID",
      (feed: Record<string, string>): void => {
        feed["stops.txt"] += "S1,Again,46.5,6.6\n";
      },
      "repeats stop_id",
    ],
    [
      "unsafe URL",
      (feed: Record<string, string>): void => {
        feed["agency.txt"] =
          "agency_id,agency_name,agency_url,agency_timezone\nA,X,javascript:alert(1),Europe/Zurich\n";
      },
      "safe HTTP",
    ],
    [
      "impossible date",
      (feed: Record<string, string>): void => {
        feed["calendar.txt"] =
          "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260230,20261231\n";
      },
      "impossible date",
    ],
  ] as const)("rejects %s", (_name, mutate, message) => {
    const feed = validFeed();
    mutate(feed);
    expect(() => parseGtfs(feed)).toThrow(message);
  });

  it("enforces byte and row limits before persistence", () => {
    expect(() => parseGtfs(validFeed(), { maxTextBytes: 20, maxFileBytes: 20 })).toThrow(
      /byte/,
    );
    expect(() =>
      parseGtfs(validFeed(), { maxRowsPerFile: 1, maxTotalRows: 20 }),
    ).toThrow(/record limit/);
  });

  it("warns about ignored files and missing optional stop coordinates", () => {
    const feed = validFeed();
    feed["README.md"] = "hello";
    feed["stops.txt"] = "stop_id,stop_name,stop_lat,stop_lon\nS1,Downtown,,\nS2,Lakeside,,\n";
    const codes = parseGtfs(feed).warnings.map((warning) => warning.code);
    expect(codes).toContain("ignored-file");
    expect(codes).toContain("missing-coordinate");
  });
});
