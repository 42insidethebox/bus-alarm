import { LogBox } from "react-native";

// Expo Go cannot contain app-specific native sound resources. The development
// and production builds do contain this file; suppress only the expected Expo
// Go preview warning before loading the notification module.
LogBox.ignoreLogs(["expo-notifications: Custom sound"]);

const { registerRootComponent } = require("expo") as typeof import("expo");
require("./src/geofencing");
const App = require("./App").default as typeof import("./App").default;

registerRootComponent(App);
