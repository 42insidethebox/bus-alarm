import * as SQLite from "expo-sqlite";
import {
  Place,
  Timetable,
  timetableLocationIds,
  withTimetableLocationIds,
} from "./types";

let db: SQLite.SQLiteDatabase;
export async function migrate() {
  db = await SQLite.openDatabaseAsync("busbell.db");
  await db.execAsync(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS timetables (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, times TEXT NOT NULL, days TEXT NOT NULL, alert_minutes INTEGER NOT NULL, enabled INTEGER NOT NULL, location_id TEXT);
    CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, radius REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
  const columns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(timetables)",
  );
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("alert_minutes_list"))
    await db.execAsync(
      "ALTER TABLE timetables ADD COLUMN alert_minutes_list TEXT NOT NULL DEFAULT '[]'",
    );
  if (!names.has("excluded_dates"))
    await db.execAsync(
      "ALTER TABLE timetables ADD COLUMN excluded_dates TEXT NOT NULL DEFAULT '[]'",
    );
  if (!names.has("paused_until"))
    await db.execAsync("ALTER TABLE timetables ADD COLUMN paused_until TEXT");
  if (!names.has("description"))
    await db.execAsync(
      "ALTER TABLE timetables ADD COLUMN description TEXT NOT NULL DEFAULT ''",
    );
  if (!names.has("source"))
    await db.execAsync(
      "ALTER TABLE timetables ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'",
    );
  if (!names.has("gtfs_source"))
    await db.execAsync("ALTER TABLE timetables ADD COLUMN gtfs_source TEXT");
  if (!names.has("location_ids")) {
    await db.execAsync(
      "ALTER TABLE timetables ADD COLUMN location_ids TEXT NOT NULL DEFAULT '[]'",
    );
  }
  // Also repairs an interrupted migration. Canonical Anywhere rows always have
  // a null compatibility column, so a non-null legacy id is safe to recover.
  const legacyRows = await db.getAllAsync<{
    id: string;
    location_id: string;
  }>(
    "SELECT id, location_id FROM timetables WHERE location_id IS NOT NULL AND (location_ids IS NULL OR location_ids='[]')",
  );
  for (const row of legacyRows)
    await db.runAsync(
      "UPDATE timetables SET location_ids=? WHERE id=?",
      JSON.stringify([row.location_id]),
      row.id,
    );
}
export async function getTimetables(): Promise<Timetable[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM timetables ORDER BY name",
  );
  return rows.map((r) =>
    withTimetableLocationIds({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      source: r.source ?? "manual",
      gtfsSource: r.gtfs_source ? JSON.parse(r.gtfs_source) : undefined,
      times: JSON.parse(r.times),
      days: JSON.parse(r.days),
      alertMinutes: r.alert_minutes,
      alertMinutesList: JSON.parse(r.alert_minutes_list || "[]").length
        ? JSON.parse(r.alert_minutes_list)
        : [r.alert_minutes],
      excludedDates: JSON.parse(r.excluded_dates || "[]"),
      pausedUntil: r.paused_until,
      enabled: !!r.enabled,
      locationIds: r.location_ids ? JSON.parse(r.location_ids) : undefined,
      locationId: r.location_id,
    }),
  );
}
export async function saveTimetable(t: Timetable) {
  const locationIds = timetableLocationIds(t);
  await db.runAsync(
    `INSERT OR REPLACE INTO timetables (id,name,description,source,gtfs_source,times,days,alert_minutes,enabled,location_id,location_ids,alert_minutes_list,excluded_dates,paused_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    t.id,
    t.name,
    t.description,
    t.source,
    t.gtfsSource ? JSON.stringify(t.gtfsSource) : null,
    JSON.stringify(t.times),
    JSON.stringify(t.days),
    t.alertMinutes,
    t.enabled ? 1 : 0,
    locationIds[0] ?? null,
    JSON.stringify(locationIds),
    JSON.stringify(t.alertMinutesList),
    JSON.stringify(t.excludedDates),
    t.pausedUntil,
  );
}
export async function saveTimetables(items: Timetable[]) {
  await db.withTransactionAsync(async () => {
    for (const item of items) await saveTimetable(item);
  });
}
export async function removeTimetable(id: string) {
  await db.runAsync("DELETE FROM timetables WHERE id=?", id);
}
export async function getPlaces(): Promise<Place[]> {
  return db.getAllAsync<Place>("SELECT * FROM places ORDER BY name");
}
export async function savePlace(p: Place) {
  await db.runAsync(
    "INSERT OR REPLACE INTO places VALUES (?,?,?,?,?)",
    p.id,
    p.name,
    p.latitude,
    p.longitude,
    p.radius,
  );
}
export async function removePlace(id: string) {
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{
      id: string;
      enabled: number;
      location_id: string | null;
      location_ids: string | null;
    }>("SELECT id, enabled, location_id, location_ids FROM timetables");
    for (const row of rows) {
      let storedIds: string[] | undefined;
      try {
        storedIds = row.location_ids ? JSON.parse(row.location_ids) : undefined;
      } catch {
        storedIds = undefined;
      }
      const currentIds = timetableLocationIds({
        locationIds: storedIds,
        locationId: row.location_id,
      });
      if (!currentIds.includes(id)) continue;
      const remainingIds = currentIds.filter((placeId) => placeId !== id);
      await db.runAsync(
        "UPDATE timetables SET location_id=?, location_ids=?, enabled=? WHERE id=?",
        remainingIds[0] ?? null,
        JSON.stringify(remainingIds),
        remainingIds.length ? row.enabled : 0,
        row.id,
      );
    }
    await db.runAsync("DELETE FROM places WHERE id=?", id);
  });
}
export async function getSetting(key: string) {
  return (
    await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key=?",
      key,
    )
  )?.value;
}
export async function setSetting(key: string, value: string) {
  await db.runAsync("INSERT OR REPLACE INTO settings VALUES (?,?)", key, value);
}

export async function replaceAll(timetables: Timetable[], places: Place[]) {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM timetables");
    await db.runAsync("DELETE FROM places");
    for (const p of places) await savePlace(p);
    for (const t of timetables) await saveTimetable(t);
  });
}
