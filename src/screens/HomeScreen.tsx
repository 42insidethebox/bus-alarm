import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Button, Card, Heading, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams, Timetable } from "../types";
import { dayNames, formatLocalDate, timeToMinutes } from "../utils";
import { GtfsOccurrence, resolveGtfsOccurrences } from "../gtfs/occurrences";
import { isTimetableLocationEligible } from "../notifications";

type NextDeparture = {
  timetable: Timetable;
  time: string;
  date: Date;
  timezone?: string;
};

export function HomeScreen() {
  const c = useColors();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { timetables, places, coords, scheduled, refreshAlarms } = useStore();
  const [gtfsOccurrences, setGtfsOccurrences] = useState<GtfsOccurrence[]>([]);
  const now = new Date();

  useEffect(() => {
    let active = true;
    const linked = timetables.filter(
      (table) =>
        table.enabled &&
        table.source === "gtfs" &&
        isTimetableLocationEligible(table, places, coords),
    );
    if (!linked.length) {
      setGtfsOccurrences([]);
      return;
    }
    void resolveGtfsOccurrences(linked, {
      now: new Date(),
      windowEnd: new Date(Date.now() + 8 * 86_400_000),
      maxOccurrencesPerTimetable: 100,
    })
      .then((items) => {
        if (active) setGtfsOccurrences(items);
      })
      .catch(() => {
        if (active) setGtfsOccurrences([]);
      });
    return () => {
      active = false;
    };
  }, [coords, places, timetables]);

  const next = useMemo<NextDeparture | undefined>(() => {
    const current = new Date();
    const manual = timetables
      .filter(
        (table) =>
          table.enabled &&
          table.source !== "gtfs" &&
          isTimetableLocationEligible(table, places, coords) &&
          (!table.pausedUntil || new Date(table.pausedUntil) <= current),
      )
      .flatMap((table) =>
        table.times.flatMap((time) => {
          for (let offset = 0; offset < 8; offset += 1) {
            const date = new Date(current);
            date.setDate(date.getDate() + offset);
            date.setHours(0, 0, 0, 0);
            if (!table.days.includes(date.getDay())) continue;
            if (table.excludedDates.includes(formatLocalDate(date))) continue;
            date.setMinutes(timeToMinutes(time));
            if (date > current) return [{ timetable: table, time, date }];
          }
          return [];
        }),
      );
    const linked = gtfsOccurrences.flatMap((occurrence) => {
      const timetable = timetables.find(
        (table) => table.id === occurrence.timetableId,
      );
      return timetable
        ? [
            {
              timetable,
              time: occurrence.departureTime,
              date: occurrence.departureDate,
              timezone: occurrence.timezone,
            },
          ]
        : [];
    });
    return [...manual, ...linked].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    )[0];
  }, [coords, gtfsOccurrences, places, timetables]);

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub="Quietly watching your recurring departures.">
        Good{" "}
        {now.getHours() < 12
          ? "morning"
          : now.getHours() < 18
            ? "afternoon"
            : "evening"}
      </Heading>
      <Card style={{ backgroundColor: c.green, borderColor: c.green }}>
        {next ? (
          <>
            <Text style={[s.kicker, { color: c.card }]}>NEXT DEPARTURE</Text>
            <Text style={[s.big, { color: c.card }]}>{next.time}</Text>
            <Text style={{ color: c.card, fontSize: 18, fontWeight: "700" }}>
              {next.timetable.name}
            </Text>
            <Text style={{ color: c.card, opacity: 0.8 }}>
              {dayNames[next.date.getDay()]} · reminder{" "}
              {next.timetable.alertMinutes} min before
              {next.timezone ? ` · ${next.timezone}` : ""}
            </Text>
          </>
        ) : (
          <>
            <Text style={[s.big, { color: c.card }]}>All quiet</Text>
            <Text style={{ color: c.card }}>
              Add a timetable or import an offline transit feed to start.
            </Text>
          </>
        )}
      </Card>
      <View style={s.stats}>
        <Card style={s.stat}>
          <Text style={[s.number, { color: c.ink }]}>{timetables.length}</Text>
          <Text style={{ color: c.muted }}>Timetables</Text>
        </Card>
        <Card style={s.stat}>
          <Text style={[s.number, { color: c.ink }]}>{scheduled}</Text>
          <Text style={{ color: c.muted }}>Alarms queued</Text>
        </Card>
      </View>
      <Button
        title="Add timetable"
        onPress={() => nav.navigate("TimetableEditor")}
      />
      <Button
        title="Find nearby transit"
        kind="ghost"
        onPress={() => nav.navigate("NearbyStops")}
      />
      <Button
        title="Refresh alarms"
        kind="ghost"
        onPress={() => void refreshAlarms()}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 18 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  big: { fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1 },
  number: { fontSize: 28, fontWeight: "800" },
});
