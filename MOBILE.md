# Jamanot — Mobile App (Capacitor + native Java)

The Android app wraps the existing Next.js UI in Capacitor and moves everything
JavaScript cannot do into native Java. The website is unaffected: the same
codebase builds both, and the native paths are all behind `isNativeApp()`.

- **Package:** `com.jamanot.app`
- **min / target SDK:** 24 / 36
- **Web layer:** static export bundled inside the APK (`webDir: out`)
- **iOS:** scaffolded and configured, **not built** — see `ios/README-ios.md`

---

## Why any of this is native

A browser or PWA cannot do the one thing the business depends on. When the phone
backgrounds the tab, the OS freezes JavaScript, the Firestore `onSnapshot`
listener dies, and a new order is missed. So the background path is Java.

The design avoids needing a server. The web app already writes a
`type: "new_order"` document into `notifications` with a role-scoped
pseudo-target (`all-commuter-helpers` and friends), so the Java service simply
**subscribes to the same query the web listener uses**:

```
Customer submits an order (any device)
  └→ addOrder() → notifications/{id}  { userId: 'all-commuter-helpers', type: 'new_order', orderId }
       ├→ app open    → existing JS onSnapshot → in-app UI              (unchanged)
       └→ app closed  → DutyForegroundService's own Java listener
                          ├→ radius check against SharedPreferences location
                          ├→ role from SharedPreferences  (no JS involved)
                          ├→ helper|store → alert    customer|admin → notification only
                          └→ heads-up notification, and if the user opted in
                             and granted overlay: OrderAlertActivity → MainActivity
```

No FCM send path, no server, no key in the APK.

---

## Requirements, and what actually happens

| # | Requirement | Status |
|---|---|---|
| 1 | White splash, logo only | Done — three surfaces (system splash, Capacitor splash, first paint) all forced to `#FFFFFF` |
| 2 | Native Google login on mobile, web unchanged | Done — Credential Manager returns an ID token, JS calls `signInWithCredential`. Web branch untouched |
| 3 | Pull to refresh | Done — native `SwipeRefreshLayout`, soft refresh with a hard-reload watchdog |
| 4 | Notification + location permissions in Java, background new-order handling, app opens itself | Done on Android, with the caveats below |

### The honest version of #4

- **Android, app minimised or swiped from Recents:** works. The foreground
  service keeps the Firestore listener alive.
- **Android, app brings itself to the foreground:** works *only* if the user
  grants "Display over other apps". That permission is the documented exemption
  to Android 10+'s ban on background activity starts. It is opt-in and off by
  default; without it the user still gets a heads-up notification.
- **Android, user force-stops the app:** nothing runs, by OS design. No app can
  work around this.
- **Aggressive OEMs (Xiaomi/Oppo/Vivo/Huawei):** their battery managers kill
  foreground services Android itself would leave alone. Mitigated four ways
  (below) but never guaranteed — the in-app card tells the user the truth rather
  than pretending.
- **iOS:** an app cannot launch itself. No API exists, in any language. iOS gets
  a notification and nothing more.

---

## Java layer

`android/app/src/main/java/com/jamanot/app/`

| File | Role |
|---|---|
| `JamanotApp.java` | Process-wide init. Firebase, Firestore persistent cache, notification channels — created here because the service and receivers can start the process with no activity. |
| `MainActivity.java` | Plugin registration, splash sequencing, SwipeRefreshLayout, intent deep-link. |
| `core/Prefs.java` | SharedPreferences bridge. **The role-gating mechanism** — Java reads identity from here with no JS running. |
| `core/OrderMatcher.java` | The `targets` predicate + haversine geofence, ported from `firebase.ts` and `pricing.ts`. |
| `core/NotificationHelper.java` | Channels and notification builders. |
| `core/PendingAlerts.java` | Single slot for a cold-start orderId, before the WebView exists. |
| `plugin/JamanotNativePlugin.java` | The one JS↔Java bridge: permissions, duty lifecycle, pull-to-refresh, alerts. |
| `auth/GoogleAuthPlugin.java` | Credential Manager sign-in. |
| `service/DutyForegroundService.java` | The core. Foreground service + native Firestore listener. |
| `service/LocationTracker.java` | Fused location at a battery-sane cadence. |
| `service/JamanotMessagingService.java` | FCM receiver — secondary wake path. |
| `ui/OrderAlertActivity.java` | Full-screen new-order takeover. |
| `receiver/BootReceiver.java` | Restores duty after reboot **and after an app update**. |
| `receiver/RestartServiceReceiver.java` | Restart alarm + the "Go off duty" action. |
| `work/DutyWatchdogWorker.java` | 15-minute WorkManager check against OEM kills. |

### Foreground service type, and why it matters

- **Helper → `location`.** Genuinely needed — the 3.5 km dispatch radius runs on
  the helper's position. It also has no Android 15 runtime cap, and it grants
  background location **without `ACCESS_BACKGROUND_LOCATION`**, which avoids
  Play's heaviest review path entirely.
- **Store → `dataSync`.** Stationary. Subject to the Android 15 6h/24h cap,
  handled in `onTimeout()` with a tap-to-resume notification.

### OEM task-killer mitigations

1. `stopWithTask="false"` + an `onTaskRemoved` restart alarm (inexact — an exact
   alarm would need another restricted permission).
2. `DutyWatchdogWorker`, 15-minute WorkManager check. JobScheduler-backed, so it
   survives most OEM kills.
3. FCM as an independent resurrection channel — Play Services is not killed by
   these managers.
4. An in-app card that deep-links to the vendor's autostart screen.

---

## JS layer

`src/lib/native.ts` is the only file components go through, which is why none of
the 33 components changed. Everything Capacitor is behind a dynamic `import()`
inside an `isNativeApp()` branch — the web bundle grew **2 KB** total.

Other touched files:

- `src/context/AuthContext.tsx` — native login branch, dual sign-out,
  `pushNativeState()` wherever role/mode/location changes.
- `src/app/page-client.tsx` — splash hide, order-alert listener, pull-to-refresh,
  service-worker guard, white status bar.
- `src/app/layout.tsx` — service-worker guard, self-hosted fonts.
- `src/lib/permissions.ts` + `src/components/NativeReadinessCard.tsx` — the
  permission ladder.
- `src/hooks/usePullToRefreshLock.ts` — wired into all 10 map components.

### Offline correctness

Two things were fetched at runtime and would have broken a cold start with no
network in a bundled app:

- Leaflet CSS from `unpkg.com` in **10 components** → now `public/vendor/leaflet/`.
- Google Fonts `@import` in `globals.css` → now `next/font/google`, self-hosted
  at build time (10 woff2 files ship in the APK).

---

## Keeping the geofence in sync

The only genuinely duplicated logic is ~30 lines of haversine and
`min(pickup, delivery)`. It is pinned by shared golden vectors:

```bash
npm run test:geofence                        # TypeScript side
cd android && ./gradlew :app:testDebugUnitTest   # Java side, same JSON
```

`src/lib/__fixtures__/geofence-cases.json` is the source of truth; a Gradle task
copies it onto the test classpath, so there is no second file to update. Change
the algorithm on one side and the other side's test fails.

---

## Build

```bash
npm run mobile:build          # BUILD_TARGET=native next build && cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

npm run build                 # website — unchanged, no static export
```

Release needs `android/keystore.properties` (gitignored):

```properties
storeFile=/absolute/path/to/jamanot-release.jks
storePassword=...
keyAlias=jamanot
keyPassword=...
```

then `./gradlew bundleRelease` (AAB for Play) or `assembleRelease` (sideload APK).

### Toolchain note

Capacitor 8 modules compile at source level 21. This machine has JDK 17 and 25,
so `settings.gradle` enables Gradle's foojay toolchain resolver and
`gradle.properties` points `org.gradle.java.home` at the auto-provisioned JDK 21.
On a machine with a system JDK 21+, that line can be removed.

---

## Before you can run it — needs the Firebase console

The app builds and installs now, but **Google sign-in and the Java Firestore
listener stay dark until this is done**:

1. Firebase Console → add an Android app, package `com.jamanot.app`.
2. Register SHA-1 **and** SHA-256 for the debug keystore, the upload keystore,
   and — after the first Play upload — **Play App Signing's own**. Missing that
   third pair is why sign-in works locally and fails from the Play build.
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
   ```
3. Download `google-services.json` → `android/app/google-services.json`.
   It also generates `default_web_client_id`, which `GoogleAuthPlugin` needs.
4. Enable Google in Authentication → Sign-in method, with a support email set.

---

## Permissions requested (12, deliberately)

`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`,
`RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
`FOREGROUND_SERVICE_DATA_SYNC`, `SYSTEM_ALERT_WINDOW`.

Deliberately **not** requested, each a Play policy-restricted permission the app
does not qualify for or does not need:

| Not requested | Instead |
|---|---|
| `ACCESS_BACKGROUND_LOCATION` | The `location`-type foreground service already covers it |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, which needs no permission |
| `SCHEDULE_EXACT_ALARM` | `setAndAllowWhileIdle` |
| `USE_FULL_SCREEN_INTENT` | Overlay route — since Android 14 FSI is granted only to calling/alarm apps |
| `CAMERA`, `READ_MEDIA_IMAGES` | Images use `<input type="file">` |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | Stripped with `tools:node="remove"` — pulled in transitively by Credential Manager's unused passkey support |

---

## Play Console

- **Foreground service types:** declare Location (primary) and Data sync.
  Justification: *"Helpers must receive nearby delivery requests while the app is
  backgrounded; the service maintains the helper's position for the 3.5 km
  dispatch radius and a realtime listener for new requests. Users start and stop
  it explicitly and can stop it from the notification."*
- **Background location:** answer **No**. Not in the manifest.
- **`SYSTEM_ALERT_WINDOW`:** no declaration form, but expect scrutiny. In the
  review notes say: default off, opt-in behind an explanation screen, used only
  as a background-activity-start exemption, never drawn over other apps, and the
  app is fully functional without it.
- **Data Safety:** collected — name, email, photo, phone, user ID, precise +
  approximate location, order history, FCM token. Shared — none, unless Google
  Analytics / Microsoft Clarity are enabled via `pricingSettings`.
- **Target API 36**, AAB, Play App Signing, privacy policy URL live on the public
  domain (note `trailingSlash` makes the exported path `/privacy/`).

---

## Open items

**Submission blockers** (not started — outside the conversion scope):

1. **Self-service account deletion.** Play and App Store both require in-app
   deletion plus a public web URL for apps that create accounts. Only admins can
   delete users today (`fallbackStore.deleteUser`). This *will* fail review.
2. **Sign in with Apple** — required by Guideline 4.8 because the app offers
   Google login. iOS only.

**Security:**

3. `firestore.rules` is `allow read, write: if true`. Once published, the
   Firebase config is trivially extracted from the APK, making this a public
   read/write database holding every user's phone number and location. Needs
   role-scoped rules before launch. Note `GoogleAuthPlugin` already signs the
   native session in, so the Java listener will keep working when they land.

**Nice to have:**

4. Nine components still call `navigator.geolocation` directly instead of
   `getNativePosition()`. They work — the WebView proxies it — but native GPS is
   more accurate. `HelperDashboard`'s 12-second poll is the one worth migrating
   first, for battery.
5. Map tiles come from `mt1.google.com`, an undocumented endpoint against the
   Maps ToS, and geocoding from Nominatim, whose usage policy will rate-limit a
   fleet hitting it from one region. Budget a move to an official provider.
6. `DOCUMENTATION.md` still describes 3 roles; there are 4.
