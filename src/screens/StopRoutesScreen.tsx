import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Button, Card, Heading, useColors } from "../ui";
import { RootStackParams } from "../types";
import {
  getGtfsFeed,
  getRoutesServingStop,
  GtfsFeedRecord,
  GtfsStopRoute,
} from "../gtfs/database";

function routeLabel(route: GtfsStopRoute) {
  return route.shortName || route.longName || route.routeId;
}

export function StopRoutesScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "StopRoutes">) {
  const c = useColors();
  const [feed, setFeed] = useState<GtfsFeedRecord | null>(null);
  const [routes, setRoutes] = useState<GtfsStopRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getGtfsFeed(route.params.feedId),
      getRoutesServingStop(route.params.feedId, route.params.stopId),
    ]).then(([nextFeed, nextRoutes]) => {
      if (!active) return;
      setFeed(nextFeed);
      setRoutes(nextRoutes);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [route.params.feedId, route.params.stopId]);

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Heading sub={feed?.name ?? "Imported transit data"}>
        {route.params.stopName}
      </Heading>
      <Text style={{ color: c.muted }}>
        Choose the route and direction you board at this stop.
      </Text>
      {loading && <Text style={{ color: c.muted }}>Reading schedules…</Text>}
      {routes.map((item, index) => {
        const label = routeLabel(item);
        const direction = item.stopId
          ? item.headsign || item.longName || "Direction not specified"
          : "Direction not specified";
        return (
          <Card
            key={`${item.routeId}:${item.directionId ?? "x"}:${item.headsign ?? index}`}
          >
            <Text style={[s.route, { color: c.ink }]}>{label}</Text>
            <Text style={[s.direction, { color: c.ink }]}>→ {direction}</Text>
            <Text style={{ color: c.muted }}>
              {item.serviceIds.length} service calendar
              {item.serviceIds.length === 1 ? "" : "s"}
            </Text>
            <Button
              title="Review this schedule"
              kind="ghost"
              onPress={() =>
                navigation.navigate("GtfsTimetableReview", {
                  feedId: item.feedId,
                  stopId: item.stopId,
                  stopName: route.params.stopName,
                  routeId: item.routeId,
                  routeLabel: label,
                  directionId: item.directionId,
                  headsign: item.headsign,
                  serviceIds: item.serviceIds,
                })
              }
            />
          </Card>
        );
      })}
      {!loading && !routes.length && (
        <Card>
          <Text style={{ color: c.muted }}>
            This stop has no boardable scheduled service in the imported feed.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  route: { fontSize: 22, fontWeight: "900" },
  direction: { fontSize: 17, fontWeight: "700" },
});
