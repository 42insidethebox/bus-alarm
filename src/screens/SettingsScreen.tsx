import React, { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { parseBackup } from "../backup";
import { testBell } from "../notifications";
import { useStore } from "../store";
import { Button, Card, Heading, useColors } from "../ui";
import { syncGeofences } from "../geofencing";
import { exportTimetablesCsv } from "../csv";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParams } from "../types";

export function SettingsScreen() {
  const c = useColors();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { timetables, places, scheduled, refreshAlarms, restore } = useStore();
  const [permissions, setPermissions] = useState({
    notifications: "checking",
    location: "checking",
    background: "checking",
  });
  const checkPermissions = async () => {
    const notifications = (await Notifications.getPermissionsAsync()).status;
    const location = (await Location.getForegroundPermissionsAsync()).status;
    let background =
      Constants.appOwnership === "expo"
        ? "development build required"
        : "native rebuild required";
    if (Constants.appOwnership !== "expo")
      try {
        background = (await Location.getBackgroundPermissionsAsync()).status;
      } catch {}
    setPermissions({ notifications, location, background });
  };
  const enableGeofencing = async () => {
    const result = await syncGeofences(places, true);
    await checkPermissions();
    if (result.status === "active") {
      await refreshAlarms();
      Alert.alert(
        "Place detection enabled",
        `${result.count} saved place${result.count === 1 ? "" : "s"} monitored in the background.`,
      );
    } else
      Alert.alert(
        "Background access not enabled",
        result.status === "unavailable"
          ? "Use a development build; Expo Go cannot run background geofencing."
          : result.status === "native-rebuild-required"
            ? "Regenerate and rebuild the native app so Android includes background-location permission."
            : "Allow foreground and background location access in system settings.",
      );
  };
  useEffect(() => {
    void checkPermissions();
  }, []);
  const backup = JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), timetables, places },
    null,
    2,
  );
  const restoreClipboard = async () => {
    try {
      const parsed = parseBackup(await Clipboard.getStringAsync());
      Alert.alert(
        "Replace all BusBell data?",
        `${parsed.timetables.length} timetables and ${parsed.places.length} places will be restored.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: async () => {
              await restore(parsed.timetables, parsed.places);
              Alert.alert("Restore complete");
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Cannot restore",
        error instanceof Error ? error.message : "Invalid backup.",
      );
    }
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub="Private, local, and deliberately simple.">Settings</Heading>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Place detection</Text>
        <Text style={{ color: c.muted }}>
          Notifications: {permissions.notifications}
        </Text>
        <Text style={{ color: c.muted }}>
          Location while using app: {permissions.location}
        </Text>
        <Text style={{ color: c.muted }}>
          Background location: {permissions.background}
        </Text>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          BusBell monitors up to 20 user-created places entirely on-device. Expo
          Go cannot test background events; use a development build.
        </Text>
        <Button
          title="Enable background place detection"
          onPress={() => void enableGeofencing()}
        />
        <Button
          title="Refresh permission status"
          kind="ghost"
          onPress={() => void checkPermissions()}
        />
        <Button
          title="Open system settings"
          kind="ghost"
          onPress={() => void Linking.openSettings()}
        />
      </Card>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Offline transit data</Text>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          Import standard GTFS ZIP files, discover nearby stops with GPS, and
          link exact operator schedules without an API or cloud account.
        </Text>
        <Button
          title="Manage transit feeds"
          onPress={() => navigation.navigate("TransitData")}
        />
      </Card>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Alarm status</Text>
        <Text style={{ color: c.muted }}>
          {scheduled} reminders are queued. BusBell keeps the nearest 60 alarms,
          then replenishes them whenever the app opens.
        </Text>
        <Button
          title="Reschedule now"
          kind="ghost"
          onPress={async () =>
            Alert.alert(
              "Alarms refreshed",
              `${await refreshAlarms()} reminders queued.`,
            )
          }
        />
        <Button
          title="Send test bell"
          onPress={async () => {
            if (!(await testBell()))
              Alert.alert(
                "Notifications disabled",
                "Enable notifications in system settings.",
              );
          }}
        />
      </Card>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Backup and restore</Text>
        <Text style={{ color: c.muted }}>
          Copy all data as JSON, export interoperable CSV with place
          coordinates, or restore a BusBell backup currently on your clipboard.
        </Text>
        <Button
          title="Copy schedules as CSV"
          kind="ghost"
          onPress={async () => {
            await Clipboard.setStringAsync(
              exportTimetablesCsv(timetables, places),
            );
            Alert.alert(
              "CSV copied",
              "Schedule rows and associated place metadata are on the clipboard.",
            );
          }}
        />
        <Button
          title="Copy backup"
          kind="ghost"
          onPress={async () => {
            await Clipboard.setStringAsync(backup);
            Alert.alert("Copied", "Your BusBell backup is on the clipboard.");
          }}
        />
        <Button
          title="Restore from clipboard"
          kind="ghost"
          onPress={() => void restoreClipboard()}
        />
      </Card>
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Privacy</Text>
        <Text style={{ color: c.muted, lineHeight: 21 }}>
          No account, ads, analytics, or cloud. Timetables and locations stay in
          the local SQLite database. Location is checked only when refreshing
          alarms.
        </Text>
      </Card>
      <Text style={{ color: c.muted, textAlign: "center" }}>
        BusBell 1.0 · Made for rare buses
      </Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  title: { fontSize: 19, fontWeight: "800" },
});
