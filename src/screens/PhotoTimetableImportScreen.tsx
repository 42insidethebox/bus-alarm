import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Field, Heading, useColors } from "../ui";
import { useStore } from "../store";
import { RootStackParams, Timetable } from "../types";
import { dayNames, id } from "../utils";
import {
  normalizeTimeCandidate,
  parseTimetableOcr,
  TimetableDraftGroup,
} from "../ocrParser";
import { recognizeTimetableImage } from "../ocrService";
import { recognitionToParserInput } from "../ocrAdapter";

type Phase =
  "choose" | "acquiring" | "recognizing" | "review" | "saving" | "error";
type ReviewTime = {
  id: string;
  value: string;
  original: string;
  selected: boolean;
  confidence: number;
  corrected: boolean;
};
type ReviewGroup = {
  id: string;
  selected: boolean;
  name: string;
  description: string;
  days: number[];
  daysConfirmed: boolean;
  locationIds: string[] | undefined;
  reminders: string;
  times: ReviewTime[];
  warnings: string[];
};

function toReviewGroup(group: TimetableDraftGroup, index: number): ReviewGroup {
  return {
    id: group.id,
    selected: true,
    name: group.heading?.text
      ? `Imported · ${group.heading.text}`
      : `Imported timetable ${index + 1}`,
    description: group.heading?.ambiguous
      ? `Review service label: ${group.heading.text}`
      : "Imported from timetable photo",
    days: group.days ?? [],
    daysConfirmed: false,
    locationIds: undefined,
    reminders: "5",
    times: group.times.map((time, i) => ({
      id: `${group.id}-${i}`,
      value: time.value,
      original: time.originalText,
      selected: true,
      confidence: time.confidence,
      corrected: time.corrected,
    })),
    warnings: group.warningCodes,
  };
}

export function PhotoTimetableImportScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "PhotoTimetableImport">) {
  const c = useColors(),
    { places, persistTimetables } = useStore();
  const [phase, setPhase] = useState<Phase>("choose"),
    [imageUri, setImageUri] = useState<string>(),
    [groups, setGroups] = useState<ReviewGroup[]>([]),
    [rawText, setRawText] = useState(""),
    [globalWarnings, setGlobalWarnings] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false),
    [showRaw, setShowRaw] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true),
    launched = useRef(false);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const updateGroup = (groupId: string, change: Partial<ReviewGroup>) =>
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId ? { ...group, ...change } : group,
      ),
    );
  const acquire = async (source: "camera" | "library") => {
    setPhase("acquiring");
    setError("");
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          setPhase("choose");
          return Alert.alert(
            "Camera permission needed",
            "Allow camera access to photograph a timetable.",
            [
              { text: "Cancel" },
              {
                text: "Open settings",
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
        }
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 1,
            });
      if (result.canceled || !result.assets[0]) {
        setPhase("choose");
        return;
      }
      const asset = result.assets[0],
        largest = Math.max(asset.width ?? 0, asset.height ?? 0),
        action =
          largest > 2400
            ? [
                {
                  resize:
                    (asset.width ?? 0) >= (asset.height ?? 0)
                      ? { width: 2400 }
                      : { height: 2400 },
                },
              ]
            : [];
      const prepared = await manipulateAsync(asset.uri, action, {
        compress: 0.95,
        format: SaveFormat.JPEG,
      });
      if (!mounted.current) return;
      setImageUri(prepared.uri);
      setPhase("recognizing");
      const recognized = await recognizeTimetableImage(prepared.uri);
      if (!mounted.current) return;
      const parsed = parseTimetableOcr(recognitionToParserInput(recognized));
      if (!parsed.groups.length) {
        setRawText(recognized.text);
        setError(
          "No valid departure times were recognized. Try a straighter, brighter photo or enter the times manually.",
        );
        setPhase("error");
        return;
      }
      setRawText(recognized.text);
      setGroups(parsed.groups.map(toReviewGroup));
      setGlobalWarnings(parsed.warnings.map((w) => w.message));
      setReviewed(false);
      setPhase("review");
    } catch (reason) {
      if (!mounted.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "The timetable could not be read.",
      );
      setPhase("error");
    }
  };
  useEffect(() => {
    if (!launched.current && route.params?.launch) {
      launched.current = true;
      void acquire(route.params.launch);
    }
  }, [route.params?.launch]);
  const toggleDay = (group: ReviewGroup, day: number) =>
    updateGroup(group.id, {
      days: group.days.includes(day)
        ? group.days.filter((d) => d !== day)
        : [...group.days, day].sort(),
    });
  const updateTime = (
    groupId: string,
    timeId: string,
    change: Partial<ReviewTime>,
  ) =>
    setGroups((items) =>
      items.map((group) =>
        group.id !== groupId
          ? group
          : {
              ...group,
              times: group.times.map((time) =>
                time.id === timeId ? { ...time, ...change } : time,
              ),
            },
      ),
    );
  const save = async () => {
    const selected = groups.filter((group) => group.selected);
    if (!selected.length) return Alert.alert("Select a timetable");
    for (const group of selected) {
      if (!group.name.trim())
        return Alert.alert(
          "Name required",
          "Every selected timetable needs a name.",
        );
      if (!group.daysConfirmed || !group.days.length)
        return Alert.alert(
          "Review service days",
          `Confirm the days for “${group.name}”.`,
        );
      if (group.locationIds === undefined)
        return Alert.alert(
          "Choose a place",
          `Choose Anywhere or a saved place for “${group.name}”.`,
        );
      const chosen = group.times.filter((t) => t.selected);
      if (!chosen.length)
        return Alert.alert(
          "Select departure times",
          `“${group.name}” needs at least one departure.`,
        );
      if (chosen.some((t) => !normalizeTimeCandidate(t.value)))
        return Alert.alert(
          "Correct invalid times",
          `“${group.name}” contains an invalid selected time.`,
        );
      const reminders = [
        ...new Set((group.reminders.match(/\d+/g) ?? []).map(Number)),
      ];
      if (!reminders.length || reminders.some((n) => n < 0 || n > 180))
        return Alert.alert(
          "Invalid reminder",
          "Use values from 0–180 minutes.",
        );
    }
    if (!reviewed)
      return Alert.alert(
        "Review required",
        "Confirm that you reviewed the times, service days and place.",
      );
    setPhase("saving");
    const items: Timetable[] = selected.map((group) => {
      const alertMinutesList = [
          ...new Set((group.reminders.match(/\d+/g) ?? []).map(Number)),
        ].sort((a, b) => b - a),
        times = [
          ...new Set(
            group.times
              .filter((t) => t.selected)
              .map((t) => normalizeTimeCandidate(t.value)!.value),
          ),
        ].sort();
      return {
        id: id(),
        name: group.name.trim(),
        description: group.description.trim(),
        source: "photo",
        times,
        days: group.days,
        alertMinutes: alertMinutesList.at(-1)!,
        alertMinutesList,
        excludedDates: [],
        pausedUntil: null,
        enabled: true,
        locationIds: group.locationIds!,
        locationId: group.locationIds![0] ?? null,
      };
    });
    try {
      await persistTimetables(items);
      navigation.goBack();
    } catch {
      setError(
        "The recognized timetable could not be saved. Your existing data was not changed.",
      );
      setPhase("error");
    }
  };
  if (phase === "choose" || phase === "acquiring")
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Heading sub="Images stay on this device. Nothing is uploaded.">
          Import timetable photo
        </Heading>
        <Card>
          <Text style={[s.title, { color: c.ink }]}>
            Photograph a timetable
          </Text>
          <Text style={{ color: c.muted, lineHeight: 21 }}>
            Fill the frame, keep the paper straight and avoid glare. Torn or
            missing content will be flagged, never invented.
          </Text>
          <Button
            title={phase === "acquiring" ? "Opening…" : "Take photo"}
            disabled={phase === "acquiring"}
            onPress={() => void acquire("camera")}
          />
          <Button
            title="Choose from photo library"
            kind="ghost"
            disabled={phase === "acquiring"}
            onPress={() => void acquire("library")}
          />
        </Card>
        <Button
          title="Enter manually instead"
          kind="ghost"
          onPress={() => navigation.replace("TimetableEditor")}
        />
      </ScrollView>
    );
  if (phase === "recognizing")
    return (
      <View style={s.center}>
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={s.preview}
            resizeMode="contain"
          />
        )}
        <Text style={[s.title, { color: c.ink }]}>
          Reading timetable on-device…
        </Text>
        <Text style={{ color: c.muted, textAlign: "center" }}>
          Finding times, columns and service-day headings.
        </Text>
      </View>
    );
  if (phase === "error")
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Heading>Import needs attention</Heading>
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={s.preview}
            resizeMode="contain"
          />
        )}
        <Card>
          <Text style={{ color: c.danger, lineHeight: 21 }}>{error}</Text>
          {rawText && (
            <Text style={{ color: c.muted }} numberOfLines={8}>
              {rawText}
            </Text>
          )}
        </Card>
        <Button
          title="Try another photo"
          onPress={() => {
            setPhase("choose");
            setImageUri(undefined);
          }}
        />
        <Button
          title="Enter manually"
          kind="ghost"
          onPress={() => navigation.replace("TimetableEditor")}
        />
        {error.includes("development build") && (
          <Text style={{ color: c.muted, textAlign: "center" }}>
            Build with `npx expo run:android` or `npx expo run:ios`; Expo Go
            cannot load the offline OCR module.
          </Text>
        )}
      </ScrollView>
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        <Heading sub="No alarms are created until you confirm.">
          Review import
        </Heading>
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={s.preview}
            resizeMode="contain"
          />
        )}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Button
              title="Retake"
              kind="ghost"
              onPress={() => void acquire("camera")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Other photo"
              kind="ghost"
              onPress={() => void acquire("library")}
            />
          </View>
        </View>
        {globalWarnings.length > 0 && (
          <Card>
            <Text style={[s.title, { color: c.ink }]}>Parser notes</Text>
            {globalWarnings.slice(0, 6).map((warning, i) => (
              <Text key={`${warning}-${i}`} style={{ color: c.muted }}>
                • {warning}
              </Text>
            ))}
          </Card>
        )}
        {groups.map((group, index) => (
          <Card key={group.id}>
            <View style={s.between}>
              <Text style={[s.title, { color: c.ink }]}>
                Timetable {index + 1}
              </Text>
              <Switch
                value={group.selected}
                onValueChange={(selected) =>
                  updateGroup(group.id, { selected })
                }
                trackColor={{ true: c.green }}
              />
            </View>
            {group.selected && (
              <>
                <Field
                  label="Name"
                  value={group.name}
                  onChangeText={(name) => updateGroup(group.id, { name })}
                />
                <Field
                  label="Description"
                  value={group.description}
                  onChangeText={(description) =>
                    updateGroup(group.id, { description })
                  }
                />
                <Text style={[s.label, { color: c.ink }]}>Service days</Text>
                <View style={s.wrap}>
                  {dayNames.map((day, i) => (
                    <Pressable
                      key={day}
                      onPress={() => toggleDay(group, i)}
                      style={[
                        s.chip,
                        {
                          borderColor: c.line,
                          backgroundColor: group.days.includes(i)
                            ? c.green
                            : c.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: group.days.includes(i) ? c.card : c.ink,
                          fontWeight: "700",
                        }}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={s.between}>
                  <Text style={{ color: c.ink, flex: 1 }}>
                    I reviewed these service days
                  </Text>
                  <Switch
                    value={group.daysConfirmed}
                    onValueChange={(daysConfirmed) =>
                      updateGroup(group.id, { daysConfirmed })
                    }
                    trackColor={{ true: c.green }}
                  />
                </View>
                <Text style={[s.label, { color: c.ink }]}>Departure times</Text>
                {group.times.map((time) => (
                  <View key={time.id} style={s.timeRow}>
                    <Switch
                      value={time.selected}
                      onValueChange={(selected) =>
                        updateTime(group.id, time.id, { selected })
                      }
                      trackColor={{ true: c.green }}
                    />
                    <TextInput
                      value={time.value}
                      onChangeText={(value) =>
                        updateTime(group.id, time.id, { value })
                      }
                      style={[
                        s.timeInput,
                        {
                          color: c.ink,
                          borderColor: normalizeTimeCandidate(time.value)
                            ? c.line
                            : c.danger,
                          backgroundColor: c.card,
                        },
                      ]}
                      keyboardType="numbers-and-punctuation"
                    />
                    {(time.corrected || time.confidence < 0.75) && (
                      <Text style={{ color: c.amber, fontWeight: "800" }}>
                        Review
                      </Text>
                    )}
                  </View>
                ))}
                <Button
                  title="Add time manually"
                  kind="ghost"
                  onPress={() =>
                    updateGroup(group.id, {
                      times: [
                        ...group.times,
                        {
                          id: id(),
                          value: "",
                          original: "",
                          selected: true,
                          confidence: 1,
                          corrected: false,
                        },
                      ],
                    })
                  }
                />
                <Field
                  label="Reminder minutes"
                  value={group.reminders}
                  onChangeText={(reminders) =>
                    updateGroup(group.id, { reminders })
                  }
                  placeholder="10, 5"
                />
                <Text style={[s.label, { color: c.ink }]}>Relevant places</Text>
                <Text style={{ color: c.muted }}>
                  Select one or more. Any selected place can activate it.
                </Text>
                <View style={s.wrap}>
                  <Pressable
                    onPress={() => updateGroup(group.id, { locationIds: [] })}
                    style={[
                      s.chip,
                      {
                        borderColor: c.line,
                        backgroundColor:
                          group.locationIds?.length === 0 ? c.green : c.card,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: group.locationIds?.length === 0 ? c.card : c.ink,
                      }}
                    >
                      Anywhere
                    </Text>
                  </Pressable>
                  {places.map((place) => (
                    <Pressable
                      key={place.id}
                      onPress={() => {
                        const current = group.locationIds ?? [];
                        updateGroup(group.id, {
                          locationIds: current.includes(place.id)
                            ? current.filter((placeId) => placeId !== place.id)
                            : [...current, place.id],
                        });
                      }}
                      style={[
                        s.chip,
                        {
                          borderColor: c.line,
                          backgroundColor: group.locationIds?.includes(place.id)
                            ? c.green
                            : c.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: group.locationIds?.includes(place.id)
                            ? c.card
                            : c.ink,
                        }}
                      >
                        {place.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  title="Create another place"
                  kind="ghost"
                  onPress={() => navigation.navigate("LocationEditor")}
                />
                {group.warnings.length > 0 && (
                  <Text style={{ color: c.amber }}>
                    Review required: {group.warnings.join(", ")}
                  </Text>
                )}
              </>
            )}
          </Card>
        ))}
        <Pressable onPress={() => setReviewed((value) => !value)}>
          <Card style={{ borderColor: reviewed ? c.green : c.line }}>
            <View style={s.between}>
              <Text style={{ color: c.ink, flex: 1, fontWeight: "700" }}>
                I reviewed every selected time, service day and place.
              </Text>
              <Switch
                value={reviewed}
                onValueChange={setReviewed}
                trackColor={{ true: c.green }}
              />
            </View>
          </Card>
        </Pressable>
        <Button
          title={
            phase === "saving"
              ? "Saving…"
              : `Import ${groups.filter((g) => g.selected).length} timetable${groups.filter((g) => g.selected).length === 1 ? "" : "s"}`
          }
          disabled={phase === "saving"}
          onPress={() => void save()}
        />
        <Button
          title={showRaw ? "Hide recognized text" : "Show recognized text"}
          kind="ghost"
          onPress={() => setShowRaw((value) => !value)}
        />
        {showRaw && (
          <Card>
            <Text selectable style={{ color: c.muted, lineHeight: 20 }}>
              {rawText}
            </Text>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  center: {
    flex: 1,
    padding: 24,
    gap: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: 18,
    backgroundColor: "#111",
  },
  title: { fontSize: 19, fontWeight: "800" },
  label: { fontSize: 15, fontWeight: "800" },
  row: { flexDirection: "row", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 17,
    fontWeight: "700",
  },
});
