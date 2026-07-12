import{describe,expect,it}from'vitest';
import{distanceMeters,formatLocalDate,parseTimes,timeToMinutes}from'./utils';
describe('time parser',()=>{
  it('normalizes, sorts and deduplicates pasted timetables',()=>expect(parseTimes('7:12, 0642\n07.12 07:12')).toEqual(['06:42','07:12']));
  it('rejects impossible times',()=>expect(()=>timeToMinutes('24:00')).toThrow());
  it('converts valid times',()=>expect(timeToMinutes('06:42')).toBe(402));
});
describe('distance',()=>it('returns approximately zero for the same place',()=>expect(distanceMeters(46.5,6.6,46.5,6.6)).toBe(0)));
describe('dates',()=>it('formats a calendar date without UTC shifting',()=>expect(formatLocalDate(new Date(2026,11,25))).toBe('2026-12-25')));
