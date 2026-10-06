/**
 * The helper's new-order alerts currently on screen, newest last.
 *
 * Module-level on purpose. Alerts used to be state inside HelperDashboard (and
 * a second copy inside ExploreHelperView), so they only existed while one of
 * those screens was mounted: a helper on the Wallet tab got the sound and no
 * popup, and every remount of the dashboard re-announced the whole list. Now
 * every source — the order stream, a notification, a native alert, a tapped
 * notification — raises into this one queue, and HelperOrderAlerts (mounted at
 * the app root) renders it whatever screen is open.
 */

type Listener = () => void;

class OrderAlertQueue {
  private ids: string[] = [];
  // Alerts the helper answered or that went away. An order is announced once;
  // only an explicit request (tapping its notification) brings it back.
  private dismissed = new Set<string>();
  private listeners = new Set<Listener>();

  /** Stable between changes, as useSyncExternalStore requires. */
  getIds = (): string[] => this.ids;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * @param opts.force show it even if it was dismissed before — the helper
   *   tapped its notification, or Java is alerting on it.
   * @returns whether the alert is now on screen.
   */
  raise(orderId: string, opts?: { force?: boolean }): boolean {
    if (!orderId) return false;
    if (this.ids.includes(orderId)) return true;
    if (this.dismissed.has(orderId) && !opts?.force) return false;
    this.dismissed.delete(orderId);
    this.ids = [...this.ids, orderId];
    this.emit();
    return true;
  }

  /**
   * Answered, or the order is gone.
   * @param reason logged, so a popup that vanished can be traced to its cause.
   */
  remove(orderId: string, reason: string) {
    this.dismissed.add(orderId);
    if (!this.ids.includes(orderId)) return;
    console.info(`[orderAlerts] remove ${orderId}: ${reason}`);
    this.ids = this.ids.filter((id) => id !== orderId);
    this.emit();
  }

  /** Muted, or the helper left helper mode. */
  clear(reason: string) {
    if (this.ids.length === 0) return;
    console.info(`[orderAlerts] clear ${this.ids.join(',')}: ${reason}`);
    this.ids.forEach((id) => this.dismissed.add(id));
    this.ids = [];
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const helperOrderAlerts = new OrderAlertQueue();
