# Offline Transit and Map Packs

Status: proposed architecture  
Last updated: 12 July 2026

## Decision summary

BusBell should support automatic nearby public-transport discovery through downloadable regional transit packs. Scheduled service comes from GTFS Static feeds and is parsed into the existing local SQLite database. Maps remain optional: GTFS stop coordinates and route shapes provide the core location experience without a basemap, while full offline maps are supplied only through sources that explicitly permit offline distribution or by user-imported files.

The target experience is:

```text
Device location
    -> match a regional catalog entry
    -> offer transit and optional map downloads
    -> parse and index the data locally
    -> show nearby stops, routes, directions and schedules
    -> let the user create a BusBell timetable
    -> continue working without internet
```

No BusBell account, runtime API key or cloud scheduler is required.

## Product objectives

- Suggest transit data relevant to the user's current or saved locations.
- Discover nearby stops, routes and scheduled departures automatically.
- Work offline after the user downloads a regional pack.
- Keep GPS coordinates, searches, selections and alarms on-device.
- Prefer open, operator-published machine-readable data over OCR.
- Preserve manual entry, TXT/CSV import and photo OCR as fallbacks.
- Avoid depending on a paid mapping or transport API for core behavior.
- Make licensing, attribution, freshness and storage usage visible.

## Non-goals for the first release

- Worldwide guaranteed coverage.
- Realtime delay or cancellation data for every operator.
- Journey planning, transfers, fares or turn-by-turn navigation.
- Bundling a whole-country or worldwide map in the application binary.
- Bulk downloading tiles from OpenStreetMap's public tile servers.
- Silently modifying user-created timetables when a feed changes.

## Data-source priority

BusBell should choose the highest-quality available source:

1. Official or authorized GTFS Static feed.
2. User-imported GTFS ZIP.
3. Structured CSV, JSON, Markdown or HTML.
4. Digital PDF extraction.
5. Photo/screenshot OCR with mandatory review.
6. Manual timetable entry.

GTFS is the preferred source because it standardizes agencies, stops, routes, trips, stop times, calendars, date exceptions, frequencies and route geometry.

## Regional catalog

BusBell ships with a small catalog containing geographic metadata and source references, not the full regional datasets.

```ts
type RegionalCatalogEntry = {
  id: string;
  name: string;
  countryCode: string;
  bounds: [west: number, south: number, east: number, north: number];
  polygonAsset?: string;
  transitFeeds: TransitFeedDescriptor[];
  mapPacks: MapPackDescriptor[];
};

type TransitFeedDescriptor = {
  id: string;
  name: string;
  sourceUrl: string;
  sourcePageUrl: string;
  license: string;
  attribution: string;
  expectedFormat: 'gtfs';
};
```

The catalog can be generated during BusBell releases from public feed directories such as Mobility Database. Runtime clients should not require a catalog API account. Each feed still requires an individual license and redistribution review; inclusion in a directory does not automatically grant redistribution rights.

### Location matching

The bundled catalog is queried locally:

```ts
const suggestedRegions = catalog.filter((region) =>
  contains(region.bounds, deviceCoordinates)
);
```

Precise polygons may refine bounding-box matches where regions overlap. Location matching must not transmit the user's coordinates.

## Regional-pack user experience

```text
BusBell found: Lausanne, Switzerland

Available offline data

[x] Stops and scheduled timetables     24 MB
[ ] Route geometry                     included
[ ] Basic offline map                  82 MB

Transport data valid until: 14 December
Wi-Fi-only download: enabled

[ Download regional pack ]
```

Requirements:

- Show download size before starting.
- Ask for confirmation; never download large packs automatically.
- Support cancellation, retry and deletion.
- Verify the artifact checksum before importing.
- Record source, version, download time, validity and attribution.
- Warn before cellular downloads.
- Continue using the previous valid pack if an update fails.

## GTFS ingestion

### Input

The app downloads a GTFS ZIP directly from the publisher or opens a user-selected ZIP. It validates file names, maximum sizes, row counts and relationships before committing anything to the production database.

Expected tables include:

```text
agency.txt
stops.txt
routes.txt
trips.txt
stop_times.txt
calendar.txt and/or calendar_dates.txt
frequencies.txt (optional)
shapes.txt (optional)
feed_info.txt (optional)
```

### Local schema

GTFS data should live in separate namespaced tables so imported feeds can be replaced atomically:

```text
gtfs_feeds
gtfs_agencies
gtfs_stops
gtfs_routes
gtfs_trips
gtfs_stop_times
gtfs_calendars
gtfs_calendar_dates
gtfs_frequencies
gtfs_shapes
```

Recommended indexes:

```sql
CREATE INDEX gtfs_stops_location ON gtfs_stops(feed_id, latitude, longitude);
CREATE INDEX gtfs_stop_times_stop ON gtfs_stop_times(feed_id, stop_id, departure_seconds);
CREATE INDEX gtfs_trips_route ON gtfs_trips(feed_id, route_id, service_id);
CREATE INDEX gtfs_calendar_service ON gtfs_calendars(feed_id, service_id);
```

Import into staging tables, validate, then swap the active feed inside one transaction. A corrupt or interrupted update must never remove the last working dataset.

### Service-day time

GTFS times may exceed `24:00:00` to associate after-midnight departures with the previous service day. BusBell must not immediately collapse these into ordinary wall-clock times.

```ts
type ServiceTime = {
  secondsAfterServiceDayStart: number;
  wallHour: number;
  wallMinute: number;
  serviceDayOffset: number;
};
```

Examples:

```text
23:30:00 -> day offset 0, wall time 23:30
24:30:00 -> day offset 1, wall time 00:30
25:15:00 -> day offset 1, wall time 01:15
```

The alarm engine must retain the originating service date when scheduling these departures.

## Nearby transit discovery

After ingestion, the device performs all discovery locally:

1. Obtain the current position or use a saved BusBell place.
2. Query stops inside a configurable radius.
3. Resolve trips serving those stops.
4. Group by route, direction and headsign.
5. Resolve active service using weekly calendars and date exceptions.
6. Show the next departures and recurring schedule patterns.

```text
120 m  Lausanne, Chauderon
       Bus 2 -> Desert
       Bus 3 -> Bellevaux
       Bus 21 -> Blecherette

340 m  Lausanne-Flon
       M1 -> Renens
       M2 -> Croisettes
```

The user explicitly selects:

- Stop
- Route
- Direction/headsign
- Relevant BusBell place or Anywhere
- Reminder lead times
- Whether updates should track future feed changes

## BusBell timetable association

An automatically created timetable retains the GTFS identity alongside user settings:

```ts
type GtfsTimetableSource = {
  feedId: string;
  routeId: string;
  stopId: string;
  directionId?: number;
  headsign?: string;
  serviceIds: string[];
  importedFeedVersion: string;
};
```

User-owned fields remain independent:

- Display name and description
- Reminder lead times
- Place association
- Enabled/paused state
- Manual exclusions

Feed refreshes may propose departure changes but must not overwrite these settings. Removed routes or stops are marked unavailable rather than deleting the timetable.

## Offline map strategy

### Map-free default

Maps are not required for the core product. GTFS supplies stop coordinates and may supply route shapes. BusBell can render a lightweight network view containing:

- Current/saved place marker
- Nearby stop markers
- Selected route shape
- Distance and radius information

This remains fully offline and avoids tile licensing, download size and rendering complexity.

### Optional full map

When a visual basemap is wanted, use MapLibre Native with a local offline-region database and an embedded style, glyphs and sprites. Supported sources are:

1. A region downloaded from a provider whose license explicitly permits offline storage.
2. A BusBell-produced regional vector pack derived from appropriately licensed data.
3. A user-imported compatible offline database.
4. A user-configured self-hosted tile service with optional local caching consistent with that service's terms.

MapLibre can download offline packs and merge a sideloaded offline-region database. Exact file compatibility must be proven on both native platforms before promising arbitrary MBTiles or PMTiles import.

### OpenStreetMap constraints

OpenStreetMap geographic data can be used under its license with attribution. The public `tile.openstreetmap.org` service must not be used for region prefetching or offline downloads. BusBell therefore must never point its offline-download feature at the public OSM raster tile servers.

Required attribution remains visible in the map and legal information:

```text
© OpenStreetMap contributors
Transport data © respective providers
```

## Pack manifest and integrity

Every artifact uses a signed or checksum-verified manifest:

```ts
type RegionalPackManifest = {
  schemaVersion: number;
  packId: string;
  regionId: string;
  version: string;
  createdAt: string;
  validUntil?: string;
  sizeBytes: number;
  sha256: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  bounds: [number, number, number, number];
};
```

Validation requirements:

- HTTPS downloads only, except explicit user-configured LAN sources.
- Maximum compressed and expanded sizes.
- ZIP path-traversal protection.
- Expected-table allowlist.
- Row and text-field limits.
- Checksum validation before parsing.
- Transactional activation after semantic validation.
- Clear deletion of temporary and superseded artifacts.

## Freshness and update policy

Static transit data expires. BusBell stores:

- Feed download time
- Feed version or checksum
- Service date range
- Publisher URL
- Last successful update check
- Last import error

User-facing states:

```text
Current     Feed is valid and recently checked
Stale       Feed may still work, but an update is recommended
Expired     Service dates no longer cover today
Unavailable Publisher URL failed; previous data remains installed
```

Default behavior:

- Work indefinitely with installed data.
- Check metadata only when online.
- Prefer Wi-Fi for feed and map updates.
- Ask before large downloads.
- Never block manual timetables because a feed expired.
- Never silently delete data after a failed refresh.

## Realtime data

GTFS Realtime is optional and separate from offline scheduled service. Some publishers expose it openly; others require API keys or contractual access.

V1 behavior:

- Scheduled local alarms never require realtime data.
- Realtime can adjust the displayed next departure while online.
- An unavailable realtime feed falls back to the static schedule.
- BusBell must never market worldwide realtime coverage.

## Licensing model

Each transit feed and map pack is reviewed independently. The catalog stores license and attribution metadata, and the application exposes it in a Data Sources screen.

Before enabling a managed download, confirm:

- Automated download is permitted.
- Local storage is permitted.
- Redistribution is permitted if BusBell mirrors the file.
- Required attribution is displayed.
- Share-alike/database obligations are understood.
- Retention or update requirements are followed.

Direct publisher downloads reduce redistribution risk but do not eliminate license obligations.

## Cost model

Core automatic transport discovery can remain serverless:

| Capability | Zero-server-cost approach |
|---|---|
| Regional detection | Bundled catalog and local geometry |
| Scheduled transit | Direct publisher GTFS download |
| Nearby stops | Local SQLite spatial search |
| Routes and directions | Local GTFS relationships |
| Route drawing | GTFS `shapes.txt` |
| Notifications | Native local notifications |
| Basic place view | Local geometry without basemap |
| Full offline map | User import or licensed direct download |

Managed BusBell-hosted map packs create bandwidth, build and storage costs. They should not be described as cost-free infrastructure. A no-server product can instead use publisher downloads and user-provided map files.

## Coverage and fallback

Automatic discovery is available only where usable transit data exists:

```text
Official GTFS available
    -> automatic nearby stop/route/schedule flow

No GTFS, structured document available
    -> structured import

Printed or image timetable available
    -> offline OCR and mandatory review

No usable source
    -> manual entry
```

Coverage status must be explicit. BusBell should say “No compatible feed found for this region” rather than implying that no transit exists.

## Delivery phases

### Phase 1: user-imported GTFS

- Select a GTFS ZIP from device storage.
- Validate and import into staging tables.
- Search stops near current location and saved places.
- Select route, stop and direction.
- Create a linked BusBell timetable.
- Display data source, validity and attribution.

### Phase 2: automatic regional discovery

- Generate and bundle a feed catalog.
- Match current/saved locations to catalog entries.
- Download directly from approved publishers.
- Implement feed refresh and stale states.
- Add storage management.

### Phase 3: geometry-first map experience

- Render stops and GTFS route shapes without a basemap.
- Display place radius and stop distance.
- Add accessible list alternatives for every map interaction.

### Phase 4: optional offline basemaps

- Integrate MapLibre Native.
- Validate offline database compatibility on iOS and Android.
- Implement licensed regional downloads and user import.
- Add attribution, pack deletion and storage quotas.

### Phase 5: optional realtime

- Add provider-specific GTFS Realtime sources.
- Apply delays/cancellations only while online.
- Preserve static-schedule fallback.

## Production acceptance criteria

### GTFS import

- Imports representative small and large feeds without UI blocking.
- Rejects malformed, oversized and path-traversal ZIPs safely.
- Correctly resolves weekly calendars and date exceptions.
- Correctly handles service times beyond 24:00.
- Keeps the previous feed active after any failed update.
- Produces deterministic nearby-stop and departure results.
- Preserves user settings across feed refreshes.

### Location and privacy

- Catalog matching occurs locally.
- No device coordinates are sent to catalog or feed providers beyond ordinary direct-download network metadata.
- Location denial leaves manual import fully functional.
- Regional downloads require explicit consent.

### Maps

- Core stop/route discovery works with no basemap installed.
- Offline maps make no network request while offline mode is active.
- Attribution remains visible.
- Pack deletion reclaims storage.
- Public OSM tile endpoints are never used for bulk/offline download.

### Reliability

- Stale and expired feeds are clearly identified.
- Downloads resume or retry without corrupting active data.
- Checksums and schema versions are enforced.
- Background alarms continue to use the last confirmed schedule during update failures.
- Physical iOS and Android test matrices cover installation, update, expiration and removal.

## Open decisions

- Initial countries/regions and feed licenses to support.
- Maximum automatic feed download size.
- Whether feeds are retained in full or reduced to selected areas/routes.
- Spatial-index approach in Expo SQLite.
- MapLibre offline database format and cross-platform portability.
- Approved offline-map data/build pipeline.
- Catalog update cadence and signing mechanism.
- Free versus Pro limits for managed regional downloads.
- Whether realtime support belongs in V1 or a later release.

## Recommendation

Build user-imported GTFS and nearby-stop discovery before adding a full basemap. GTFS alone provides automatic stops, lines, directions, schedules and route shapes, delivering most of the user value with less storage, licensing risk and native rendering complexity. Add managed regional discovery next, and treat full offline maps as an optional enhancement rather than a prerequisite for automatic timetable setup.
