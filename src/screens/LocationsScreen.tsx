import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Button, Card, Heading, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams, timetableLocationIds } from "../types";

export function LocationsScreen() {
  const c = useColors();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { places, timetables, deletePlace } = useStore();

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub="Places gate the timetables you assign to them.">
        Places
      </Heading>
      <Button
        title="Add a place"
        onPress={() => navigation.navigate("LocationEditor")}
      />
      {places.map((place) => {
        const linked = timetables.filter((timetable) =>
          timetableLocationIds(timetable).includes(place.id),
        );
        return (
          <Card key={place.id}>
            <View style={{ gap: 4 }}>
              <Text style={[s.title, { color: c.ink }]}>{place.name}</Text>
              <Text style={{ color: c.muted }}>
                Within {place.radius} m · {place.latitude.toFixed(4)},{" "}
                {place.longitude.toFixed(4)}
              </Text>
              <Text
                style={{
                  color: linked.length ? c.green : c.muted,
                  fontWeight: "700",
                }}
              >
                {linked.length
                  ? `${linked.length} linked timetable${linked.length === 1 ? "" : "s"}: ${linked
                      .slice(0, 3)
                      .map((item) => item.name)
                      .join(", ")}${linked.length > 3 ? "…" : ""}`
                  : "No linked timetables yet"}
              </Text>
            </View>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Edit / map"
                  kind="ghost"
                  onPress={() =>
                    navigation.navigate("LocationEditor", { id: place.id })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Delete"
                  kind="danger"
                  onPress={() =>
                    Alert.alert(
                      "Delete place?",
                      linked.length
                        ? `${place.name} is linked to ${linked.length} timetable${linked.length === 1 ? "" : "s"}. It will be removed from them. Any timetable with no other selected place will be disabled—not changed to Anywhere.`
                        : place.name,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => void deletePlace(place.id),
                        },
                      ],
                    )
                  }
                />
              </View>
            </View>
            <Button
              title="Create timetable for this place"
              kind="ghost"
              onPress={() =>
                navigation.navigate("TimetableEditor", { placeId: place.id })
              }
            />
          </Card>
        );
      })}
      {!places.length && (
        <Card>
          <Text style={{ color: c.muted }}>
            No places saved. Add Home, Work, a station, or any location where a
            timetable should be allowed to remind you.
          </Text>
        </Card>
      )}
      <Card>
        <Text style={{ color: c.ink, fontWeight: "800" }}>
          Place + timetable rule
        </Text>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          No selected place means Anywhere. Selecting Home and Work means the
          timetable is active near Home OR Work. The GTFS boarding stop remains
          separate: it describes the bus service, while saved places decide
          whether your phone should remind you.
        </Text>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  title: { fontSize: 19, fontWeight: "800" },
  row: { flexDirection: "row", gap: 10 },
});
