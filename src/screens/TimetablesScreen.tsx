import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, Heading, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams, Timetable, timetableLocationIds } from "../types";
import { dayNames, id } from "../utils";
export function TimetablesScreen() {
  const c = useColors(),
    nav = useNavigation<NativeStackNavigationProp<RootStackParams>>(),
    { timetables, places, persistTimetable, deleteTimetable } = useStore();
  const pause = (t: Timetable) =>
    Alert.alert("Pause timetable", t.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "For 24 hours",
        onPress: () =>
          void persistTimetable({
            ...t,
            pausedUntil: new Date(Date.now() + 86400000).toISOString(),
          }),
      },
      {
        text: "Resume now",
        onPress: () => void persistTimetable({ ...t, pausedUntil: null }),
      },
    ]);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub="Any recurring schedule, stored only on this phone.">
        Timetables
      </Heading>
      <Button
        title="Scan timetable photo"
        onPress={() =>
          nav.navigate("PhotoTimetableImport", { launch: "camera" })
        }
      />
      <Button
        title="Find nearby transit"
        kind="ghost"
        onPress={() => nav.navigate("NearbyStops")}
      />
      <View style={s.actions}>
        <View style={{ flex: 1 }}>
          <Button
            title="Choose photo"
            kind="ghost"
            onPress={() =>
              nav.navigate("PhotoTimetableImport", { launch: "library" })
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Enter manually"
            kind="ghost"
            onPress={() => nav.navigate("TimetableEditor")}
          />
        </View>
      </View>
      {timetables.map((t) => {
        const paused = !!t.pausedUntil && new Date(t.pausedUntil) > new Date();
        const selectedPlaceIds = timetableLocationIds(t);
        const selectedPlaces = places.filter((place) =>
          selectedPlaceIds.includes(place.id),
        );
        return (
          <Pressable
            key={t.id}
            onPress={() =>
              t.source === "gtfs"
                ? Alert.alert(
                    "Linked transit timetable",
                    "Its departures come from the installed GTFS feed. Import an updated feed to change operator service, or duplicate it to preserve this link with different reminders.",
                  )
                : nav.navigate("TimetableEditor", { id: t.id })
            }
          >
            <Card>
              <View style={s.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.title, { color: c.ink }]}>
                    {t.name}
                    {paused ? " · Paused" : ""}
                  </Text>
                  {t.description && (
                    <Text style={{ color: c.muted }} numberOfLines={1}>
                      {t.description}
                    </Text>
                  )}
                  <Text style={{ color: c.muted }}>
                    {t.source === "gtfs"
                      ? `Linked · ${t.gtfsSource?.feedName ?? "GTFS feed"}`
                      : t.times.slice(0, 4).join("  ")}
                    {t.source !== "gtfs" && t.times.length > 4 ? " …" : ""}
                  </Text>
                </View>
                <Switch
                  value={t.enabled}
                  onValueChange={(enabled) =>
                    void persistTimetable({ ...t, enabled })
                  }
                  trackColor={{ true: c.green }}
                />
              </View>
              <Text style={{ color: c.muted }}>
                {t.source === "gtfs"
                  ? `${t.gtfsSource?.stopName ?? "Imported stop"} • `
                  : `${t.days.map((d) => dayNames[d]).join(" · ")} • `}
                {(t.alertMinutesList ?? [t.alertMinutes]).join(", ")} min before
              </Text>
              <Text
                style={{
                  color: selectedPlaces.length ? c.green : c.muted,
                  fontWeight: "700",
                }}
              >
                {selectedPlaces.length
                  ? `Only near: ${selectedPlaces.map((place) => place.name).join(" OR ")}`
                  : "Works anywhere"}
              </Text>
              <View style={s.actions}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={paused ? "Resume" : "Pause"}
                    kind="ghost"
                    onPress={() => pause(t)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Duplicate"
                    kind="ghost"
                    onPress={() =>
                      void persistTimetable({
                        ...t,
                        id: id(),
                        name: `${t.name} copy`,
                        enabled: false,
                        pausedUntil: null,
                      })
                    }
                  />
                </View>
              </View>
              <Button
                title="Delete"
                kind="danger"
                onPress={() =>
                  Alert.alert("Delete timetable?", t.name, [
                    { text: "Cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => void deleteTimetable(t.id),
                    },
                  ])
                }
              />
            </Card>
          </Pressable>
        );
      })}
      {!timetables.length && (
        <Card>
          <Text style={{ color: c.muted, textAlign: "center" }}>
            No timetables yet. Scan a photo, paste times or import TXT/CSV.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 19, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 },
});
