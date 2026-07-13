import React, { useEffect } from "react";
import {
  ActivityIndicator,
  AppState,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { migrate } from "./src/database";
import { useStore } from "./src/store";
import { navTheme, palette } from "./src/theme";
import { RootStackParams } from "./src/types";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TimetablesScreen } from "./src/screens/TimetablesScreen";
import { TimetableEditor } from "./src/screens/TimetableEditor";
import { LocationsScreen } from "./src/screens/LocationsScreen";
import { LocationEditor } from "./src/screens/LocationEditor";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { PhotoTimetableImportScreen } from "./src/screens/PhotoTimetableImportScreen";
import { TransitDataScreen } from "./src/screens/TransitDataScreen";
import { NearbyStopsScreen } from "./src/screens/NearbyStopsScreen";
import { StopRoutesScreen } from "./src/screens/StopRoutesScreen";
import { GtfsTimetableReviewScreen } from "./src/screens/GtfsTimetableReviewScreen";

const Stack = createNativeStackNavigator<RootStackParams>(),
  Tabs = createBottomTabNavigator();
function TabNav() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.green,
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={
              (
                {
                  Home: "home",
                  Timetables: "calendar",
                  Places: "location",
                  Settings: "settings",
                } as any
              )[route.name]
            }
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Timetables" component={TimetablesScreen} />
      <Tabs.Screen name="Places" component={LocationsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready),
    load = useStore((s) => s.load),
    refreshAlarms = useStore((s) => s.refreshAlarms),
    dark = useColorScheme() === "dark";
  useEffect(() => {
    migrate().then(load);
  }, [load]);
  useEffect(() => {
    if (!ready) return;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshAlarms();
    });
    return () => listener.remove();
  }, [ready, refreshAlarms]);
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          backgroundColor: dark ? "#111713" : "#216A4A",
        }}
      >
        <ActivityIndicator color="#F4B942" />
        <Text style={{ color: "#F5F7F2", fontSize: 20, fontWeight: "800" }}>
          BusBell
        </Text>
        <Text style={{ color: "#F5F7F2", opacity: 0.8 }}>
          Winding the bell…
        </Text>
      </View>
    );
  return (
    <NavigationContainer theme={navTheme(dark)}>
      <StatusBar style="auto" />
      <Stack.Navigator>
        <Stack.Screen
          name="Tabs"
          component={TabNav}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TimetableEditor"
          component={TimetableEditor}
          options={{ title: "Timetable", presentation: "modal" }}
        />
        <Stack.Screen
          name="PhotoTimetableImport"
          component={PhotoTimetableImportScreen}
          options={{ title: "Import photo", presentation: "modal" }}
        />
        <Stack.Screen
          name="LocationEditor"
          component={LocationEditor}
          options={{ title: "Place", presentation: "modal" }}
        />
        <Stack.Screen
          name="TransitData"
          component={TransitDataScreen}
          options={{ title: "Offline transit" }}
        />
        <Stack.Screen
          name="NearbyStops"
          component={NearbyStopsScreen}
          options={{ title: "Nearby stops" }}
        />
        <Stack.Screen
          name="StopRoutes"
          component={StopRoutesScreen}
          options={{ title: "Choose route" }}
        />
        <Stack.Screen
          name="GtfsTimetableReview"
          component={GtfsTimetableReviewScreen}
          options={{ title: "Review timetable" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
