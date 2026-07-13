import React, { useMemo, useRef, useState } from "react";
import { Alert, SafeAreaView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import {
  Camera,
  CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  StyleSpecification,
} from "@maplibre/maplibre-react-native";
import type { Feature, Polygon } from "geojson";

import { Button, useColors } from "../ui";

const ONLINE_STYLE = "https://tiles.openfreemap.org/styles/positron";
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "offline-background",
      type: "background",
      paint: { "background-color": "#E8EEE9" },
    },
  ],
};

export type MapCoordinates = { latitude: number; longitude: number };

type Props = {
  initial: MapCoordinates;
  radius: number;
  onCancel: () => void;
  onConfirm: (coordinates: MapCoordinates) => void;
};

function radiusPolygon(
  center: MapCoordinates,
  radiusMeters: number,
): Feature<Polygon> {
  const earthRadius = 6_371_000;
  const angularDistance = Math.max(1, radiusMeters) / earthRadius;
  const latitude = (center.latitude * Math.PI) / 180;
  const longitude = (center.longitude * Math.PI) / 180;
  const coordinates: [number, number][] = [];
  for (let index = 0; index <= 64; index += 1) {
    const bearing = (index / 64) * Math.PI * 2;
    const nextLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const nextLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
      );
    coordinates.push([
      (nextLongitude * 180) / Math.PI,
      (nextLatitude * 180) / Math.PI,
    ]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

export function PlaceMapPicker({
  initial,
  radius,
  onCancel,
  onConfirm,
}: Props) {
  const c = useColors();
  const camera = useRef<CameraRef>(null);
  const [draft, setDraft] = useState(initial);
  const [streetMap, setStreetMap] = useState(true);
  const [locating, setLocating] = useState(false);
  const circle = useMemo(() => radiusPolygon(draft, radius), [draft, radius]);

  const recenter = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        return Alert.alert(
          "Location permission needed",
          "You can still pan the map and choose a point manually.",
        );
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setDraft(next);
      camera.current?.easeTo({
        center: [next.longitude, next.latitude],
        zoom: 16,
        duration: 500,
      });
    } catch {
      Alert.alert("Location unavailable", "Pan the map or try again.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: c.paper }]}>
      <View
        style={[s.header, { backgroundColor: c.card, borderColor: c.line }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.heading, { color: c.ink }]}>Choose place on map</Text>
          <Text style={{ color: c.muted }}>
            Move the map until the pin is correct.
          </Text>
        </View>
        <View style={{ width: 92 }}>
          <Button title="Cancel" kind="ghost" onPress={onCancel} />
        </View>
      </View>
      <View style={s.mapWrap}>
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={streetMap ? ONLINE_STYLE : OFFLINE_STYLE}
          androidView="texture"
          touchPitch={false}
          touchRotate={false}
          logo={false}
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          compass
          compassPosition={{ top: 12, right: 12 }}
          onRegionDidChange={(event) => {
            if (!event.nativeEvent.userInteraction) return;
            const [longitude, latitude] = event.nativeEvent.center;
            setDraft({ latitude, longitude });
          }}
        >
          <Camera
            ref={camera}
            initialViewState={{
              center: [initial.longitude, initial.latitude],
              zoom: 16,
            }}
          />
          <GeoJSONSource id="place-radius" data={circle}>
            <Layer
              id="place-radius-fill"
              type="fill"
              paint={{ "fill-color": "#216A4A", "fill-opacity": 0.16 }}
            />
            <Layer
              id="place-radius-line"
              type="line"
              paint={{ "line-color": "#216A4A", "line-width": 2 }}
            />
          </GeoJSONSource>
        </Map>
        <View pointerEvents="none" style={s.centerPin}>
          <Ionicons name="location" color="#D52F45" size={48} />
        </View>
        <View style={s.mapActions}>
          <View style={{ width: 154 }}>
            <Button
              title={streetMap ? "Offline view" : "Load streets"}
              kind="ghost"
              onPress={() => setStreetMap((value) => !value)}
            />
          </View>
          <View style={{ width: 150 }}>
            <Button
              title={locating ? "Locating…" : "My location"}
              kind="ghost"
              disabled={locating}
              onPress={() => void recenter()}
            />
          </View>
        </View>
      </View>
      <View
        style={[s.footer, { backgroundColor: c.card, borderColor: c.line }]}
      >
        <Text style={{ color: c.ink, fontWeight: "800" }}>
          {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)} · {radius} m
          radius
        </Text>
        <Text style={{ color: c.muted, lineHeight: 19 }}>
          Street tiles use OpenFreeMap with attribution and need connectivity
          when not cached. Offline view sends no map requests.
        </Text>
        <Button title="Use this location" onPress={() => onConfirm(draft)} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    minHeight: 88,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: "900" },
  mapWrap: { flex: 1, overflow: "hidden" },
  centerPin: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -24,
    marginTop: -44,
  },
  mapActions: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  footer: { borderTopWidth: 1, padding: 16, gap: 10 },
});
