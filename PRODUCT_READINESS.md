# BusBell product readiness report

Assessment date: 12 July 2026

## Executive assessment

BusBell is a functional offline-first MVP, not a UI-only prototype. The core create/edit/schedule/notify flow is implemented with SQLite and native local notifications. It is suitable for internal testing, but a technical lead should not approve a public production release yet. The primary release blockers are physical-device reliability testing, continuous background presence behavior, production-grade in-app purchases, onboarding, observability, accessibility validation, and store operations.

Estimated status:

- Personal MVP: 92%
- Public free product: 78%
- Paid product: 35%
- Production release readiness overall: 80% engineering scope implemented, with release gates still open

## Objectives compared with implementation

| Objective | Status | Current implementation | Required for completion |
|---|---|---|---|
| React Native application | Complete | Expo SDK 57, React Native 0.86 and TypeScript | Validate release builds on supported Node 22 |
| Offline-first operation | Complete | SQLite stores schedules, places and settings locally | Add database corruption/recovery testing |
| Create and edit timetables | Complete | Name, times, weekdays, reminders, dates and places are editable | Add end-to-end UI tests |
| Bulk timetable entry | Complete | Pasted times are extracted, normalized, sorted and deduplicated | Add locale-specific parser cases if demanded by users |
| File schedule upload | Complete for TXT/CSV | Native document picker reads TXT, CSV and TSV content | PDF and spreadsheet import remain unsupported |
| Screenshot timetable import | Missing | No OCR pipeline | Add image picker, on-device/cloud OCR decision, review screen and privacy disclosure |
| Multiple reminders | Complete | Multiple lead times such as 10, 5 and 2 minutes are persisted and scheduled | Physical-device sound/vibration testing |
| Weekday recurrence | Complete | Any combination of weekdays | Add alternating-week/monthly rules only if product scope requires them |
| Holiday/date exceptions | Partial | Users can manually exclude ISO dates | Add regional holiday calendars and exception-management UI |
| Pause and resume | Complete | 24-hour pause and immediate resume | Add custom pause-until date |
| Duplicate timetable | Complete | Creates a disabled copy | Add user feedback/toast after duplication |
| Native alarms while app is closed | Implemented, unverified | One-time local notifications are scheduled ahead | Test locked phone, killed app, reboot, battery saver and OEM Android variants |
| iOS notification capacity | Complete | Nearest 60 reminders are scheduled to stay below the 64 limit | Validate replenishment under large datasets |
| Reboot/timezone/DST recovery | Partial | App foreground refresh reconstructs pending alarms | Add explicit timezone-change handling and device test matrix |
| Saved places | Complete | Foreground GPS capture and radius storage | Improve map/radius visualization |
| Only alert while at Home | Partial; release blocker for this claim | Presence is evaluated at launch/foreground refresh | Implement and test native background geofencing or change product promise |
| Backup export | Complete | Versioned JSON copied to clipboard | Add share-sheet/file export |
| Backup restore | Complete | Validated, confirmed transactional replacement | Add restore preview and malformed-large-file testing |
| Dark mode and brand system | Complete | Shared palette, navigation theme, icons and splash | Run visual QA on supported screen sizes |
| Permission handling | Partial | Permission requests, status and system-settings link exist | Add first-run education, denial recovery and onboarding sequence |
| Accessibility | Missing validation | Native controls provide a baseline | Screen-reader, dynamic type, contrast, touch-target and reduced-motion audit |
| Localization | Missing | English strings are embedded in UI | Add localization framework and initial supported languages |
| Free tier | Architecture only | Limits are defined but not enforced while purchases are unavailable | Finalize limits, enforce consistently and test upgrade boundaries |
| Paid lifetime tier | Not operational | Product IDs and secure integration boundary are defined | Create store products, integrate native billing, verify receipts and restore purchases |
| Subscription tier | Out of current scope | No subscription | Decide explicitly whether lifetime purchase is sufficient |
| Analytics | Intentionally absent | Privacy-first, no tracking | Decide on privacy-preserving product analytics with consent, or document no analytics |
| Crash reporting | Missing | No production crash pipeline | Add consent-aware crash reporting and symbol uploads |
| Automated tests | Partial | Parser, date and backup unit tests pass | Add database, scheduler, component and end-to-end tests |
| CI/CD | Missing | Local `npm run check` exists | Add CI for checks, preview builds and protected production release |
| Security/privacy | Partial | Local-only design and privacy document | Threat model backups, purchase verification and dependency/security response process |
| Store branding | Complete | Branded icon, adaptive assets, splash, favicon and brand guide | Produce final store screenshots and preview media |
| Store metadata/legal | Partial | Draft privacy policy and store copy exist | Host privacy URL, add support contact, terms, data safety and age-rating answers |
| Production builds | Configured, not produced | EAS development, preview and production profiles exist | Connect Expo project and signing credentials, then build both platforms |
| App Store/Play submission | Missing | No submission has occurred | Developer accounts, listings, review notes, staged rollout and rollback plan |

## Free and paid product proposal

| Capability | Free | Pro lifetime |
|---|---:|---:|
| Timetables | 2 | Unlimited |
| Saved places | 1 | Unlimited |
| Reminder alerts per timetable | 1 | Multiple |
| Manual and pasted times | Yes | Yes |
| TXT/CSV import | Yes | Yes |
| Backup and restore | Yes | Yes |
| Date exceptions | Basic | Advanced/holiday calendars |
| Screenshot OCR | No | Planned |
| Custom sounds | No | Planned |

The commercial split is a proposal, not currently enforced. A release approver should require server-independent native receipt validation and purchase restoration before enabling the paywall. Existing user data must never be deleted or made inaccessible after entitlement changes.

## Production approval gates

A technical lead should approve release only after all of the following are satisfied:

1. A physical-device matrix passes notification tests on supported iOS and Android versions.
2. The “only at home” claim is either backed by tested background geofencing or removed from release messaging.
3. Store purchases, restoration, cancellation/refund behavior and offline entitlement caching pass sandbox review.
4. Database migration is tested from every previously distributed schema.
5. Accessibility, timezone, daylight-saving, permission-denial and battery-saver scenarios pass.
6. CI runs type checks, unit tests and production-build validation on every release commit.
7. Crash reporting/support processes, privacy URL, terms and store data declarations are complete.
8. Signed production builds are tested through TestFlight and Play internal testing before staged rollout.
9. A rollback/hotfix owner and release-monitoring window are assigned.

## Current verification

- `npm run typecheck`: passing
- `npm test`: 8 tests passing
- Expo public configuration: valid
- Physical-device test evidence: not yet recorded
- Store sandbox purchase evidence: unavailable

Release recommendation: **approve internal preview testing; do not approve public production release yet.**
