/**
 * The new-order alarm, for whichever alert popup is on screen.
 *
 * A popup declares the alerts it is showing with setOrderAlarm(ids); the alarm
 * rings while that list is non-empty and stops the moment it empties. That
 * coupling is the point: the sound used to be a separate switch, flipped from
 * several places, so it could start before the popup existed and keep going
 * after the order it announced was gone.
 *
 * - Android app: Java rings (the WebView falls silent once minimised) and
 *   watches each order itself — see syncNativeOrderAlarm.
 * - Browser: a Web Audio tone while visible, and a service-worker notification
 *   while hidden, since a hidden tab cannot play audio.
 */

import { isNativeApp, syncNativeOrderAlarm } from './native';
import { isAppVisible, subscribeAppVisibility } from './appVisibility';

/** Gap between tones while the app is open. */
const BEEP_INTERVAL_MS = 1500;
/** While hidden, re-post the OS notification every this many ticks (~7.5 s). */
const HIDDEN_NOTIFY_EVERY_TICKS = 5;
/**
 * Ring for at most this long with the app actually open; a new order re-arms
 * it. An alert rings until it is answered — this is only a backstop for one
 * nobody answers, matching the native alarm (AlertSound.ALARM_MAX_MS).
 */
const MAX_RING_VISIBLE_MS = 30 * 60_000;

let currentIds: string[] = [];
let loop: ReturnType<typeof setInterval> | null = null;
let autoStop: ReturnType<typeof setTimeout> | null = null;
let unsubscribeVisibility: (() => void) | null = null;
let hiddenTicks = 0;
let audioCtx: AudioContext | null = null;

/** Declares the alerts on screen. Rings while non-empty; a newly added id restarts it. */
export function setOrderAlarm(orderIds: string[]): void {
  const added = orderIds.some((id) => !currentIds.includes(id));
  currentIds = [...orderIds];

  if (isNativeApp()) syncNativeOrderAlarm(orderIds);

  if (orderIds.length === 0) {
    stopLoop();
    return;
  }
  if (added) startLoop();
}

function startLoop() {
  stopLoop();
  hiddenTicks = 0;

  ring();
  loop = setInterval(() => {
    if (isAppVisible()) {
      ring();
      return;
    }
    hiddenTicks++;
    if (hiddenTicks % HIDDEN_NOTIFY_EVERY_TICKS === 0) notifyWhileHidden();
  }, BEEP_INTERVAL_MS);

  // Time minimised doesn't count towards the cap: the alarm must still be
  // ringing when the user comes back to it.
  if (isAppVisible()) armAutoStop();
  unsubscribeVisibility = subscribeAppVisibility((visible) => {
    if (visible) {
      ring();
      armAutoStop();
    } else {
      disarmAutoStop();
    }
  });
}

function stopLoop() {
  if (loop) clearInterval(loop);
  loop = null;
  disarmAutoStop();
  unsubscribeVisibility?.();
  unsubscribeVisibility = null;
}

function armAutoStop() {
  if (autoStop) return;
  autoStop = setTimeout(() => {
    // Silences the tone only. The popup stays, and on Android Java's own
    // cap (AlertSound.ALARM_MAX_MS) governs the native alarm.
    stopLoop();
  }, MAX_RING_VISIBLE_MS);
}

function disarmAutoStop() {
  if (autoStop) clearTimeout(autoStop);
  autoStop = null;
}

function ring() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate([500, 250, 500, 250, 500]); } catch (_) { /* ignore */ }
  }
  // The app rings from Java; a tone here as well would double every beep.
  if (isNativeApp()) return;
  if (!isAppVisible()) {
    notifyWhileHidden();
    return;
  }
  playTone();
}

function playTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.8);
    osc2.stop(ctx.currentTime + 0.8);
  } catch (e) {
    console.warn('[orderAlarm] tone note:', e);
  }
}

/** One context for the page's lifetime — browsers cap how many may exist. */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = AC ? new AC() : null;
  } catch (_) {
    audioCtx = null;
  }
  return audioCtx;
}

/** A hidden tab can't play audio; the OS notification plays its sound instead. */
function notifyWhileHidden() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const count = currentIds.length;
  navigator.serviceWorker.ready
    .then((reg) =>
      reg.showNotification('🚨 নতুন অর্ডার এসেছে!', {
        body: count > 1 ? `${count}টি নতুন রিকুয়েস্ট অপেক্ষা করছে।` : 'একটি নতুন ডেলিভারি রিকুয়েস্ট আসছে।',
        icon: '/Jamanot-Logo.png',
        badge: '/Jamanot-Logo.png',
        tag: 'new-order-alarm',
        renotify: true,
        vibrate: [500, 250, 500, 250, 500, 250, 500],
        data: { url: '/' },
        actions: [{ action: 'open', title: 'অর্ডার দেখুন' }],
      } as any)
    )
    .catch(() => {});
}

// Browsers keep a new AudioContext suspended until the user has interacted
// with the page, so unlock it on the first gesture — otherwise the first order
// to arrive after a fresh load would be silent.
if (typeof window !== 'undefined' && !isNativeApp()) {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    ['touchstart', 'click', 'keydown'].forEach((t) => window.removeEventListener(t, unlock));
  };
  ['touchstart', 'click', 'keydown'].forEach((t) =>
    window.addEventListener(t, unlock, { passive: true })
  );
}
