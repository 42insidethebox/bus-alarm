# BusBell

> **Never miss your bus, train, or any recurring departure again.**

## Run it

Requires Node 22.13+ (Node 23 is not supported by React Native 0.86).

```bash
npm install
npm run ios       # or: npm run android
npm run typecheck
```

Use a development build for native notifications and location behavior. Expo Go can preview the interface, but native background behavior should be verified on a physical device.

BusBell is an offline-first mobile application that reminds you before scheduled departures **only when you're at the locations you choose**.

Instead of constantly checking transport apps or remembering complex schedules, BusBell quietly handles recurring timetables in the background and alerts you exactly when it's time to leave.

No accounts.

No ads.

No subscriptions.

Just reliable reminders.

---

## Why?

Many people have recurring transport schedules:

- commuting to work
- university
- school pickups
- weekend buses
- regional trains
- ferries
- shuttle buses

Public transport apps are excellent for realtime information, but they are designed around searching for journeys.

BusBell is designed around **habits**.

You already know your timetable.

You simply don't want to forget it.

---

# Features

## Timetables

Create unlimited recurring schedules.

Examples:

- Bus 47
- Train IC5
- School bus
- Ferry
- Garbage collection
- Medication

Each timetable supports:

- multiple departure times
- weekdays
- weekends
- custom names
- enable/disable

---

## Smart locations

Create places such as:

- Home
- Office
- Parents
- Partner
- Holiday apartment

A timetable can belong to one or many locations.

Places can be captured from GPS or selected with the MapLibre picker. The
picker can show key-free OpenFreeMap streets with attribution, while its
offline geometry view draws the saved radius without making map requests.

Examples

Home

→ Bus reminder

Office

→ Train reminder

Parents

→ Weekend bus

---

## Location-aware reminders

BusBell only reminds you where it makes sense.

Example:

Bus 47

5 minutes before

Only while at Home

No notification if you're already at work.

---

## Multiple reminders

Example

10 minutes before

Soft chime

5 minutes before

Bell

2 minutes before

Strong vibration

---

## Offline first

Core reminders, saved places, manual schedules, OCR and imported GTFS feeds work without internet. The optional street-map view needs a network connection; its offline geometry view does not.

No server required.

No account required.

No cloud dependency for reminders.

---

## Local notifications

Native alarms continue working even when:

- the app is closed
- the phone is locked
- the device is offline

---

## Import timetable

Create schedules by:

- entering times manually
- pasting text
- importing TXT/CSV files
- photographing or choosing timetable images with fully offline OCR

Photo imports preserve spatial columns, recognize common English, Italian, French and German service-day headings, and always require review before alarms are created. Images are never uploaded or retained by BusBell.

Example

```text
06:42
07:12
07:42
08:12
```

### Offline transit feeds (GTFS)

BusBell can also import a standard GTFS ZIP from a transit operator:

1. Open **Timetables → Find nearby transit** or **Settings → Manage transit feeds**.
2. Choose **Import GTFS ZIP** and select the operator's downloaded feed.
3. Search from current GPS position or any user-created saved place.
4. Choose a stop, route and direction, review exact departures, then create the linked timetable.

The archive is size-bounded, path-safe and semantically validated before an atomic SQLite import. Stops, routes, calendars, exceptions, exact frequency service, `24:00+` departures, Home previews and alarms then work offline. Headway-only service with `exact_times=0` is shown as non-exact and never turned into a fabricated clock alarm.

No map or transport API is required. GTFS coordinates are enough for nearby-stop matching; optional downloadable basemaps and an approved regional feed catalog remain later delivery phases.

Saved places and GTFS stops have different jobs: the GTFS stop identifies where
the vehicle departs, while saved places determine where the phone is allowed to
ring. Selecting Home and Work means the timetable is enabled near Home **or**
Work; selecting no place means Anywhere.

---

## Flexible rules

Examples

Bus

Only at Home

Train

Home OR Office

Medication

Anywhere

Laundry

Only while Home

---

## Backup

Export all schedules.

Restore later.

Transfer to another phone.

---

# Privacy

BusBell was built with privacy as a first principle.

- No account
- No ads
- No analytics by default
- No cloud storage
- All data stays on your device

Saved coordinates and geofence membership never leave your phone. Opening the optional street-map view requests visible tiles from OpenFreeMap, which reveals the viewed area and normal network metadata to that provider; offline geometry mode makes no tile requests.

---

# Technology

Frontend

- React Native
- TypeScript

Navigation

- React Navigation

Database

- SQLite

State

- Zustand

Notifications

- Native Android/iOS notifications

Location

- Native Geofencing APIs

Storage

- SQLite

Architecture

- Repository Pattern
- Service Layer
- Feature Modules

---

# Roadmap

## v1

- Manual timetables
- Native notifications
- Multiple locations
- Custom reminder times

## v1.1

- Paste timetable text

## v1.2

- OCR timetable import

## v1.3

- Realtime transport APIs

## v2

- Widgets
- Wear OS
- Apple Watch
- Shared timetable library

---

# Screens

- Home
- Timetables
- Locations
- Rules
- Settings
- About

---

# Philosophy

BusBell intentionally focuses on one problem:

> Remember recurring departures without requiring daily interaction.

No journey planner.

No map is required for alarms or transit matching.

No route search.

No unnecessary complexity.

Just dependable reminders.

---

# License

MIT

---

# Contributing

Issues and pull requests are welcome.

---

# Acknowledgements

Thanks to every commuter who has sprinted after a bus that left 30 seconds too early.
