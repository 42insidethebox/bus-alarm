import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  resolveGtfsOccurrences,
  type GtfsOccurrence,
} from "./gtfs/occurrences";
import { Place, Timetable, timetableLocationIds } from "./types";
import { distanceMeters, formatLocalDate, timeToMinutes } from "./utils";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
const isExpoGo = Constants.appOwnership === "expo";
const channelId = "departures-v3";
const bellSound = "busbell_chime.wav";

export function isTimetableLocationEligible(
  table: Timetable,
  places: Place[],
  coords?: { latitude: number; longitude: number },
  activePlaceIds?: string[],
) {
  const selectedIds = timetableLocationIds(table);
  if (!selectedIds.length) return true;
  if (activePlaceIds)
    return selectedIds.some((placeId) => activePlaceIds.includes(placeId));
  if (!coords) return false;
  return places.some(
    (place) =>
      selectedIds.includes(place.id) &&
      distanceMeters(
        coords.latitude,
        coords.longitude,
        place.latitude,
        place.longitude,
      ) <= place.radius,
  );
}

export async function ensureNotificationPermission() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(channelId, {
      name: "Departure reminders",
      importance: Notifications.AndroidImportance.HIGH,
      ...(!isExpoGo && { sound: bellSound }),
      vibrationPattern: [0, 300, 150, 500],
    });
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  return (await Notifications.requestPermissionsAsync()).status === "granted";
}

export async function reschedule(
  timetables: Timetable[],
  places: Place[],
  coords?: { latitude: number; longitude: number },
  activePlaceIds?: string[],
) {
  if (!(await ensureNotificationPermission())) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = new Date();
  const candidates: {
    table: Timetable;
    time: string;
    lead: number;
    date: Date;
    occurrence?: GtfsOccurrence;
  }[] = [];
  for (const table of timetables.filter((t) => t.enabled)) {
    if (!isTimetableLocationEligible(table, places, coords, activePlaceIds))
      continue;
    // GTFS-backed timetables must only be evaluated against the imported feed.
    // Their empty/preview times and days are never treated as recurring rules.
    if (table.source === "gtfs") {
      if (!table.gtfsSource) continue;
      const windowEnd = new Date(now);
      windowEnd.setHours(0, 0, 0, 0);
      windowEnd.setDate(windowEnd.getDate() + 30);
      try {
        const occurrences = await resolveGtfsOccurrences([table], {
          now,
          windowEnd,
          maxOccurrencesPerTimetable: 60,
        });
        for (const occurrence of occurrences) {
          for (const lead of table.alertMinutesList?.length
            ? table.alertMinutesList
            : [table.alertMinutes]) {
            const date = new Date(
              occurrence.departureDate.getTime() - lead * 60_000,
            );
            if (date <= now) continue;
            if (table.pausedUntil && date <= new Date(table.pausedUntil))
              continue;
            candidates.push({
              table,
              time: occurrence.departureTime,
              lead,
              date,
              occurrence,
            });
          }
        }
      } catch (error) {
        // A removed/corrupt feed must not prevent unrelated manual reminders
        // from being rebuilt. The linked timetable remains visible for repair.
        console.warn(`Could not schedule GTFS timetable ${table.id}`, error);
      }
      continue;
    }
    for (let offset = 0; offset < 30; offset++)
      for (const time of table.times)
        for (const lead of table.alertMinutesList?.length
          ? table.alertMinutesList
          : [table.alertMinutes]) {
          const date = new Date(now);
          date.setHours(0, 0, 0, 0);
          date.setDate(date.getDate() + offset);
          if (!table.days.includes(date.getDay())) continue;
          const departureDate = formatLocalDate(date);
          if (table.excludedDates?.includes(departureDate)) continue;
          date.setMinutes(timeToMinutes(time) - lead);
          if (date <= now) continue;
          if (table.pausedUntil && date <= new Date(table.pausedUntil))
            continue;
          candidates.push({ table, time, lead, date });
        }
  }
  // iOS only retains 64 pending local notifications. Keep four slots free for
  // test/system notifications and always schedule the soonest departures first.
  const upcoming = candidates
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 60);
  for (const { table, time, lead, date, occurrence } of upcoming) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${table.name} in ${lead} min`,
        body: `Departure at ${time}`,
        ...(!isExpoGo && { sound: bellSound }),
        data: {
          timetableId: table.id,
          ...(occurrence && {
            gtfsFeedId: occurrence.feedId,
            gtfsRouteId: occurrence.routeId,
            gtfsStopId: occurrence.stopId,
            gtfsTripId: occurrence.tripId,
            gtfsServiceDate: occurrence.serviceDate,
          }),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId,
      },
    });
  }
  return upcoming.length;
}

export async function testBell() {
  if (!(await ensureNotificationPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "BusBell is ready 🔔",
      body: isExpoGo
        ? "Expo Go preview: sound is available in the development build."
        : "Your reminders will sound like this.",
      ...(!isExpoGo && { sound: bellSound }),
    },
    trigger: null,
  });
  return true;
}
