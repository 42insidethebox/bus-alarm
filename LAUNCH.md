# BusBell launch checklist

## Engineering

- [x] TypeScript check
- [x] Unit tests for timetable parsing and backup validation
- [x] iOS pending-notification limit handled
- [x] Android notification channel configured
- [x] Backup and restore
- [x] Multiple reminders, excluded dates, pause and duplicate
- [x] TXT/CSV timetable import
- [x] Camera/photo-library offline OCR import with mandatory review
- [x] Multilingual spatial parser and damaged-input warnings
- [x] Safe user-imported GTFS ZIP parser with archive and row limits
- [x] Transactional local GTFS storage, nearby stops, routes and directions
- [x] Linked GTFS Home/notification resolver with calendar exceptions, agency timezones and `24:00+` service
- [ ] Test representative small and large GTFS feeds on physical iPhone and Android devices
- [ ] Add an approved regional feed catalog before claiming automatic worldwide discovery
- [ ] Add optional offline map packs only after source/license and native format validation
- [ ] Run OCR fixture matrix on physical iPhone and Android devices
- [x] Validate Expo native prebuild, module autolinking and iOS CocoaPods integration
- [x] Assemble Android debug APK with GTFS, OCR, location and notification modules
- [x] In-app permission health
- [x] Multi-place background geofence task and permission flow
- [x] Multi-place timetable links with safe deletion behavior
- [x] MapLibre place picker with radius preview and explicit offline view
- [ ] Validate OpenFreeMap failure/caching behavior on physical devices
- [ ] Verify geofence entry/exit on physical iPhone and Android devices
- [ ] Test alarms on a physical iPhone
- [ ] Test alarms on a physical Android phone
- [ ] Verify daylight-saving and timezone changes
- [ ] Add crash reporting only after deciding on privacy/consent

## Store setup

- [ ] Choose the final bundle identifier/package name (currently `com.busbell.app`)
- [ ] Create Apple Developer and Google Play Console apps
- [x] Replace generated icon and splash art with final branding
- [ ] Host `PRIVACY.md` at a public URL and add a support email
- [ ] Capture phone screenshots
- [ ] Complete age rating and data-safety forms
- [ ] Build with `eas build --platform all --profile production`
- [ ] Submit with `eas submit --platform all --profile production`

## Release gate

Do not market place-aware reminders, GTFS import performance, or locked-phone alarms as production-verified until the physical-device matrix above passes. Do not claim automatic worldwide transport coverage: Phase 1 imports user-selected GTFS feeds, while managed regional discovery and optional basemaps remain separate release work.
