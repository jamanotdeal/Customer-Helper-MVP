# iOS — scaffolded, not built

The Xcode project exists and `Info.plist` is configured, but **nothing here has
been compiled or run.** Building iOS needs macOS + Xcode, which was not available
when this was set up. Everything below is what a Mac session has to do.

Do not treat this as "nearly done" — two items under *Blockers* are real feature
work, not configuration.

---

## What is already done

- `npx cap add ios` — Xcode project, `Package.swift`, 6 Capacitor plugins.
- `ios/App/App/Info.plist`:
  - `NSLocationWhenInUseUsageDescription` / `NSLocationAlwaysAndWhenInUseUsageDescription`
  - `UIBackgroundModes` = `remote-notification`, `location`
  - `ITSAppUsesNonExemptEncryption` = false (skips the export prompt per upload)
  - `UIViewControllerBasedStatusBarAppearance` = false
  - Portrait only, matching `public/manifest.json`
- The web layer is platform-agnostic: `src/lib/native.ts` branches on
  `isNativeApp()`, not on Android specifically, so geolocation, haptics, status
  bar, network and the back-button handling work on iOS unchanged.

---

## Blockers before any App Store submission

### 1. Sign in with Apple — required, and it is real work

App Store Review Guideline **4.8**: an app offering a third-party login
(Google, here) must also offer an equivalent privacy-preserving option. Sign in
with Apple satisfies it. This is a code change, not a toggle:

```ts
// src/context/AuthContext.tsx — alongside the existing native Google branch
const provider = new OAuthProvider('apple.com');
provider.addScope('email');
provider.addScope('name');
```

plus the Sign in with Apple capability in Xcode, an Apple service ID, and the
provider enabled in Firebase Authentication. Budget for it properly.

### 2. Account deletion — required on both stores

Guideline **5.1.1(v)**, and the equivalent Play requirement. The app currently
lets *admins* delete users (`fallbackStore.deleteUser`, `src/lib/firebase.ts`)
but has **no self-service path**. Needs an in-app flow plus a public web URL.
Tracked as a shared blocker, not iOS-specific.

### 3. Push is mandatory on iOS, unlike Android

This is the important architectural difference. On Android, new orders reach a
backgrounded app through `DutyForegroundService`, which holds its own Firestore
listener in Java and needs no server. **iOS has no equivalent** — no background
service, no way to keep a listener alive, and no way for an app to launch itself.

So on iOS the *only* path is APNs, which means the server-side sender that
Android does not need becomes a hard prerequisite:

- Deploy a Cloud Function on `onDocumentCreated('notifications/{id}')` that
  resolves the pseudo-target (`all-commuter-helpers` etc.) to FCM tokens and
  calls the FCM HTTP v1 API. See the TODO in `sendFcmPushToTokens`
  (`src/lib/firebase.ts`).
- Upload an APNs auth key to Firebase → Project Settings → Cloud Messaging.
- Add the Push Notifications capability in Xcode.

**Set expectations with the client:** requirement #4 — "the app opens itself when
a new order arrives" — is achievable on Android and **impossible on iOS**. No
API exists for it in any language. The best iOS can do is a time-sensitive
notification the user taps.

---

## Mac session checklist

```bash
BUILD_TARGET=native npm run build
npx cap sync ios
cd ios/App && pod install          # requires macOS
open App.xcworkspace
```

In Xcode:

1. **Signing & Capabilities** → team, bundle id `com.jamanot.app`.
2. Add capabilities: **Push Notifications**, **Background Modes**
   (remote notifications + location), **Sign in with Apple**.
3. Drop `GoogleService-Info.plist` into `App/` (Firebase Console → iOS app).
4. Add the reversed client ID from that plist as a `CFBundleURLTypes` scheme.
5. Replace the launch screen with the white-background, centred-logo design used
   on Android — see `android/app/src/main/res/drawable/splash.xml` and
   `drawable-nodpi/splash_logo.png` for the exact treatment.

## Guideline 4.2 (minimum functionality)

A bundled WebView wrapper is the classic rejection. The build already argues
against that — assets ship in the binary rather than loading a remote URL, and
it uses native Core Location, native haptics, native push and native sign-in.
Worth stating plainly in the review notes rather than leaving the reviewer to
discover it.
