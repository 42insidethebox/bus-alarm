import { Place, Timetable } from './types';
import { timeToMinutes } from './utils';

export type Backup={version:1;exportedAt:string;timetables:Timetable[];places:Place[]};
export function parseBackup(text:string):Backup {
  let raw:any;
  try{raw=JSON.parse(text)}catch{throw new Error('The clipboard does not contain valid JSON.');}
  if(raw?.version!==1||!Array.isArray(raw.timetables)||!Array.isArray(raw.places))throw new Error('This is not a supported BusBell backup.');
  const placeIds=new Set<string>();
  for(const p of raw.places){if(typeof p.id!=='string'||typeof p.name!=='string'||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||!Number.isFinite(p.radius))throw new Error('The backup contains an invalid place.');placeIds.add(p.id);}
  for(const t of raw.timetables){if(typeof t.id!=='string'||typeof t.name!=='string'||!Array.isArray(t.times)||!t.times.length||!Array.isArray(t.days)||!t.days.every((d:any)=>Number.isInteger(d)&&d>=0&&d<=6)||!Number.isInteger(t.alertMinutes)||t.alertMinutes<0||t.alertMinutes>180||typeof t.enabled!=='boolean'||(t.locationId!==null&&!placeIds.has(t.locationId)))throw new Error('The backup contains an invalid timetable.');t.times.forEach(timeToMinutes);t.alertMinutesList=t.alertMinutesList??[t.alertMinutes];t.excludedDates=t.excludedDates??[];t.pausedUntil=t.pausedUntil??null;}
  return raw as Backup;
}
