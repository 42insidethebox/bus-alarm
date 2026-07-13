import * as SQLite from "expo-sqlite";

import type { GtfsDataset, GtfsServiceTime } from "./types";

const DATABASE_NAME = "busbell.db";
const GTFS_SCHEMA_VERSION = 1;
const METERS_PER_LATITUDE_DEGREE = 111_320;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

export interface GtfsFeedImportMetadata {
  id: string;
  name: string;
  sourceUrl?: string | null;
  sourcePageUrl?: string | null;
  license?: string | null;
  attribution?: string | null;
  checksumSha256?: string | null;
  importedAt?: string;
}

export interface GtfsFeedRecord {
  id: string;
  name: string;
  sourceUrl: string | null;
  sourcePageUrl: string | null;
  license: string | null;
  attribution: string | null;
  checksumSha256: string | null;
  importedAt: string;
  publisherName: string | null;
  publisherUrl: string | null;
  language: string | null;
  startDate: string | null;
  endDate: string | null;
  version: string | null;
  bounds: [west: number, south: number, east: number, north: number] | null;
  counts: {
    agencies: number;
    stops: number;
    routes: number;
    trips: number;
    stopTimes: number;
  };
}

export interface NearbyStopQuery {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit?: number;
  feedIds?: string[];
}

export interface NearbyGtfsStop {
  feedId: string;
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  locationType: number;
  parentStationId: string | null;
  wheelchairBoarding: number | null;
  distanceMeters: number;
}

export interface GtfsStopRoute {
  feedId: string;
  stopId: string;
  routeId: string;
  agencyId: string | null;
  shortName: string | null;
  longName: string | null;
  description: string | null;
  routeType: number;
  color: string | null;
  textColor: string | null;
  directionId: 0 | 1 | null;
  headsign: string | null;
  serviceIds: string[];
  shapeIds: string[];
}

export interface StopDepartureQuery {
  feedId: string;
  stopId: string;
  /** Service date as YYYY-MM-DD or the GTFS-native YYYYMMDD form. */
  serviceDate: string;
  /** Seconds from the start of the service day. Values over 86400 are valid. */
  startSeconds?: number;
  /** Exclusive upper bound, in service-day seconds. Defaults to 48 hours. */
  endSeconds?: number;
  routeId?: string;
  directionId?: 0 | 1;
  limit?: number;
}

export interface GtfsStopDeparture {
  feedId: string;
  stopId: string;
  routeId: string;
  routeShortName: string | null;
  routeLongName: string | null;
  routeType: number;
  routeColor: string | null;
  routeTextColor: string | null;
  tripId: string;
  serviceId: string;
  directionId: 0 | 1 | null;
  headsign: string | null;
  stopHeadsign: string | null;
  stopSequence: number;
  departure: GtfsServiceTime;
  frequencyBased: boolean;
  /** False means GTFS only promises headway-based, not clock-exact, service. */
  exact: boolean;
  headwaySeconds: number | null;
}

export interface GtfsShapeCoordinate {
  latitude: number;
  longitude: number;
  sequence: number;
  distanceTraveled: number | null;
}

type FeedRow = {
  feed_id: string;
  name: string;
  source_url: string | null;
  source_page_url: string | null;
  license: string | null;
  attribution: string | null;
  checksum_sha256: string | null;
  imported_at: string;
  publisher_name: string | null;
  publisher_url: string | null;
  language: string | null;
  start_date: string | null;
  end_date: string | null;
  version: string | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  agency_count: number;
  stop_count: number;
  route_count: number;
  trip_count: number;
  stop_time_count: number;
};

type StopRow = {
  feed_id: string;
  stop_id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  location_type: number;
  parent_station_id: string | null;
  wheelchair_boarding: number | null;
};

type StopRouteRow = {
  feed_id: string;
  stop_id: string;
  route_id: string;
  agency_id: string | null;
  short_name: string | null;
  long_name: string | null;
  description: string | null;
  route_type: number;
  color: string | null;
  text_color: string | null;
  direction_id: 0 | 1 | null;
  headsign: string | null;
  service_ids: string;
  shape_ids: string | null;
};

type DepartureRow = {
  feed_id: string;
  stop_id: string;
  route_id: string;
  route_short_name: string | null;
  route_long_name: string | null;
  route_type: number;
  route_color: string | null;
  route_text_color: string | null;
  trip_id: string;
  service_id: string;
  direction_id: 0 | 1 | null;
  trip_headsign: string | null;
  stop_headsign: string | null;
  stop_sequence: number;
  departure_raw: string | null;
  departure_seconds: number | null;
  first_departure_seconds: number | null;
  frequency_start_raw: string | null;
  frequency_start_seconds: number | null;
  frequency_end_seconds: number | null;
  headway_seconds: number | null;
  exact_times: 0 | 1 | null;
};

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS gtfs_schema_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gtfs_feeds (
    feed_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    source_url TEXT,
    source_page_url TEXT,
    license TEXT,
    attribution TEXT,
    checksum_sha256 TEXT,
    imported_at TEXT NOT NULL,
    publisher_name TEXT,
    publisher_url TEXT,
    language TEXT,
    default_language TEXT,
    start_date TEXT,
    end_date TEXT,
    version TEXT,
    contact_email TEXT,
    contact_url TEXT,
    west REAL,
    south REAL,
    east REAL,
    north REAL
  );

  CREATE TABLE IF NOT EXISTS gtfs_agencies (
    feed_id TEXT NOT NULL,
    agency_key TEXT NOT NULL,
    agency_id TEXT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    timezone TEXT NOT NULL,
    lang TEXT,
    phone TEXT,
    PRIMARY KEY (feed_id, agency_key)
  );

  CREATE TABLE IF NOT EXISTS gtfs_stops (
    feed_id TEXT NOT NULL,
    stop_id TEXT NOT NULL,
    code TEXT,
    name TEXT,
    description TEXT,
    latitude REAL,
    longitude REAL,
    location_type INTEGER NOT NULL,
    parent_station_id TEXT,
    timezone TEXT,
    wheelchair_boarding INTEGER,
    PRIMARY KEY (feed_id, stop_id)
  );

  CREATE TABLE IF NOT EXISTS gtfs_routes (
    feed_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    agency_id TEXT,
    short_name TEXT,
    long_name TEXT,
    description TEXT,
    route_type INTEGER NOT NULL,
    url TEXT,
    color TEXT,
    text_color TEXT,
    PRIMARY KEY (feed_id, route_id)
  );

  CREATE TABLE IF NOT EXISTS gtfs_trips (
    feed_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    headsign TEXT,
    short_name TEXT,
    direction_id INTEGER,
    block_id TEXT,
    shape_id TEXT,
    wheelchair_accessible INTEGER,
    bikes_allowed INTEGER,
    PRIMARY KEY (feed_id, trip_id)
  );

  CREATE TABLE IF NOT EXISTS gtfs_stop_times (
    feed_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    stop_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    arrival_raw TEXT,
    arrival_seconds INTEGER,
    departure_raw TEXT,
    departure_seconds INTEGER,
    stop_headsign TEXT,
    pickup_type INTEGER,
    drop_off_type INTEGER,
    shape_distance_traveled REAL,
    timepoint INTEGER,
    PRIMARY KEY (feed_id, trip_id, stop_sequence)
  );

  CREATE TABLE IF NOT EXISTS gtfs_calendars (
    feed_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    monday INTEGER NOT NULL,
    tuesday INTEGER NOT NULL,
    wednesday INTEGER NOT NULL,
    thursday INTEGER NOT NULL,
    friday INTEGER NOT NULL,
    saturday INTEGER NOT NULL,
    sunday INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    PRIMARY KEY (feed_id, service_id)
  );

  CREATE TABLE IF NOT EXISTS gtfs_calendar_dates (
    feed_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    date TEXT NOT NULL,
    exception_type INTEGER NOT NULL,
    PRIMARY KEY (feed_id, service_id, date)
  );

  CREATE TABLE IF NOT EXISTS gtfs_frequencies (
    feed_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    start_raw TEXT NOT NULL,
    start_seconds INTEGER NOT NULL,
    end_raw TEXT NOT NULL,
    end_seconds INTEGER NOT NULL,
    headway_seconds INTEGER NOT NULL,
    exact_times INTEGER,
    PRIMARY KEY (feed_id, trip_id, start_seconds)
  );

  CREATE TABLE IF NOT EXISTS gtfs_shapes (
    feed_id TEXT NOT NULL,
    shape_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    sequence INTEGER NOT NULL,
    distance_traveled REAL,
    PRIMARY KEY (feed_id, shape_id, sequence)
  );

  CREATE INDEX IF NOT EXISTS gtfs_stops_location
    ON gtfs_stops(feed_id, latitude, longitude);
  CREATE INDEX IF NOT EXISTS gtfs_stop_times_stop
    ON gtfs_stop_times(feed_id, stop_id, departure_seconds);
  CREATE INDEX IF NOT EXISTS gtfs_trips_route
    ON gtfs_trips(feed_id, route_id, service_id);
  CREATE INDEX IF NOT EXISTS gtfs_trips_service
    ON gtfs_trips(feed_id, service_id);
  CREATE INDEX IF NOT EXISTS gtfs_calendar_service
    ON gtfs_calendars(feed_id, service_id);
  CREATE INDEX IF NOT EXISTS gtfs_calendar_dates_date
    ON gtfs_calendar_dates(feed_id, date, exception_type);
  CREATE INDEX IF NOT EXISTS gtfs_shapes_shape
    ON gtfs_shapes(feed_id, shape_id, sequence);
`;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return databasePromise;
}

export async function migrateGtfsDatabase(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const db = await getDatabase();
      await db.execAsync(`PRAGMA journal_mode=WAL; ${SCHEMA_SQL}`);
      await db.runAsync(
        "INSERT OR REPLACE INTO gtfs_schema_meta (key, value) VALUES ('schema_version', ?)",
        String(GTFS_SCHEMA_VERSION),
      );
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  await migrationPromise;
}

async function readyDatabase(): Promise<SQLite.SQLiteDatabase> {
  await migrateGtfsDatabase();
  return getDatabase();
}

function assertFeedMetadata(metadata: GtfsFeedImportMetadata): void {
  if (!metadata.id.trim()) throw new Error("GTFS feed id cannot be empty");
  if (!metadata.name.trim()) throw new Error("GTFS feed name cannot be empty");
  if (metadata.id.length > 256) throw new Error("GTFS feed id is too long");
}

function datasetBounds(dataset: GtfsDataset) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const stop of dataset.stops) {
    if (stop.latitude === null || stop.longitude === null) continue;
    west = Math.min(west, stop.longitude);
    south = Math.min(south, stop.latitude);
    east = Math.max(east, stop.longitude);
    north = Math.max(north, stop.latitude);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

async function executeRows(
  db: SQLite.SQLiteDatabase,
  sql: string,
  rows: Array<Array<string | number | null>>,
): Promise<void> {
  if (!rows.length) return;
  const statement = await db.prepareAsync(sql);
  try {
    for (const row of rows) await statement.executeAsync(row);
  } finally {
    await statement.finalizeAsync();
  }
}

async function deleteNamespace(
  db: SQLite.SQLiteDatabase,
  feedId: string,
): Promise<void> {
  for (const table of [
    "gtfs_shapes",
    "gtfs_frequencies",
    "gtfs_calendar_dates",
    "gtfs_calendars",
    "gtfs_stop_times",
    "gtfs_trips",
    "gtfs_routes",
    "gtfs_stops",
    "gtfs_agencies",
    "gtfs_feeds",
  ]) {
    await db.runAsync(`DELETE FROM ${table} WHERE feed_id = ?`, feedId);
  }
}

async function insertDataset(
  db: SQLite.SQLiteDatabase,
  feedId: string,
  metadata: GtfsFeedImportMetadata,
  dataset: GtfsDataset,
): Promise<void> {
  const feedInfo = dataset.feedInfo;
  const bounds = datasetBounds(dataset);
  const serviceDates = [
    ...dataset.calendars.flatMap((calendar) => [
      calendar.startDate,
      calendar.endDate,
    ]),
    ...dataset.calendarDates.map((exception) => exception.date),
  ].sort();
  const serviceStartDate = feedInfo?.startDate ?? serviceDates[0] ?? null;
  const serviceEndDate =
    feedInfo?.endDate ?? serviceDates.at(-1) ?? serviceStartDate;
  await db.runAsync(
    `INSERT INTO gtfs_feeds (
      feed_id, name, source_url, source_page_url, license, attribution,
      checksum_sha256, imported_at, publisher_name, publisher_url, language,
      default_language, start_date, end_date, version, contact_email,
      contact_url, west, south, east, north
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    feedId,
    metadata.name.trim(),
    metadata.sourceUrl ?? null,
    metadata.sourcePageUrl ?? null,
    metadata.license ?? null,
    metadata.attribution ?? null,
    metadata.checksumSha256 ?? null,
    metadata.importedAt ?? new Date().toISOString(),
    feedInfo?.publisherName ?? null,
    feedInfo?.publisherUrl ?? null,
    feedInfo?.language ?? null,
    feedInfo?.defaultLanguage ?? null,
    serviceStartDate,
    serviceEndDate,
    feedInfo?.version ?? null,
    feedInfo?.contactEmail ?? null,
    feedInfo?.contactUrl ?? null,
    bounds?.west ?? null,
    bounds?.south ?? null,
    bounds?.east ?? null,
    bounds?.north ?? null,
  );

  await executeRows(
    db,
    `INSERT INTO gtfs_agencies
      (feed_id, agency_key, agency_id, name, url, timezone, lang, phone)
      VALUES (?,?,?,?,?,?,?,?)`,
    dataset.agencies.map((agency, index) => [
      feedId,
      agency.id ?? `__default_${index}`,
      agency.id,
      agency.name,
      agency.url,
      agency.timezone,
      agency.lang,
      agency.phone,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_stops
      (feed_id, stop_id, code, name, description, latitude, longitude,
       location_type, parent_station_id, timezone, wheelchair_boarding)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    dataset.stops.map((stop) => [
      feedId,
      stop.id,
      stop.code,
      stop.name,
      stop.description,
      stop.latitude,
      stop.longitude,
      stop.locationType,
      stop.parentStationId,
      stop.timezone,
      stop.wheelchairBoarding,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_routes
      (feed_id, route_id, agency_id, short_name, long_name, description,
       route_type, url, color, text_color)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    dataset.routes.map((route) => [
      feedId,
      route.id,
      route.agencyId,
      route.shortName,
      route.longName,
      route.description,
      route.type,
      route.url,
      route.color,
      route.textColor,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_trips
      (feed_id, trip_id, route_id, service_id, headsign, short_name,
       direction_id, block_id, shape_id, wheelchair_accessible, bikes_allowed)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    dataset.trips.map((trip) => [
      feedId,
      trip.id,
      trip.routeId,
      trip.serviceId,
      trip.headsign,
      trip.shortName,
      trip.directionId,
      trip.blockId,
      trip.shapeId,
      trip.wheelchairAccessible,
      trip.bikesAllowed,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_stop_times
      (feed_id, trip_id, stop_id, stop_sequence, arrival_raw,
       arrival_seconds, departure_raw, departure_seconds, stop_headsign,
       pickup_type, drop_off_type, shape_distance_traveled, timepoint)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    dataset.stopTimes.map((stopTime) => [
      feedId,
      stopTime.tripId,
      stopTime.stopId,
      stopTime.stopSequence,
      stopTime.arrivalTime?.raw ?? null,
      stopTime.arrivalTime?.totalSeconds ?? null,
      stopTime.departureTime?.raw ?? null,
      stopTime.departureTime?.totalSeconds ?? null,
      stopTime.stopHeadsign,
      stopTime.pickupType,
      stopTime.dropOffType,
      stopTime.shapeDistanceTraveled,
      stopTime.timepoint,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_calendars
      (feed_id, service_id, monday, tuesday, wednesday, thursday, friday,
       saturday, sunday, start_date, end_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    dataset.calendars.map((calendar) => [
      feedId,
      calendar.serviceId,
      ...calendar.weekdays.map((value) => (value ? 1 : 0)),
      calendar.startDate,
      calendar.endDate,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_calendar_dates
      (feed_id, service_id, date, exception_type) VALUES (?,?,?,?)`,
    dataset.calendarDates.map((exception) => [
      feedId,
      exception.serviceId,
      exception.date,
      exception.exceptionType,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_frequencies
      (feed_id, trip_id, start_raw, start_seconds, end_raw, end_seconds,
       headway_seconds, exact_times) VALUES (?,?,?,?,?,?,?,?)`,
    dataset.frequencies.map((frequency) => [
      feedId,
      frequency.tripId,
      frequency.startTime.raw,
      frequency.startTime.totalSeconds,
      frequency.endTime.raw,
      frequency.endTime.totalSeconds,
      frequency.headwaySeconds,
      frequency.exactTimes,
    ]),
  );
  await executeRows(
    db,
    `INSERT INTO gtfs_shapes
      (feed_id, shape_id, latitude, longitude, sequence, distance_traveled)
      VALUES (?,?,?,?,?,?)`,
    dataset.shapes.map((point) => [
      feedId,
      point.shapeId,
      point.latitude,
      point.longitude,
      point.sequence,
      point.distanceTraveled,
    ]),
  );
}

async function validateStagedDataset(
  db: SQLite.SQLiteDatabase,
  feedId: string,
  dataset: GtfsDataset,
): Promise<void> {
  const counts: Array<[string, number]> = [
    ["gtfs_stops", dataset.stops.length],
    ["gtfs_routes", dataset.routes.length],
    ["gtfs_trips", dataset.trips.length],
    ["gtfs_stop_times", dataset.stopTimes.length],
  ];
  for (const [table, expected] of counts) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE feed_id = ?`,
      feedId,
    );
    if (row?.count !== expected) {
      throw new Error(`Staged GTFS validation failed for ${table}`);
    }
  }

  const orphanTrip = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM gtfs_trips t
       LEFT JOIN gtfs_routes r
         ON r.feed_id=t.feed_id AND r.route_id=t.route_id
      WHERE t.feed_id=? AND r.route_id IS NULL`,
    feedId,
  );
  const orphanStopTime = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM gtfs_stop_times st
       LEFT JOIN gtfs_trips t
         ON t.feed_id=st.feed_id AND t.trip_id=st.trip_id
       LEFT JOIN gtfs_stops s
         ON s.feed_id=st.feed_id AND s.stop_id=st.stop_id
      WHERE st.feed_id=? AND (t.trip_id IS NULL OR s.stop_id IS NULL)`,
    feedId,
  );
  if ((orphanTrip?.count ?? 0) > 0 || (orphanStopTime?.count ?? 0) > 0) {
    throw new Error(
      "Staged GTFS data contains orphaned route, trip, or stop references",
    );
  }
}

/**
 * Imports into a temporary feed namespace and swaps it into place atomically.
 * A failed parse, insert, validation, or swap leaves the previous feed intact.
 */
export async function importGtfsFeed(
  metadata: GtfsFeedImportMetadata,
  dataset: GtfsDataset,
): Promise<GtfsFeedRecord> {
  assertFeedMetadata(metadata);
  const db = await readyDatabase();
  const stageId = `__busbell_stage__${metadata.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await db.withTransactionAsync(async () => {
    await insertDataset(db, stageId, metadata, dataset);
    await validateStagedDataset(db, stageId, dataset);
    await deleteNamespace(db, metadata.id);

    for (const table of [
      "gtfs_agencies",
      "gtfs_stops",
      "gtfs_routes",
      "gtfs_trips",
      "gtfs_stop_times",
      "gtfs_calendars",
      "gtfs_calendar_dates",
      "gtfs_frequencies",
      "gtfs_shapes",
      "gtfs_feeds",
    ]) {
      await db.runAsync(
        `UPDATE ${table} SET feed_id = ? WHERE feed_id = ?`,
        metadata.id,
        stageId,
      );
    }
  });

  const imported = await getGtfsFeed(metadata.id);
  if (!imported)
    throw new Error("GTFS feed import committed but could not be read back");
  return imported;
}

export async function deleteGtfsFeed(feedId: string): Promise<void> {
  const db = await readyDatabase();
  await db.withTransactionAsync(() => deleteNamespace(db, feedId));
}

const FEED_SELECT = `
  SELECT f.*,
    (SELECT COUNT(*) FROM gtfs_agencies a WHERE a.feed_id=f.feed_id) AS agency_count,
    (SELECT COUNT(*) FROM gtfs_stops s WHERE s.feed_id=f.feed_id) AS stop_count,
    (SELECT COUNT(*) FROM gtfs_routes r WHERE r.feed_id=f.feed_id) AS route_count,
    (SELECT COUNT(*) FROM gtfs_trips t WHERE t.feed_id=f.feed_id) AS trip_count,
    (SELECT COUNT(*) FROM gtfs_stop_times st WHERE st.feed_id=f.feed_id) AS stop_time_count
  FROM gtfs_feeds f`;

function mapFeedRow(row: FeedRow): GtfsFeedRecord {
  const hasBounds =
    row.west !== null &&
    row.south !== null &&
    row.east !== null &&
    row.north !== null;
  return {
    id: row.feed_id,
    name: row.name,
    sourceUrl: row.source_url,
    sourcePageUrl: row.source_page_url,
    license: row.license,
    attribution: row.attribution,
    checksumSha256: row.checksum_sha256,
    importedAt: row.imported_at,
    publisherName: row.publisher_name,
    publisherUrl: row.publisher_url,
    language: row.language,
    startDate: row.start_date,
    endDate: row.end_date,
    version: row.version,
    bounds: hasBounds ? [row.west!, row.south!, row.east!, row.north!] : null,
    counts: {
      agencies: row.agency_count,
      stops: row.stop_count,
      routes: row.route_count,
      trips: row.trip_count,
      stopTimes: row.stop_time_count,
    },
  };
}

export async function listGtfsFeeds(): Promise<GtfsFeedRecord[]> {
  const db = await readyDatabase();
  const rows = await db.getAllAsync<FeedRow>(
    `${FEED_SELECT} ORDER BY f.name, f.feed_id`,
  );
  return rows.map(mapFeedRow);
}

export async function getGtfsFeed(
  feedId: string,
): Promise<GtfsFeedRecord | null> {
  const db = await readyDatabase();
  const row = await db.getFirstAsync<FeedRow>(
    `${FEED_SELECT} WHERE f.feed_id=?`,
    feedId,
  );
  return row ? mapFeedRow(row) : null;
}

/**
 * Return the timezone that owns a route's service-day clock. GTFS requires an
 * agency timezone; agency_id may be omitted when a feed contains one agency,
 * so the second query is the standards-compliant fallback for that case.
 */
export async function getGtfsRouteTimeZone(
  feedId: string,
  routeId: string,
): Promise<string | null> {
  const db = await readyDatabase();
  const row = await db.getFirstAsync<{ timezone: string | null }>(
    `SELECT COALESCE(
       (SELECT a.timezone
          FROM gtfs_routes r
          JOIN gtfs_agencies a
            ON a.feed_id=r.feed_id AND a.agency_id=r.agency_id
         WHERE r.feed_id=? AND r.route_id=?
         LIMIT 1),
       (SELECT a.timezone
          FROM gtfs_agencies a
         WHERE a.feed_id=?
         ORDER BY CASE WHEN a.agency_id IS NULL THEN 0 ELSE 1 END, a.agency_key
         LIMIT 1)
     ) AS timezone`,
    feedId,
    routeId,
    feedId,
  );
  return row?.timezone ?? null;
}

export function haversineDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const unboundedA =
    sinLatitude * sinLatitude +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      sinLongitude *
      sinLongitude;
  const a = Math.max(0, Math.min(1, unboundedA));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function assertCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
}

export async function findNearbyGtfsStops(
  query: NearbyStopQuery,
): Promise<NearbyGtfsStop[]> {
  assertCoordinates(query.latitude, query.longitude);
  if (
    !Number.isFinite(query.radiusMeters) ||
    query.radiusMeters <= 0 ||
    query.radiusMeters > 200_000
  ) {
    throw new Error("Nearby stop radius must be between 0 and 200000 metres");
  }
  const limit = Math.max(1, Math.min(500, Math.trunc(query.limit ?? 50)));
  const feedIds = [...new Set(query.feedIds?.filter(Boolean) ?? [])];
  if (query.feedIds && !feedIds.length) return [];

  const latitudeDelta = query.radiusMeters / METERS_PER_LATITUDE_DEGREE;
  const longitudeScale = Math.cos((query.latitude * Math.PI) / 180);
  const longitudeDelta =
    Math.abs(longitudeScale) < 1e-8
      ? 180
      : Math.min(
          180,
          query.radiusMeters /
            (METERS_PER_LATITUDE_DEGREE * Math.abs(longitudeScale)),
        );
  const south = Math.max(-90, query.latitude - latitudeDelta);
  const north = Math.min(90, query.latitude + latitudeDelta);
  const rawWest = query.longitude - longitudeDelta;
  const rawEast = query.longitude + longitudeDelta;
  const crossesAntimeridian = rawWest < -180 || rawEast > 180;
  const west = rawWest < -180 ? rawWest + 360 : rawWest;
  const east = rawEast > 180 ? rawEast - 360 : rawEast;

  const clauses = [
    "latitude BETWEEN ? AND ?",
    "latitude IS NOT NULL",
    "longitude IS NOT NULL",
  ];
  const params: Array<string | number> = [south, north];
  if (longitudeDelta < 180) {
    clauses.push(
      crossesAntimeridian
        ? "(longitude >= ? OR longitude <= ?)"
        : "longitude BETWEEN ? AND ?",
    );
    params.push(west, east);
  }
  if (feedIds.length) {
    clauses.push(`feed_id IN (${feedIds.map(() => "?").join(",")})`);
    params.push(...feedIds);
  }

  const db = await readyDatabase();
  const rows = await db.getAllAsync<StopRow>(
    `SELECT feed_id, stop_id, code, name, description, latitude, longitude,
            location_type, parent_station_id, wheelchair_boarding
       FROM gtfs_stops
      WHERE ${clauses.join(" AND ")}`,
    ...params,
  );
  return rows
    .map((row) => ({
      feedId: row.feed_id,
      id: row.stop_id,
      code: row.code,
      name: row.name,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      locationType: row.location_type,
      parentStationId: row.parent_station_id,
      wheelchairBoarding: row.wheelchair_boarding,
      distanceMeters: haversineDistanceMeters(
        query.latitude,
        query.longitude,
        row.latitude,
        row.longitude,
      ),
    }))
    .filter((stop) => stop.distanceMeters <= query.radiusMeters)
    .sort(
      (a, b) =>
        a.distanceMeters - b.distanceMeters ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    )
    .slice(0, limit);
}

export async function getRoutesServingStop(
  feedId: string,
  stopId: string,
): Promise<GtfsStopRoute[]> {
  const db = await readyDatabase();
  const rows = await db.getAllAsync<StopRouteRow>(
    `SELECT r.feed_id, st.stop_id, r.route_id, r.agency_id, r.short_name,
            r.long_name, r.description, r.route_type, r.color, r.text_color,
            t.direction_id, t.headsign, GROUP_CONCAT(DISTINCT t.service_id) AS service_ids,
            GROUP_CONCAT(DISTINCT t.shape_id) AS shape_ids
       FROM gtfs_stop_times st
       JOIN gtfs_trips t ON t.feed_id=st.feed_id AND t.trip_id=st.trip_id
       JOIN gtfs_routes r ON r.feed_id=t.feed_id AND r.route_id=t.route_id
      WHERE st.feed_id=? AND st.stop_id=?
        AND COALESCE(st.pickup_type, 0) <> 1
      GROUP BY r.feed_id, st.stop_id, r.route_id, t.direction_id, t.headsign
      ORDER BY COALESCE(r.short_name, r.long_name, r.route_id), t.direction_id, t.headsign`,
    feedId,
    stopId,
  );
  return rows.map((row) => ({
    feedId: row.feed_id,
    stopId: row.stop_id,
    routeId: row.route_id,
    agencyId: row.agency_id,
    shortName: row.short_name,
    longName: row.long_name,
    description: row.description,
    routeType: row.route_type,
    color: row.color,
    textColor: row.text_color,
    directionId: row.direction_id,
    headsign: row.headsign,
    serviceIds: row.service_ids ? row.service_ids.split(",") : [],
    shapeIds: row.shape_ids ? row.shape_ids.split(",") : [],
  }));
}

function normalizeServiceDate(value: string): {
  compact: string;
  weekdayColumn: string;
} {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!match) throw new Error("Service date must use YYYY-MM-DD or YYYYMMDD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Service date is invalid");
  }
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return {
    compact: `${match[1]}${match[2]}${match[3]}`,
    weekdayColumn: weekdays[date.getUTCDay()],
  };
}

export async function getActiveGtfsServiceIds(
  feedId: string,
  serviceDate: string,
): Promise<string[]> {
  const { compact, weekdayColumn } = normalizeServiceDate(serviceDate);
  const db = await readyDatabase();
  const base = await db.getAllAsync<{ service_id: string }>(
    `SELECT service_id FROM gtfs_calendars
      WHERE feed_id=? AND start_date<=? AND end_date>=? AND ${weekdayColumn}=1`,
    feedId,
    compact,
    compact,
  );
  const exceptions = await db.getAllAsync<{
    service_id: string;
    exception_type: 1 | 2;
  }>(
    `SELECT service_id, exception_type FROM gtfs_calendar_dates WHERE feed_id=? AND date=?`,
    feedId,
    compact,
  );
  const result = new Set(base.map((row) => row.service_id));
  for (const exception of exceptions) {
    if (exception.exception_type === 1) result.add(exception.service_id);
    else result.delete(exception.service_id);
  }
  return [...result].sort();
}

function serviceTimeFromSeconds(
  totalSeconds: number,
  raw?: string | null,
): GtfsServiceTime {
  const serviceDayOffset = Math.floor(totalSeconds / 86_400);
  const secondsSinceMidnight = ((totalSeconds % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return {
    raw:
      raw ??
      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    totalSeconds,
    secondsSinceMidnight,
    serviceDayOffset,
  };
}

export async function getGtfsStopDepartures(
  query: StopDepartureQuery,
): Promise<GtfsStopDeparture[]> {
  const serviceIds = await getActiveGtfsServiceIds(
    query.feedId,
    query.serviceDate,
  );
  if (!serviceIds.length) return [];
  const { compact, weekdayColumn } = normalizeServiceDate(query.serviceDate);
  const startSeconds = Math.max(0, Math.trunc(query.startSeconds ?? 0));
  const endSeconds = Math.max(
    startSeconds + 1,
    Math.trunc(query.endSeconds ?? 172_800),
  );
  const limit = Math.max(1, Math.min(1000, Math.trunc(query.limit ?? 100)));
  const clauses = [
    "st.feed_id=?",
    "st.stop_id=?",
    `t.service_id IN (
      SELECT service_id FROM gtfs_calendars
       WHERE feed_id=? AND start_date<=? AND end_date>=? AND ${weekdayColumn}=1
      UNION
      SELECT service_id FROM gtfs_calendar_dates
       WHERE feed_id=? AND date=? AND exception_type=1
      EXCEPT
      SELECT service_id FROM gtfs_calendar_dates
       WHERE feed_id=? AND date=? AND exception_type=2
    )`,
  ];
  const params: Array<string | number> = [
    query.feedId,
    query.stopId,
    query.feedId,
    compact,
    compact,
    query.feedId,
    compact,
    query.feedId,
    compact,
  ];
  if (query.routeId) {
    clauses.push("t.route_id=?");
    params.push(query.routeId);
  }
  if (query.directionId !== undefined) {
    clauses.push("t.direction_id=?");
    params.push(query.directionId);
  }

  const db = await readyDatabase();
  const rows = await db.getAllAsync<DepartureRow>(
    `SELECT st.feed_id, st.stop_id, t.route_id,
            r.short_name AS route_short_name, r.long_name AS route_long_name,
            r.route_type, r.color AS route_color, r.text_color AS route_text_color,
            t.trip_id, t.service_id, t.direction_id, t.headsign AS trip_headsign,
            st.stop_headsign, st.stop_sequence, st.departure_raw,
            COALESCE(st.departure_seconds, st.arrival_seconds) AS departure_seconds,
            (SELECT COALESCE(first_st.departure_seconds, first_st.arrival_seconds)
               FROM gtfs_stop_times first_st
              WHERE first_st.feed_id=t.feed_id AND first_st.trip_id=t.trip_id
                AND COALESCE(first_st.departure_seconds, first_st.arrival_seconds) IS NOT NULL
              ORDER BY first_st.stop_sequence LIMIT 1) AS first_departure_seconds,
            f.start_raw AS frequency_start_raw, f.start_seconds AS frequency_start_seconds,
            f.end_seconds AS frequency_end_seconds, f.headway_seconds, f.exact_times
       FROM gtfs_stop_times st
       JOIN gtfs_trips t ON t.feed_id=st.feed_id AND t.trip_id=st.trip_id
       JOIN gtfs_routes r ON r.feed_id=t.feed_id AND r.route_id=t.route_id
       LEFT JOIN gtfs_frequencies f ON f.feed_id=t.feed_id AND f.trip_id=t.trip_id
      WHERE ${clauses.join(" AND ")}
        AND COALESCE(st.pickup_type, 0) <> 1
        AND COALESCE(st.departure_seconds, st.arrival_seconds) IS NOT NULL`,
    ...params,
  );

  const departures: GtfsStopDeparture[] = [];
  for (const row of rows) {
    const base = row.departure_seconds;
    if (base === null) continue;
    const common = {
      feedId: row.feed_id,
      stopId: row.stop_id,
      routeId: row.route_id,
      routeShortName: row.route_short_name,
      routeLongName: row.route_long_name,
      routeType: row.route_type,
      routeColor: row.route_color,
      routeTextColor: row.route_text_color,
      tripId: row.trip_id,
      serviceId: row.service_id,
      directionId: row.direction_id,
      headsign: row.trip_headsign,
      stopHeadsign: row.stop_headsign,
      stopSequence: row.stop_sequence,
    };
    if (
      row.frequency_start_seconds !== null &&
      row.frequency_end_seconds !== null &&
      row.headway_seconds !== null &&
      row.first_departure_seconds !== null
    ) {
      const stopOffset = base - row.first_departure_seconds;
      for (
        let tripStart = row.frequency_start_seconds;
        tripStart < row.frequency_end_seconds;
        tripStart += row.headway_seconds
      ) {
        const seconds = tripStart + stopOffset;
        if (seconds < startSeconds || seconds >= endSeconds) continue;
        departures.push({
          ...common,
          departure: serviceTimeFromSeconds(seconds),
          frequencyBased: true,
          exact: row.exact_times === 1,
          headwaySeconds: row.headway_seconds,
        });
      }
    } else if (base >= startSeconds && base < endSeconds) {
      departures.push({
        ...common,
        departure: serviceTimeFromSeconds(base, row.departure_raw),
        frequencyBased: false,
        exact: true,
        headwaySeconds: null,
      });
    }
  }
  return departures
    .sort(
      (a, b) =>
        a.departure.totalSeconds - b.departure.totalSeconds ||
        (a.routeShortName ?? a.routeLongName ?? a.routeId).localeCompare(
          b.routeShortName ?? b.routeLongName ?? b.routeId,
        ),
    )
    .slice(0, limit);
}

export async function getGtfsShape(
  feedId: string,
  shapeId: string,
): Promise<GtfsShapeCoordinate[]> {
  const db = await readyDatabase();
  const rows = await db.getAllAsync<{
    latitude: number;
    longitude: number;
    sequence: number;
    distance_traveled: number | null;
  }>(
    `SELECT latitude, longitude, sequence, distance_traveled
       FROM gtfs_shapes WHERE feed_id=? AND shape_id=? ORDER BY sequence`,
    feedId,
    shapeId,
  );
  return rows.map((row) => ({
    latitude: row.latitude,
    longitude: row.longitude,
    sequence: row.sequence,
    distanceTraveled: row.distance_traveled,
  }));
}
