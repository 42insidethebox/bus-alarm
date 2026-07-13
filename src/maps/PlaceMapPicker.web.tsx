import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { Button, useColors } from "../ui";

export type MapCoordinates = { latitude: number; longitude: number };

type Props = {
  initial: MapCoordinates;
  radius: number;
  onCancel: () => void;
  onConfirm: (coordinates: MapCoordinates) => void;
};

export function PlaceMapPicker({
  initial,
  radius,
  onCancel,
  onConfirm,
}: Props) {
  const c = useColors();
  return (
    <SafeAreaView style={[s.page, { backgroundColor: c.paper }]}>
      <View style={{ gap: 12 }}>
        <Text style={[s.title, { color: c.ink }]}>Map picker on mobile</Text>
        <Text style={{ color: c.muted, lineHeight: 21 }}>
          The private MapLibre picker is available in the Android and iOS
          development builds. Your current coordinate remains unchanged on web.
        </Text>
        <Text style={{ color: c.ink }}>
          {initial.latitude.toFixed(5)}, {initial.longitude.toFixed(5)} ·{" "}
          {radius} m
        </Text>
        <Button title="Keep this location" onPress={() => onConfirm(initial)} />
        <Button title="Cancel" kind="ghost" onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "900" },
});
