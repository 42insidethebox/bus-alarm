export type Timetable = {
  id: string;
  name: string;
  times: string[];
  days: number[];
  alertMinutes: number;
  alertMinutesList: number[];
  excludedDates: string[];
  pausedUntil: string | null;
  enabled: boolean;
  locationId: string | null;
};

export type Place = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
};

export type RootStackParams = {
  Tabs: undefined;
  TimetableEditor: { id?: string } | undefined;
  LocationEditor: { id?: string } | undefined;
};
