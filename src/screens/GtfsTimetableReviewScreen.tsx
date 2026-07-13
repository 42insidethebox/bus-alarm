import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Button, Card, Field, Heading, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams, Timetable } from "../types";
import { id } from "../utils";
import {
  getGtfsFeed,
  getGtfsRouteTimeZone,
  getGtfsStopDepartures,
  GtfsFeedRecord,
} from "../gtfs/database";

type PreviewDay = {
  serviceDate: string;
  times: string[];
};

function serviceDateInZone(date: Date, timezone: string, offset: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offset),
  );
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function GtfsTimetableReviewScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "GtfsTimetableReview">) {
  const c = useColors();
  const { places, persistTimetable } = useStore();
  const params = route.params;
  const defaultName = `${params.routeLabel} → ${params.headsign || params.stopName}`;
  const [feed, setFeed] = useState<GtfsFeedRecord | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewDay[]>([]);
  const [nonExactCount, setNonExactCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(defaultName);
  const [reminders, setReminders] = useState("5");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [nextFeed, routeTimezone] = await Promise.all([
        getGtfsFeed(params.feedId),
        getGtfsRouteTimeZone(params.feedId, params.routeId),
      ]);
      if (!routeTimezone)
        throw new Error("The selected route has no valid agency timezone.");
      const days: PreviewDay[] = [];
      let estimated = 0;
      for (let offset = 0; offset < 8; offset += 1) {
        const serviceDate = serviceDateInZone(
          new Date(),
          routeTimezone,
          offset,
        );
        const departures = await getGtfsStopDepartures({
          feedId: params.feedId,
          stopId: params.stopId,
          routeId: params.routeId,
          directionId: params.directionId ?? undefined,
          serviceDate,
          limit: 200,
        });
        const matching = departures.filter(
          (item) =>
            params.serviceIds.includes(item.serviceId) &&
            (!params.headsign ||
              (item.stopHeadsign || item.headsign) === params.headsign),
        );
        estimated += matching.filter((item) => !item.exact).length;
        const times = matching
          .filter((item) => item.exact)
          .map((item) => item.departure.raw);
        if (times.length)
          days.push({ serviceDate, times: [...new Set(times)] });
      }
      if (!active) return;
      setFeed(nextFeed);
      setTimezone(routeTimezone);
      setPreview(days);
      setNonExactCount(estimated);
      setLoading(false);
    })().catch((error) => {
      if (!active) return;
      setLoading(false);
      Alert.alert(
        "Could not preview schedule",
        error instanceof Error ? error.message : "The feed could not be read.",
      );
    });
    return () => {
      active = false;
    };
  }, [params]);

  const save = async () => {
    const alertMinutesList = [
      ...new Set((reminders.match(/\d+/g) ?? []).map(Number)),
    ]
      .filter((value) => value >= 0 && value <= 180)
      .sort((a, b) => b - a);
    if (!name.trim()) return Alert.alert("Add a timetable name");
    if (!alertMinutesList.length)
      return Alert.alert(
        "Invalid reminders",
        "Enter one or more values from 0–180, such as 10, 5.",
      );
    if (!reviewed)
      return Alert.alert(
        "Review required",
        "Confirm that the stop, route, and direction are correct.",
      );
    if (!feed) return Alert.alert("Feed unavailable", "Import the feed again.");
    setSaving(true);
    const timetable: Timetable = {
      id: id(),
      name: name.trim(),
      description: `${params.stopName} · ${feed.name}`,
      source: "gtfs",
      gtfsSource: {
        feedId: feed.id,
        feedName: feed.name,
        feedVersion: feed.version,
        routeId: params.routeId,
        routeLabel: params.routeLabel,
        stopId: params.stopId,
        stopName: params.stopName,
        directionId: params.directionId ?? undefined,
        headsign: params.headsign ?? undefined,
        serviceIds: params.serviceIds,
        updatePolicy: "automatic",
      },
      // Linked GTFS timetables deliberately keep recurring fields empty. Home
      // and notifications resolve exact service occurrences from SQLite.
      times: [],
      days: [],
      alertMinutes: alertMinutesList.at(-1)!,
      alertMinutesList,
      excludedDates: [],
      pausedUntil: null,
      enabled: true,
      locationIds,
      locationId: locationIds[0] ?? null,
    };
    try {
      await persistTimetable(timetable);
      navigation.popTo("Tabs");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub={feed?.name ?? "Imported transit feed"}>
        Review linked timetable
      </Heading>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>
          Route {params.routeLabel}
        </Text>
        <Text style={{ color: c.ink, fontSize: 17 }}>
          → {params.headsign || "Direction not specified"}
        </Text>
        <Text style={{ color: c.muted }}>Board at {params.stopName}</Text>
        <Text style={{ color: c.muted }}>
          Validity: {feed?.startDate ?? "not declared"} to{" "}
          {feed?.endDate ?? "not declared"}
        </Text>
        <Text style={{ color: c.muted }}>
          Attribution:{" "}
          {feed?.attribution || feed?.publisherName || "not supplied"}
        </Text>
        {timezone && (
          <Text style={{ color: c.muted }}>Schedule timezone: {timezone}</Text>
        )}
      </Card>
      <Field label="Timetable name" value={name} onChangeText={setName} />
      <Field
        label="Reminder minutes"
        value={reminders}
        onChangeText={setReminders}
        keyboardType="numbers-and-punctuation"
        placeholder="10, 5"
      />
      <Text style={[s.label, { color: c.ink }]}>Only near saved places</Text>
      <Text style={{ color: c.muted }}>
        Select one or more. The timetable is active near any selected place.
      </Text>
      <View style={s.wrap}>
        <Pressable
          onPress={() => setLocationIds([])}
          style={[
            s.chip,
            {
              borderColor: c.line,
              backgroundColor: !locationIds.length ? c.green : c.card,
            },
          ]}
        >
          <Text style={{ color: !locationIds.length ? c.card : c.ink }}>
            Anywhere
          </Text>
        </Pressable>
        {places.map((place) => (
          <Pressable
            key={place.id}
            onPress={() =>
              setLocationIds((current) =>
                current.includes(place.id)
                  ? current.filter((placeId) => placeId !== place.id)
                  : [...current, place.id],
              )
            }
            style={[
              s.chip,
              {
                borderColor: c.line,
                backgroundColor: locationIds.includes(place.id)
                  ? c.green
                  : c.card,
              },
            ]}
          >
            <Text
              style={{
                color: locationIds.includes(place.id) ? c.card : c.ink,
              }}
            >
              {place.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Exact service preview</Text>
        {loading && (
          <Text style={{ color: c.muted }}>Resolving calendars…</Text>
        )}
        {preview.slice(0, 5).map((day) => (
          <View key={day.serviceDate} style={{ gap: 4 }}>
            <Text style={{ color: c.ink, fontWeight: "800" }}>
              {day.serviceDate}
            </Text>
            <Text style={{ color: c.muted, lineHeight: 21 }}>
              {day.times.slice(0, 16).join("  ")}
              {day.times.length > 16 ? " …" : ""}
            </Text>
          </View>
        ))}
        {!loading && !preview.length && (
          <Text style={{ color: c.muted }}>
            No exact departures were found in the next eight service days.
          </Text>
        )}
        {nonExactCount > 0 && (
          <Text style={{ color: c.muted }}>
            {nonExactCount} headway-only departure estimate
            {nonExactCount === 1 ? "" : "s"} hidden. GTFS does not promise an
            exact clock time for these, so BusBell will not fabricate alarms.
          </Text>
        )}
        <Text style={{ color: c.muted }}>
          Times above are GTFS service times. Values after 24:00 correctly
          belong to the following wall-clock day.
        </Text>
      </Card>
      <Card>
        <View style={s.between}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: c.ink, fontWeight: "800" }}>
              I reviewed the stop and direction
            </Text>
            <Text style={{ color: c.muted }}>
              The linked feed controls service dates and exact departures.
              Importing a newer feed from this operator updates them.
            </Text>
          </View>
          <Switch
            value={reviewed}
            onValueChange={setReviewed}
            trackColor={{ true: c.green }}
          />
        </View>
      </Card>
      <Button
        title={saving ? "Creating…" : "Create linked timetable"}
        disabled={saving || loading}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 15 },
  title: { fontSize: 19, fontWeight: "800" },
  label: { fontSize: 15, fontWeight: "800" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
