'use client';

import { useEffect, useState } from 'react';
import { isAppVisible, subscribeAppVisibility } from '@/lib/appVisibility';

/**
 * One shared 1-second clock for every elapsed / countdown display.
 *
 * Each order card used to own its own `setInterval(…, 1000)`, so a list of
 * twenty orders woke the CPU twenty times a second — and kept doing it with the
 * screen off, since nothing paused those timers. This module keeps a single
 * interval alive for as long as at least one component is subscribed, and stops
 * it entirely while the app is not visible: a clock nobody can see has nothing
 * to update. On return to the foreground it emits immediately, so a display
 * that was frozen for a minute is correct on the first frame rather than up to
 * a second later.
 *
 * The value itself is meaningless — it is a change signal. Read the real time
 * inside the effect it drives.
 */

let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(value: number) => void>();

function emit() {
  tick += 1;
  listeners.forEach((listener) => listener(tick));
}

function start() {
  if (timer !== null || listeners.size === 0 || !isAppVisible()) return;
  timer = setInterval(emit, 1000);
}

function stop() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

subscribeAppVisibility((visible) => {
  if (!visible) {
    stop();
    return;
  }
  // Catch up before resuming, so the first painted frame is already correct.
  if (listeners.size > 0) emit();
  start();
});

/**
 * @param enabled pass false for a card whose time is frozen (a delivered order,
 *                for instance) so it costs nothing at all.
 */
export function useSecondTick(enabled: boolean = true): number {
  const [value, setValue] = useState(tick);

  useEffect(() => {
    if (!enabled) return;

    const listener = (next: number) => setValue(next);
    listeners.add(listener);
    start();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  }, [enabled]);

  return value;
}
