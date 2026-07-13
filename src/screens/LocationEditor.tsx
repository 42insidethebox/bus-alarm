import React, { useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text } from "react-native";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Button, Card, Field, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams } from "../types";
import { id } from "../utils";
import type { MapCoordinates } from "../maps/PlaceMapPicker";

export function LocationEditor({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "LocationEditor">) {
  const c = useColors();
  const { places, coords: deviceCoords, persistPlace } = useStore();
  const old = places.find((place) => place.id === route.params?.id);
  const [name, setName] = useState(old?.name ?? "Home");
  const [radius, setRadius] = useState(String(old?.radius ?? 200));
  const [coords, setCoords] = useState<MapCoordinates | undefined>(
    old ? { latitude: old.latitude, longitude: old.longitude } : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const isExpoGo = Constants.appOwnership === "expo";

  const locate = async () => {
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        return Alert.alert(
          "Location permission needed",
          "Allow location access to save this place, or choose it manually on the map.",
        );
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      Alert.alert(
        "Could not get location",
        "Check Location Services or choose the point on the map.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openMap = () => {
    if (isExpoGo)
      return Alert.alert(
        "Development build required",
        "The private MapLibre picker contains native code and cannot run inside Expo Go. Run `npm run android` or an iOS development build.",
      );
    setMapVisible(true);
  };

  const save = async () => {
    if (!coords)
      return Alert.alert(
        "Choose a location",
        "Use your current position or choose a point on the map.",
      );
    const radiusMeters = Number(radius);
    if (
      !name.trim() ||
      !radiusMeters ||
      radiusMeters < 100 ||
      radiusMeters > 5000
    )
      return Alert.alert(
        "Check place details",
        "Radius must be between 100 and 5000 metres for reliable background detection.",
      );
    await persistPlace({
      id: old?.id ?? id(),
      name: name.trim(),
      latitude: coords.latitude,
      longitude: coords.longitude,
      radius: radiusMeters,
    });
    navigation.goBack();
  };

  const mapInitial = coords ??
    deviceCoords ?? { latitude: 46.5191, longitude: 6.6334 };
  const PlaceMapPicker =
    mapVisible && !isExpoGo
      ? (require("../maps/PlaceMapPicker")
          .PlaceMapPicker as typeof import("../maps/PlaceMapPicker").PlaceMapPicker)
      : null;

  return (
    <>
      <ScrollView contentContainerStyle={s.page}>
        <Field label="Place name" value={name} onChangeText={setName} />
        <Field
          label="Radius in metres"
          value={radius}
          onChangeText={setRadius}
          keyboardType="number-pad"
        />
        <Text style={{ color: c.muted }}>
          The radius is the area where linked timetable reminders are active.
          Use 150–250 m for most places.
        </Text>
        <Card>
          <Text style={{ color: c.ink, fontWeight: "700" }}>
            {coords ? "Location captured" : "No location selected"}
          </Text>
          {coords && (
            <Text style={{ color: c.muted }}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          )}
          <Button
            title={busy ? "Locating…" : "Use my current location"}
            kind="ghost"
            disabled={busy}
            onPress={() => void locate()}
          />
          <Button title="Choose on map" kind="ghost" onPress={openMap} />
        </Card>
        <Card>
          <Text style={{ color: c.ink, fontWeight: "800" }}>
            How this place is used
          </Text>
          <Text style={{ color: c.muted, lineHeight: 20 }}>
            Assign this place to one or more timetables. BusBell schedules those
            reminders only while you are inside this radius. Timetables with no
            selected places work Anywhere.
          </Text>
        </Card>
        <Button title="Save place" onPress={() => void save()} />
      </ScrollView>
      <Modal
        visible={mapVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMapVisible(false)}
      >
        {PlaceMapPicker && (
          <PlaceMapPicker
            initial={mapInitial}
            radius={Math.min(5000, Math.max(100, Number(radius) || 200))}
            onCancel={() => setMapVisible(false)}
            onConfirm={(next) => {
              setCoords(next);
              setMapVisible(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 16 },
});
