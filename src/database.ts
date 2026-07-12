import * as SQLite from 'expo-sqlite';
import { Place, Timetable } from './types';

let db: SQLite.SQLiteDatabase;
export async function migrate() {
  db = await SQLite.openDatabaseAsync('busbell.db');
  await db.execAsync(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS timetables (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, times TEXT NOT NULL, days TEXT NOT NULL, alert_minutes INTEGER NOT NULL, enabled INTEGER NOT NULL, location_id TEXT);
    CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, radius REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
  const columns=await db.getAllAsync<{name:string}>('PRAGMA table_info(timetables)');
  const names=new Set(columns.map(c=>c.name));
  if(!names.has('alert_minutes_list'))await db.execAsync("ALTER TABLE timetables ADD COLUMN alert_minutes_list TEXT NOT NULL DEFAULT '[]'");
  if(!names.has('excluded_dates'))await db.execAsync("ALTER TABLE timetables ADD COLUMN excluded_dates TEXT NOT NULL DEFAULT '[]'");
  if(!names.has('paused_until'))await db.execAsync('ALTER TABLE timetables ADD COLUMN paused_until TEXT');
}
export async function getTimetables(): Promise<Timetable[]> {
  const rows = await db.getAllAsync<any>('SELECT * FROM timetables ORDER BY name');
  return rows.map(r => ({ id:r.id, name:r.name, times:JSON.parse(r.times), days:JSON.parse(r.days), alertMinutes:r.alert_minutes, alertMinutesList:JSON.parse(r.alert_minutes_list||'[]').length?JSON.parse(r.alert_minutes_list):[r.alert_minutes], excludedDates:JSON.parse(r.excluded_dates||'[]'), pausedUntil:r.paused_until, enabled:!!r.enabled, locationId:r.location_id }));
}
export async function saveTimetable(t: Timetable) {
  await db.runAsync(`INSERT OR REPLACE INTO timetables (id,name,times,days,alert_minutes,enabled,location_id,alert_minutes_list,excluded_dates,paused_until) VALUES (?,?,?,?,?,?,?,?,?,?)`,t.id,t.name,JSON.stringify(t.times),JSON.stringify(t.days),t.alertMinutes,t.enabled?1:0,t.locationId,JSON.stringify(t.alertMinutesList),JSON.stringify(t.excludedDates),t.pausedUntil);
}
export async function removeTimetable(id: string) { await db.runAsync('DELETE FROM timetables WHERE id=?', id); }
export async function getPlaces(): Promise<Place[]> { return db.getAllAsync<Place>('SELECT * FROM places ORDER BY name'); }
export async function savePlace(p: Place) { await db.runAsync('INSERT OR REPLACE INTO places VALUES (?,?,?,?,?)',p.id,p.name,p.latitude,p.longitude,p.radius); }
export async function removePlace(id:string) { await db.runAsync('DELETE FROM places WHERE id=?',id); await db.runAsync('UPDATE timetables SET location_id=NULL WHERE location_id=?',id); }
export async function getSetting(key:string) { return (await db.getFirstAsync<{value:string}>('SELECT value FROM settings WHERE key=?',key))?.value; }
export async function setSetting(key:string,value:string) { await db.runAsync('INSERT OR REPLACE INTO settings VALUES (?,?)',key,value); }

export async function replaceAll(timetables:Timetable[], places:Place[]) {
  await db.withTransactionAsync(async()=>{
    await db.runAsync('DELETE FROM timetables');
    await db.runAsync('DELETE FROM places');
    for(const p of places) await savePlace(p);
    for(const t of timetables) await saveTimetable(t);
  });
}
