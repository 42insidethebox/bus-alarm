import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import {
  getPlaces,
  getSetting,
  getTimetables,
  migrate,
  setSetting,
} from "./database";
import { reschedule } from "./notifications";
import { Place } from "./types";

export const GEOFENCE_TASK = "busbell-place-geofences";
export const MAX_ACTIVE_GEOFENCES = 20;
const ACTIVE_PLACES_KEY = "active_place_ids";

if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };
    if (!region.identifier) return;
    await migrate();
    const active = new Set<string>(
      JSON.parse((await getSetting(ACTIVE_PLACES_KEY)) ?? "[]"),
    );
    if (eventType === Location.GeofencingEventType.Enter)
      active.add(region.identifier);
    if (eventType === Location.GeofencingEventType.Exit)
      active.delete(region.identifier);
    const activeIds = [...active];
    await setSetting(ACTIVE_PLACES_KEY, JSON.stringify(activeIds));
    await reschedule(
      await getTimetables(),
      await getPlaces(),
      undefined,
      activeIds,
    );
  });
}

export async function syncGeofences(
  places: Place[],
  requestPermission = false,
) {
  if (Constants.appOwnership === "expo")
    return { status: "unavailable" as const, count: 0 };
  if (!(await TaskManager.isAvailableAsync()))
    return { status: "unavailable" as const, count: 0 };
  let foreground = await Location.getForegroundPermissionsAsync();
  if (requestPermission && foreground.status !== "granted")
    foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted")
    return { status: "foreground-denied" as const, count: 0 };
  let background: Location.LocationPermissionResponse;
  try {
    background = await Location.getBackgroundPermissionsAsync();
    if (requestPermission && background.status !== "granted")
      background = await Location.requestBackgroundPermissionsAsync();
  } catch {
    return { status: "native-rebuild-required" as const, count: 0 };
  }
  if (background.status !== "granted")
    return { status: "background-denied" as const, count: 0 };
  const selected = places.slice(0, MAX_ACTIVE_GEOFENCES);
  if (!selected.length) {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK))
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return { status: "active" as const, count: 0 };
  }
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    selected.map((p) => ({
      identifier: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      radius: Math.max(100, p.radius),
      notifyOnEnter: true,
      notifyOnExit: true,
    })),
  );
  return { status: "active" as const, count: selected.length };
}

export async function getActivePlaceIds() {
  return JSON.parse((await getSetting(ACTIVE_PLACES_KEY)) ?? "[]") as string[];
}
export async function saveActivePlaceIds(ids: string[]) {
  await setSetting(ACTIVE_PLACES_KEY, JSON.stringify(ids));
}
