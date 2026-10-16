import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-domain app identifier — used by Play Store / App Store
  appId: 'com.jamanot.app',
  appName: 'Jamanot',
  appendUserAgent: 'JamanotApp',

  // Capacitor loads the Next.js static export produced by `BUILD_TARGET=native next build`
  webDir: 'out',

  // ─── Server Configuration ─────────────────────────────────────────────────
  server: {
    // https scheme so the WebView origin is https://localhost — required for
    // Firestore, IndexedDB auth persistence and secure-context browser APIs.
    androidScheme: 'https',
    iosScheme: 'https',

    // ─── DEV ONLY: uncomment and set your LAN IP for live reload on device ───
    // url: 'http://192.168.1.100:3000',
    // cleartext: true,
  },

  // ─── Plugin Configuration ─────────────────────────────────────────────────
  plugins: {
    // The launch splash is held until the page has painted AppSplash, which
    // draws the same art (logo, name, slogan — public/splash-art.png) in the
    // same place, so the hand-over cannot be seen. JS releases it through
    // hideNativeSplash() (see page-client.tsx); launchShowDuration is only the
    // cap if that never comes. It used to be 0, which makes the plugin skip the
    // launch splash altogether: Android's own splash then vanished at the
    // WebView's first, still blank, frame — logo, white, then the in-app
    // splash with the slogan.
    SplashScreen: {
      launchShowDuration: 8000,
      launchAutoHide: true,
      launchFadeOutDuration: 150,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },

    // White status bar with dark icons, matching the white AppHeader.
    // Capacitor's Style.Light means "light background" => dark content.
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
  },

  // ─── Android ──────────────────────────────────────────────────────────────
  android: {
    // Enforce HTTPS — every tile/geocode/Firebase URL in the app is already https
    allowMixedContent: false,
    captureInput: false,
    // White so there is no seam between the splash and the WebView's first paint
    backgroundColor: '#ffffff',
    buildOptions: {
      // Play requires an AAB; use `./gradlew assembleRelease` for a sideloadable APK
      releaseType: 'AAB',
    },
  },

  // ─── iOS (scaffold only this pass — building requires a Mac) ───────────────
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#ffffff',
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
