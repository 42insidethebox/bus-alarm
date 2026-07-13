export type GtfsTimetableSource = {
  feedId: string;
  feedName: string;
  feedVersion: string | null;
  routeId: string;
  routeLabel: string;
  stopId: string;
  stopName: string;
  directionId?: 0 | 1;
  headsign?: string;
  serviceIds: string[];
  updatePolicy: "ask" | "automatic";
};

export type Timetable = {
  id: string;
  name: string;
  description: string;
  source: "manual" | "file" | "photo" | "gtfs";
  gtfsSource?: GtfsTimetableSource;
  times: string[];
  days: number[];
  alertMinutes: number;
  alertMinutesList: number[];
  excludedDates: string[];
  pausedUntil: string | null;
  enabled: boolean;
  /** Empty means Anywhere. One or more ids means eligible near any selected place. */
  locationIds: string[];
  /** @deprecated Compatibility mirror of the first locationIds entry. */
  locationId: string | null;
};

export function timetableLocationIds(
  timetable: Pick<Timetable, "locationId"> &
    Partial<Pick<Timetable, "locationIds">>,
): string[] {
  const values = Array.isArray(timetable.locationIds)
    ? timetable.locationIds
    : timetable.locationId
      ? [timetable.locationId]
      : [];
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  ];
}

export function withTimetableLocationIds<
  T extends Pick<Timetable, "locationId"> &
    Partial<Pick<Timetable, "locationIds">>,
>(
  timetable: T,
  locationIds = timetableLocationIds(timetable),
): T & Pick<Timetable, "locationId" | "locationIds"> {
  const normalized = [...new Set(locationIds)];
  return {
    ...timetable,
    locationIds: normalized,
    locationId: normalized[0] ?? null,
  };
}

export function withoutTimetablePlace(
  timetable: Timetable,
  placeId: string,
): Timetable {
  const current = timetableLocationIds(timetable);
  if (!current.includes(placeId)) return timetable;
  const remaining = current.filter((id) => id !== placeId);
  return withTimetableLocationIds(
    { ...timetable, enabled: remaining.length ? timetable.enabled : false },
    remaining,
  );
}

export type Place = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
};

export type RootStackParams = {
  Tabs: undefined;
  TimetableEditor: { id?: string; placeId?: string } | undefined;
  LocationEditor: { id?: string } | undefined;
  PhotoTimetableImport: { launch?: "camera" | "library" } | undefined;
  TransitData: { continueToNearby?: boolean } | undefined;
  NearbyStops: { feedId?: string } | undefined;
  StopRoutes: {
    feedId: string;
    stopId: string;
    stopName: string;
  };
  GtfsTimetableReview: {
    feedId: string;
    stopId: string;
    stopName: string;
    routeId: string;
    routeLabel: string;
    directionId: 0 | 1 | null;
    headsign: string | null;
    serviceIds: string[];
  };
};
