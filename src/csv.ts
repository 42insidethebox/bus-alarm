import { Place, Timetable, timetableLocationIds } from "./types";
const cell = (value: unknown) => {
  const valueText = String(value ?? "");
  return /[",\n]/.test(valueText)
    ? `"${valueText.replace(/"/g, '""')}"`
    : valueText;
};
export function exportTimetablesCsv(timetables: Timetable[], places: Place[]) {
  const header = [
    "name",
    "description",
    "time",
    "days",
    "alert_minutes",
    "place",
    "latitude",
    "longitude",
    "radius",
    "source",
    "gtfs_feed",
    "gtfs_route",
    "gtfs_stop",
    "gtfs_direction",
    "gtfs_headsign",
    "export_note",
    "place_ids",
  ];
  const rows = timetables.flatMap((table) =>
    (table.times.length ? table.times : [""]).map((time) => {
      const placeIds = timetableLocationIds(table);
      const selectedPlaces = placeIds
        .map((placeId) => places.find((place) => place.id === placeId))
        .filter((place): place is Place => !!place);
      return [
        table.name,
        table.description,
        time,
        table.days.join("|"),
        table.alertMinutesList.join("|"),
        selectedPlaces.length
          ? selectedPlaces.map((place) => place.name).join("|")
          : "Anywhere",
        selectedPlaces.map((place) => place.latitude).join("|"),
        selectedPlaces.map((place) => place.longitude).join("|"),
        selectedPlaces.map((place) => place.radius).join("|"),
        table.source,
        table.gtfsSource?.feedName ?? "",
        table.gtfsSource?.routeLabel ?? "",
        table.gtfsSource?.stopName ?? "",
        table.gtfsSource?.directionId ?? "",
        table.gtfsSource?.headsign ?? "",
        table.source === "gtfs"
          ? "Linked schedule metadata only; reimport the matching GTFS feed"
          : "",
        placeIds.join("|"),
      ];
    }),
  );
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}
