import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Button, Card, Heading, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams } from "../types";
import {
  findNearbyGtfsStops,
  GtfsFeedRecord,
  listGtfsFeeds,
  NearbyGtfsStop,
} from "../gtfs/database";

type Anchor = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

const radii = [250, 500, 1000, 2000];

export function NearbyStopsScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "NearbyStops">) {
  const c = useColors();
  const { places, coords } = useStore();
  const [feeds, setFeeds] = useState<GtfsFeedRecord[]>([]);
  const [feedId, setFeedId] = useState<string | undefined>(
    route.params?.feedId,
  );
  const [anchor, setAnchor] = useState<Anchor | null>(
    coords
      ? { id: "current", name: "Current location", ...coords }
      : (places[0] ?? null),
  );
  const [radius, setRadius] = useState(1000);
  const [stops, setStops] = useState<NearbyGtfsStop[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listGtfsFeeds().then(setFeeds);
  }, []);

  const search = useCallback(async () => {
    if (!anchor) return;
    setBusy(true);
    try {
      setStops(
        await findNearbyGtfsStops({
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          radiusMeters: radius,
          feedIds: feedId ? [feedId] : undefined,
          limit: 100,
        }),
      );
    } catch (error) {
      Alert.alert(
        "Could not find stops",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [anchor, feedId, radius]);

  useEffect(() => {
    void search();
  }, [search]);

  const useCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        return Alert.alert(
          "Location not allowed",
          "Choose one of your saved places instead.",
        );
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setAnchor({
        id: "current",
        name: "Current location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      Alert.alert("Location unavailable", "Choose a saved place or try again.");
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub="GPS coordinates are matched against imported stops entirely on-device.">
        Nearby stops
      </Heading>
      {!feeds.length && (
        <Card>
          <Text style={{ color: c.muted }}>Import transit data first.</Text>
          <Button
            title="Import GTFS ZIP"
            onPress={() =>
              navigation.replace("TransitData", { continueToNearby: true })
            }
          />
        </Card>
      )}
      {!!feeds.length && (
        <>
          <Text style={[s.label, { color: c.ink }]}>Search from</Text>
          <View style={s.wrap}>
            <Pressable
              style={[
                s.chip,
                {
                  borderColor: c.line,
                  backgroundColor: anchor?.id === "current" ? c.green : c.card,
                },
              ]}
              onPress={() => void useCurrentLocation()}
            >
              <Text
                style={{ color: anchor?.id === "current" ? c.card : c.ink }}
              >
                Current location
              </Text>
            </Pressable>
            {places.map((place) => (
              <Pressable
                key={place.id}
                style={[
                  s.chip,
                  {
                    borderColor: c.line,
                    backgroundColor: anchor?.id === place.id ? c.green : c.card,
                  },
                ]}
                onPress={() => setAnchor(place)}
              >
                <Text
                  style={{ color: anchor?.id === place.id ? c.card : c.ink }}
                >
                  {place.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.label, { color: c.ink }]}>Transit feed</Text>
          <View style={s.wrap}>
            <Pressable
              style={[
                s.chip,
                {
                  borderColor: c.line,
                  backgroundColor: !feedId ? c.green : c.card,
                },
              ]}
              onPress={() => setFeedId(undefined)}
            >
              <Text style={{ color: !feedId ? c.card : c.ink }}>All feeds</Text>
            </Pressable>
            {feeds.map((feed) => (
              <Pressable
                key={feed.id}
                style={[
                  s.chip,
                  {
                    borderColor: c.line,
                    backgroundColor: feedId === feed.id ? c.green : c.card,
                  },
                ]}
                onPress={() => setFeedId(feed.id)}
              >
                <Text style={{ color: feedId === feed.id ? c.card : c.ink }}>
                  {feed.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.label, { color: c.ink }]}>Radius</Text>
          <View style={s.wrap}>
            {radii.map((value) => (
              <Pressable
                key={value}
                style={[
                  s.chip,
                  {
                    borderColor: c.line,
                    backgroundColor: radius === value ? c.green : c.card,
                  },
                ]}
                onPress={() => setRadius(value)}
              >
                <Text style={{ color: radius === value ? c.card : c.ink }}>
                  {value < 1000 ? `${value} m` : `${value / 1000} km`}
                </Text>
              </Pressable>
            ))}
          </View>
          {!anchor && (
            <Card>
              <Text style={{ color: c.muted }}>
                Use current location or save a place to search offline.
              </Text>
            </Card>
          )}
          {busy && <Text style={{ color: c.muted }}>Searching offline…</Text>}
          {!busy && anchor && !stops.length && (
            <Card>
              <Text style={{ color: c.muted }}>
                No imported stops found within {radius} m. Increase the radius
                or install the correct regional feed.
              </Text>
            </Card>
          )}
          {stops.map((stop) => {
            const feed = feeds.find((item) => item.id === stop.feedId);
            return (
              <Pressable
                key={`${stop.feedId}:${stop.id}`}
                onPress={() =>
                  navigation.navigate("StopRoutes", {
                    feedId: stop.feedId,
                    stopId: stop.id,
                    stopName: stop.name || stop.code || stop.id,
                  })
                }
              >
                <Card>
                  <View style={s.between}>
                    <Text style={[s.title, { color: c.ink, flex: 1 }]}>
                      {stop.name || stop.code || "Unnamed stop"}
                    </Text>
                    <Text style={{ color: c.green, fontWeight: "800" }}>
                      {Math.round(stop.distanceMeters)} m
                    </Text>
                  </View>
                  <Text style={{ color: c.muted }}>
                    {feed?.name ?? stop.feedId}
                    {stop.code ? ` · Stop ${stop.code}` : ""}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  label: { fontSize: 15, fontWeight: "800" },
  title: { fontSize: 18, fontWeight: "800" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
});
