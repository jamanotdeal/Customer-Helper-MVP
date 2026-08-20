import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Unique reverse-domain app identifier — used by Play Store / App Store
  appId: 'com.jamanot.app',
  appName: 'Jamanot',

  // Capacitor loads your Next.js static export from /out
  webDir: 'out',

  // ─── Server Configuration ─────────────────────────────────────────────────
  server: {
    // Use https scheme so Firebase Auth, Firestore and other HTTPS APIs work
    androidScheme: 'https',
    iosScheme: 'https',

    // ─── DEV ONLY: Uncomment and set your local IP to enable live reload on device ───
    // url: 'http://192.168.1.100:3000',
    // cleartext: true,
    // ─────────────────────────────────────────────────────────────────────────
  },

  // ─── Plugin Configuration ─────────────────────────────────────────────────
  plugins: {
    // Splash screen — shown while the app loads
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#059669',   // emerald-600 — matches brand
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    // Push Notifications — native FCM integration
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Status Bar — match the brand color
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#059669',
      overlaysWebView: false,
    },

    // Local Notifications — in-app notification display
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#059669',
      sound: 'beep.wav',
    },

    // Geolocation — maximum accuracy settings
    Geolocation: {
      // Android: use GPS, Network and Passive providers
      // (configured in AndroidManifest.xml)
    },
  },

  // ─── Android Configuration ────────────────────────────────────────────────
  android: {
    // Disable HTTP cleartext (enforce HTTPS)
    allowMixedContent: false,
    // Enable hardware back button handling
    captureInput: false,
    // Build in release mode
    buildOptions: {
      releaseType: 'APK',
    },
  },

  // ─── iOS Configuration ────────────────────────────────────────────────────
  ios: {
    contentInset: 'always',
    // Allow scroll in WebView
    scrollEnabled: true,
    // Use full-screen (edge-to-edge) mode
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
