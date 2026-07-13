import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Button, Card, Heading, useColors } from "../ui";
import { RootStackParams } from "../types";
import { useStore } from "../store";
import {
  deleteGtfsFeed,
  GtfsFeedRecord,
  listGtfsFeeds,
} from "../gtfs/database";
import { GtfsImportPhase, importGtfsZip } from "../gtfs/import";

const phaseLabels: Record<GtfsImportPhase, string> = {
  reading: "Reading ZIP…",
  "validating-archive": "Checking archive safety…",
  parsing: "Validating GTFS data…",
  committing: "Saving offline data…",
};

function dateLabel(value: string | null) {
  if (!value) return "not declared";
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

export function TransitDataScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "TransitData">) {
  const c = useColors();
  const { timetables, persistTimetables } = useStore();
  const [feeds, setFeeds] = useState<GtfsFeedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<GtfsImportPhase | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setFeeds(await listGtfsFeeds());
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const pickFeed = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const imported = await importGtfsZip(asset.uri, asset.name, setPhase);
      setPhase(null);
      await refresh();
      if (imported.duplicate) {
        Alert.alert(
          "Already installed",
          `${imported.feed.name} is already available offline.`,
        );
      } else if (imported.warnings.length) {
        Alert.alert(
          "Transit data imported",
          `${imported.feed.name} is ready. ${imported.warnings.length} non-blocking data warning${imported.warnings.length === 1 ? "" : "s"} found.`,
        );
      }
      if (route.params?.continueToNearby)
        navigation.replace("NearbyStops", { feedId: imported.feed.id });
    } catch (error) {
      setPhase(null);
      Alert.alert(
        "Could not import transit data",
        error instanceof Error ? error.message : "The GTFS ZIP is invalid.",
      );
    }
  };

  const removeFeed = (feed: GtfsFeedRecord) => {
    const linked = timetables.filter((t) => t.gtfsSource?.feedId === feed.id);
    Alert.alert(
      "Remove offline transit data?",
      linked.length
        ? `${feed.name} is used by ${linked.length} timetable${linked.length === 1 ? "" : "s"}. They will remain visible but be disabled until this feed is imported again.`
        : `${feed.name} and its offline stops and schedules will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deleteGtfsFeed(feed.id);
            if (linked.length)
              await persistTimetables(
                linked.map((t) => ({ ...t, enabled: false })),
              );
            await refresh();
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub="GTFS schedules are validated and stored only on this phone.">
        Offline transit data
      </Heading>
      <Button
        title={phase ? phaseLabels[phase] : "Import GTFS ZIP"}
        disabled={phase !== null}
        onPress={() => void pickFeed()}
      />
      <Button
        title="Find nearby stops"
        kind="ghost"
        disabled={!feeds.length || phase !== null}
        onPress={() => navigation.navigate("NearbyStops")}
      />
      <Card>
        <Text style={[s.title, { color: c.ink }]}>Zero-API mode</Text>
        <Text style={{ color: c.muted, lineHeight: 21 }}>
          Download a public GTFS ZIP from your transit operator, then import it
          here. After import, stop discovery and schedules work without a map,
          account, server, or network connection.
        </Text>
      </Card>
      {loading && <Text style={{ color: c.muted }}>Loading feeds…</Text>}
      {feeds.map((feed) => (
        <Card key={feed.id}>
          <View style={s.between}>
            <Text style={[s.title, { color: c.ink, flex: 1 }]}>
              {feed.name}
            </Text>
            <Text style={{ color: c.green, fontWeight: "800" }}>OFFLINE</Text>
          </View>
          <Text style={{ color: c.muted }}>
            {feed.counts.stops.toLocaleString()} stops ·{" "}
            {feed.counts.routes.toLocaleString()} routes ·{" "}
            {feed.counts.trips.toLocaleString()} trips
          </Text>
          <Text style={{ color: c.muted }}>
            Service validity: {dateLabel(feed.startDate)} to{" "}
            {dateLabel(feed.endDate)}
          </Text>
          <Text style={{ color: c.muted }}>
            Attribution:{" "}
            {feed.attribution || feed.publisherName || "not supplied"}
          </Text>
          {!feed.license && (
            <Text style={{ color: c.muted }}>
              License not declared in the imported feed. Verify the operator’s
              reuse terms before redistributing it.
            </Text>
          )}
          <Button
            title="Browse nearby stops"
            kind="ghost"
            onPress={() =>
              navigation.navigate("NearbyStops", { feedId: feed.id })
            }
          />
          <Button
            title="Remove feed"
            kind="danger"
            onPress={() => removeFeed(feed)}
          />
        </Card>
      ))}
      {!loading && !feeds.length && (
        <Card>
          <Text style={{ color: c.muted, textAlign: "center" }}>
            No transit feeds installed yet.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  title: { fontSize: 18, fontWeight: "800" },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
