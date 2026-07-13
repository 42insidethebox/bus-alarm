import { Place, Timetable } from "./types";
import { timeToMinutes } from "./utils";

export type Backup = {
  version: 1;
  exportedAt: string;
  timetables: Timetable[];
  places: Place[];
};
export function parseBackup(text: string): Backup {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The clipboard does not contain valid JSON.");
  }
  if (
    raw?.version !== 1 ||
    !Array.isArray(raw.timetables) ||
    !Array.isArray(raw.places)
  )
    throw new Error("This is not a supported BusBell backup.");
  const placeIds = new Set<string>();
  for (const p of raw.places) {
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      !Number.isFinite(p.radius)
    )
      throw new Error("The backup contains an invalid place.");
    placeIds.add(p.id);
  }
  for (const t of raw.timetables) {
    t.description = t.description ?? "";
    t.source = t.source ?? "manual";
    const invalidLegacyLocation =
      t.locationIds === undefined &&
      t.locationId !== undefined &&
      t.locationId !== null &&
      typeof t.locationId !== "string";
    const locationIds =
      t.locationIds === undefined
        ? typeof t.locationId === "string"
          ? [t.locationId]
          : []
        : t.locationIds;
    if (
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      !Array.isArray(t.times) ||
      !Array.isArray(t.days) ||
      !t.days.every((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) ||
      !Number.isInteger(t.alertMinutes) ||
      t.alertMinutes < 0 ||
      t.alertMinutes > 180 ||
      typeof t.enabled !== "boolean" ||
      invalidLegacyLocation ||
      !Array.isArray(locationIds) ||
      !locationIds.every(
        (placeId: unknown) =>
          typeof placeId === "string" && placeIds.has(placeId),
      )
    )
      throw new Error("The backup contains an invalid timetable.");
    t.locationIds = [...new Set(locationIds)];
    t.locationId = t.locationIds[0] ?? null;
    if (
      typeof t.description !== "string" ||
      !["manual", "file", "photo", "gtfs"].includes(t.source)
    )
      throw new Error("The backup contains invalid timetable metadata.");
    if (t.source === "gtfs") {
      const link = t.gtfsSource;
      if (
        !link ||
        typeof link.feedId !== "string" ||
        typeof link.feedName !== "string" ||
        typeof link.routeId !== "string" ||
        typeof link.routeLabel !== "string" ||
        typeof link.stopId !== "string" ||
        typeof link.stopName !== "string" ||
        !Array.isArray(link.serviceIds) ||
        !link.serviceIds.every((value: unknown) => typeof value === "string")
      )
        throw new Error(
          "The backup contains an invalid linked GTFS timetable.",
        );
    } else {
      if (!t.times.length || !t.days.length)
        throw new Error("The backup contains an empty recurring timetable.");
      t.times.forEach(timeToMinutes);
    }
    t.alertMinutesList = t.alertMinutesList ?? [t.alertMinutes];
    t.excludedDates = t.excludedDates ?? [];
    t.pausedUntil = t.pausedUntil ?? null;
  }
  return raw as Backup;
}
