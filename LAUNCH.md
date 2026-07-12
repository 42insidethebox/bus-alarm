# BusBell launch checklist

## Engineering

- [x] TypeScript check
- [x] Unit tests for timetable parsing and backup validation
- [x] iOS pending-notification limit handled
- [x] Android notification channel configured
- [x] Backup and restore
- [x] Multiple reminders, excluded dates, pause and duplicate
- [x] TXT/CSV timetable import
- [x] In-app permission health
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

Do not market place-aware reminders as continuous background geofencing yet. The current version evaluates the saved-place radius when alarms are refreshed, including app launch/foreground. Timetables set to “Anywhere” are the reliability-first default.
