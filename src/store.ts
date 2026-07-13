import { create } from "zustand";
import * as Location from "expo-location";
import {
  getPlaces,
  getTimetables,
  removePlace,
  removeTimetable,
  replaceAll,
  savePlace,
  saveTimetable,
  saveTimetables,
} from "./database";
import { reschedule } from "./notifications";
import {
  Place,
  Timetable,
  withTimetableLocationIds,
  withoutTimetablePlace,
} from "./types";
import {
  getActivePlaceIds,
  saveActivePlaceIds,
  syncGeofences,
} from "./geofencing";
import { distanceMeters } from "./utils";

type State = {
  timetables: Timetable[];
  places: Place[];
  ready: boolean;
  scheduled: number;
  coords?: { latitude: number; longitude: number };
  load: () => Promise<void>;
  persistTimetable: (t: Timetable) => Promise<void>;
  persistTimetables: (t: Timetable[]) => Promise<void>;
  deleteTimetable: (id: string) => Promise<void>;
  persistPlace: (p: Place) => Promise<void>;
  deletePlace: (id: string) => Promise<void>;
  restore: (t: Timetable[], p: Place[]) => Promise<void>;
  refreshAlarms: () => Promise<number>;
};

type DeviceCoords = { latitude: number; longitude: number };

async function getDeviceCoords(): Promise<DeviceCoords | undefined> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== "granted")
      return undefined;

    const cached = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
      requiredAccuracy: 500,
    });
    if (cached) return cached.coords;

    // Some Android devices/emulators accept the permission request but never
    // deliver a GPS fix. Location must enrich startup, never block it forever.
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((position) => position.coords)
        .catch(() => undefined),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), 5_000),
      ),
    ]);
  } catch {
    return undefined;
  }
}

export const useStore = create<State>((set, get) => ({
  timetables: [],
  places: [],
  ready: false,
  scheduled: 0,
  load: async () => {
    const [timetables, places] = await Promise.all([
      getTimetables(),
      getPlaces(),
    ]);
    const coords = await getDeviceCoords();
    let activeIds = await getActivePlaceIds();
    if (coords) {
      activeIds = places
        .filter(
          (p) =>
            distanceMeters(
              coords.latitude,
              coords.longitude,
              p.latitude,
              p.longitude,
            ) <= p.radius,
        )
        .map((p) => p.id);
      await saveActivePlaceIds(activeIds);
    }
    set({ timetables, places, ready: true, coords });
    await syncGeofences(places);
    const scheduled = await reschedule(timetables, places, coords, activeIds);
    set({ scheduled });
  },
  refreshAlarms: async () => {
    const { timetables, places } = get();
    const coords = (await getDeviceCoords()) ?? get().coords;
    let activeIds = await getActivePlaceIds();
    if (coords) {
      activeIds = places
        .filter(
          (p) =>
            distanceMeters(
              coords.latitude,
              coords.longitude,
              p.latitude,
              p.longitude,
            ) <= p.radius,
        )
        .map((p) => p.id);
      await saveActivePlaceIds(activeIds);
    }
    await syncGeofences(places);
    const scheduled = await reschedule(timetables, places, coords, activeIds);
    set({ scheduled, coords });
    return scheduled;
  },
  persistTimetable: async (t) => {
    const normalized = withTimetableLocationIds(t);
    await saveTimetable(normalized);
    set((s) => ({
      timetables: [
        ...s.timetables.filter((x) => x.id !== normalized.id),
        normalized,
      ].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    await get().refreshAlarms();
  },
  persistTimetables: async (items) => {
    const normalized = items.map((item) => withTimetableLocationIds(item));
    await saveTimetables(normalized);
    set((s) => ({
      timetables: [
        ...s.timetables.filter((x) => !normalized.some((i) => i.id === x.id)),
        ...normalized,
      ].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    await get().refreshAlarms();
  },
  deleteTimetable: async (id) => {
    await removeTimetable(id);
    set((s) => ({ timetables: s.timetables.filter((x) => x.id !== id) }));
    await get().refreshAlarms();
  },
  persistPlace: async (p) => {
    await savePlace(p);
    set((s) => ({
      places: [...s.places.filter((x) => x.id !== p.id), p].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
    await syncGeofences(get().places);
    await get().refreshAlarms();
  },
  deletePlace: async (id) => {
    await removePlace(id);
    set((s) => ({
      places: s.places.filter((x) => x.id !== id),
      timetables: s.timetables.map((t) => withoutTimetablePlace(t, id)),
    }));
    await get().refreshAlarms();
  },
  restore: async (timetables, places) => {
    await replaceAll(timetables, places);
    set({ timetables, places });
    await get().refreshAlarms();
  },
}));
