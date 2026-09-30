/**
 * Utilities for detecting in-app browsers (Facebook, Messenger, Instagram, TikTok, Line, etc.)
 * and handling external browser redirection (Chrome on Android, Safari on iOS).
 */

export interface InAppBrowserInfo {
  isInApp: boolean;
  appName: string;
  isAndroid: boolean;
  isIos: boolean;
}

/**
 * Detects if the current web page is being viewed inside an in-app browser / webview
 * (such as Facebook, Messenger, Instagram, TikTok, Line, WeChat, Snapchat, Twitter/X, etc.)
 */
export const detectInAppBrowser = (): InAppBrowserInfo => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isInApp: false, appName: '', isAndroid: false, isIos: false };
  }

  const ua = window.navigator.userAgent || window.navigator.vendor || (window as any).opera || '';

  const isAndroid = /Android/i.test(ua);
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  // 1. Check if running inside the native mobile app (Capacitor Android/iOS).
  // The mobile app is NEVER an in-app browser and must NEVER show this prompt.
  const cap = (window as any).Capacitor;
  const isNativeShell = Boolean(
    (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
    (cap && typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web') ||
    (window as any).isNativeApp === true ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('capacitor')) ||
    (typeof window.location !== 'undefined' && (
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      (window.location.hostname === 'localhost' && !window.location.port)
    )) ||
    /Capacitor|JamanotApp/i.test(ua)
  );

  if (isNativeShell) {
    return { isInApp: false, appName: '', isAndroid, isIos };
  }

  // 2. Check for standalone PWA / TWA - these are legitimate installed apps, not social in-app webviews
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: twa)').matches ||
    (window.navigator as any).standalone === true;

  if (isStandalone) {
    return { isInApp: false, appName: '', isAndroid, isIos };
  }

  // App-specific identifiers
  let appName = '';
  if (/FBAN|FBAV|FB_IAB|FBSS/i.test(ua)) {
    if (/Messenger/i.test(ua)) {
      appName = 'Messenger';
    } else {
      appName = 'Facebook';
    }
  } else if (/Instagram/i.test(ua)) {
    appName = 'Instagram';
  } else if (/musical_ly|ByteLocale|TikTok/i.test(ua)) {
    appName = 'TikTok';
  } else if (/Line\//i.test(ua)) {
    appName = 'Line';
  } else if (/MicroMessenger/i.test(ua)) {
    appName = 'WeChat';
  } else if (/Snapchat/i.test(ua)) {
    appName = 'Snapchat';
  } else if (/Twitter|Tweetbot/i.test(ua)) {
    appName = 'Twitter (X)';
  } else if (/LinkedInApp/i.test(ua)) {
    appName = 'LinkedIn';
  } else if (/Pinterest/i.test(ua)) {
    appName = 'Pinterest';
  } else if (isAndroid && (/; wv\b/i.test(ua) || (/Version\/[0-9]\.[0-9]/i.test(ua) && !/Chrome\/[0-9]/i.test(ua)))) {
    appName = 'In-App Browser';
  } else if (isIos && /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua)) {
    appName = 'In-App Browser';
  }

  const isInApp = Boolean(appName);

  return { isInApp, appName: appName || 'In-App Browser', isAndroid, isIos };
};

/**
 * Attempts to launch the website directly in the device's default external browser (Chrome / Safari).
 */
export const openInExternalBrowser = () => {
  if (typeof window === 'undefined') return;

  let currentUrl = window.location.href;
  if (!currentUrl || currentUrl.includes('localhost') || currentUrl.startsWith('capacitor:') || currentUrl.startsWith('ionic:')) {
    currentUrl = 'https://jamanot.com';
  }
  const noProtocolUrl = currentUrl.replace(/^https?:\/\//, '');
  const { isAndroid } = detectInAppBrowser();

  if (isAndroid) {
    // Android Intent format specifically targeting Chrome or default system browser
    // This forcibly escapes Facebook/Messenger's internal WebView on Android.
    const chromeIntent = `intent://${noProtocolUrl}#Intent;scheme=https;package=com.android.chrome;end;`;
    const genericIntent = `intent://${noProtocolUrl}#Intent;scheme=https;action=android.intent.action.VIEW;end;`;

    try {
      window.location.href = chromeIntent;
      // Fallback to generic intent after brief delay if Chrome package is not present
      setTimeout(() => {
        window.location.href = genericIntent;
      }, 500);
    } catch (_) {
      window.location.href = genericIntent;
    }
  } else {
    // On iOS, direct intent switching is blocked by Apple sandbox.
    // Try window.open with _system or standard navigation.
    try {
      window.open(currentUrl, '_system');
    } catch (_) {
      window.location.href = currentUrl;
    }
  }
};

/**
 * Copies the current URL to clipboard with fallback.
 */
export const copyCurrentWebsiteUrl = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  let url = window.location.origin;
  if (!url || url.includes('localhost') || url.startsWith('capacitor:') || url.startsWith('ionic:')) {
    url = 'https://jamanot.com';
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (_) {}

  // Fallback using textarea execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (_) {
    return false;
  }
};
