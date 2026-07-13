export type GtfsTableName =
  | "agency"
  | "stops"
  | "routes"
  | "trips"
  | "stop_times"
  | "calendar"
  | "calendar_dates"
  | "frequencies"
  | "shapes"
  | "feed_info";

export type GtfsWarningCode =
  | "blank-row"
  | "empty-optional-table"
  | "ignored-file"
  | "missing-coordinate"
  | "noncanonical-file-name"
  | "trimmed-value"
  | "unused-entity";

export interface GtfsWarning {
  code: GtfsWarningCode;
  message: string;
  table?: GtfsTableName;
  row?: number;
}

export interface GtfsParserOptions {
  /** Maximum UTF-8 bytes across every supplied file. */
  maxTextBytes?: number;
  /** Maximum UTF-8 bytes in any one supplied file. */
  maxFileBytes?: number;
  /** Maximum data rows (excluding headers) in one table. */
  maxRowsPerFile?: number;
  /** Maximum data rows across recognized GTFS tables. */
  maxTotalRows?: number;
  /** Maximum columns in a CSV record. */
  maxColumns?: number;
  /** Maximum UTF-16 code units in a CSV field. */
  maxFieldLength?: number;
  /** Safety ceiling for a GTFS service time's hour component. */
  maxServiceHour?: number;
}

export interface ResolvedGtfsParserOptions {
  maxTextBytes: number;
  maxFileBytes: number;
  maxRowsPerFile: number;
  maxTotalRows: number;
  maxColumns: number;
  maxFieldLength: number;
  maxServiceHour: number;
}

export interface GtfsServiceTime {
  /** Original validated HH:MM:SS value. */
  raw: string;
  /** Seconds from the start of the service day, including values beyond 24h. */
  totalSeconds: number;
  /** Wall-clock seconds after applying the service-day offset. */
  secondsSinceMidnight: number;
  /** 0 for 00:00-23:59, 1 for 24:00-47:59, and so on. */
  serviceDayOffset: number;
}

export interface GtfsAgency {
  id: string | null;
  name: string;
  url: string;
  timezone: string;
  lang: string | null;
  phone: string | null;
}

export interface GtfsStop {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  locationType: 0 | 1 | 2 | 3 | 4;
  parentStationId: string | null;
  timezone: string | null;
  wheelchairBoarding: 0 | 1 | 2 | null;
}

export interface GtfsRoute {
  id: string;
  agencyId: string | null;
  shortName: string | null;
  longName: string | null;
  description: string | null;
  type: number;
  url: string | null;
  color: string | null;
  textColor: string | null;
}

export interface GtfsTrip {
  id: string;
  routeId: string;
  serviceId: string;
  headsign: string | null;
  shortName: string | null;
  directionId: 0 | 1 | null;
  blockId: string | null;
  shapeId: string | null;
  wheelchairAccessible: 0 | 1 | 2 | null;
  bikesAllowed: 0 | 1 | 2 | null;
}

export interface GtfsStopTime {
  tripId: string;
  arrivalTime: GtfsServiceTime | null;
  departureTime: GtfsServiceTime | null;
  stopId: string;
  stopSequence: number;
  stopHeadsign: string | null;
  pickupType: 0 | 1 | 2 | 3 | null;
  dropOffType: 0 | 1 | 2 | 3 | null;
  shapeDistanceTraveled: number | null;
  timepoint: 0 | 1 | null;
}

export interface GtfsCalendar {
  serviceId: string;
  weekdays: readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  startDate: string;
  endDate: string;
}

export interface GtfsCalendarDate {
  serviceId: string;
  date: string;
  exceptionType: 1 | 2;
}

export interface GtfsFrequency {
  tripId: string;
  startTime: GtfsServiceTime;
  endTime: GtfsServiceTime;
  headwaySeconds: number;
  exactTimes: 0 | 1 | null;
}

export interface GtfsShapePoint {
  shapeId: string;
  latitude: number;
  longitude: number;
  sequence: number;
  distanceTraveled: number | null;
}

export interface GtfsFeedInfo {
  publisherName: string;
  publisherUrl: string;
  language: string;
  defaultLanguage: string | null;
  startDate: string | null;
  endDate: string | null;
  version: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
}

/** Backwards-friendly name used by persistence and regional-pack code. */
export type GtfsFeedMetadata = GtfsFeedInfo;

export interface GtfsDataset {
  agencies: GtfsAgency[];
  stops: GtfsStop[];
  routes: GtfsRoute[];
  trips: GtfsTrip[];
  stopTimes: GtfsStopTime[];
  calendars: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  frequencies: GtfsFrequency[];
  shapes: GtfsShapePoint[];
  feedInfo: GtfsFeedInfo | null;
}

export interface GtfsParseResult {
  dataset: GtfsDataset;
  warnings: GtfsWarning[];
}

export type GtfsErrorCode =
  | "csv-malformed"
  | "duplicate-file"
  | "duplicate-header"
  | "duplicate-id"
  | "foreign-key"
  | "invalid-header"
  | "invalid-option"
  | "invalid-value"
  | "limit-exceeded"
  | "missing-file"
  | "missing-header"
  | "missing-value";

export class GtfsParseError extends Error {
  readonly code: GtfsErrorCode;
  readonly table?: GtfsTableName;
  readonly row?: number;
  readonly field?: string;

  constructor(
    code: GtfsErrorCode,
    message: string,
    context: { table?: GtfsTableName; row?: number; field?: string } = {},
  ) {
    super(message);
    this.name = "GtfsParseError";
    this.code = code;
    this.table = context.table;
    this.row = context.row;
    this.field = context.field;
  }
}
