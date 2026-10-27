/**
 * Firestore reads, counted.
 *
 * Firestore bills one read per document a query returns (at least one per
 * query), one per document a listener delivers when it starts, and one per
 * changed document after that. Production metrics only give the daily total —
 * 0.5–1.1 million in early October 2026 — not which query spent it. These
 * wrappers count reads per query shape on this device, so the expensive ones
 * can be found instead of guessed:
 *
 *  - in the browser / WebView console: `__jamanotReads()` prints this session's table;
 *  - in Firestore: each device adds its totals to `readStats/{day}_{device}`
 *    every few minutes (writes only — the meter never reads).
 *
 * Counts are what the client can see, so they are a floor: a listener that
 * resumes after more than 30 minutes offline is billed for its whole result
 * again, but the SDK reports only what changed.
 */
import {
  onSnapshot as fsOnSnapshot,
  getDocs as fsGetDocs,
  getDoc as fsGetDoc,
  getDocFromServer as fsGetDocFromServer,
  getDocsFromServer as fsGetDocsFromServer,
  getCountFromServer as fsGetCountFromServer,
  getAggregateFromServer as fsGetAggregateFromServer,
  doc,
  setDoc,
  increment,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

type Row = { listenReads: number; getReads: number; listens: number; gets: number };

const rows = new Map<string, Row>();
const pending = new Map<string, number>(); // reads not yet uploaded, by label
const events = new Map<string, number>(); // countEvent() calls not yet uploaded, by name

function row(label: string): Row {
  let r = rows.get(label);
  if (!r) {
    r = { listenReads: 0, getReads: 0, listens: 0, gets: 0 };
    rows.set(label, r);
  }
  return r;
}

function add(label: string, kind: 'listen' | 'get', reads: number) {
  const r = row(label);
  if (kind === 'listen') r.listenReads += reads;
  else r.getReads += reads;
  if (reads > 0) pending.set(label, (pending.get(label) || 0) + reads);
}

/**
 * A short name for what a query reads: the collection, the fields it filters
 * on and its limit — e.g. `orders?status==|limit100`. Uses SDK internals where
 * there is no public API; anything unexpected falls back to the collection.
 */
function labelOf(ref: any): string {
  try {
    if (ref?.type === 'document') return `doc:${ref.parent?.id ?? '?'}`;
    if (ref?.type === 'collection' && !ref._query?.filters?.length) return ref.id;
    const q = ref?._query;
    const path: string = q?.path?.canonicalString?.() || q?.collectionGroup || 'query';
    const coll = path.split('/').pop() || path;
    const filters = (q?.filters || [])
      .flatMap((f: any) => (f?.filters ? f.filters : [f]))
      .map((f: any) => `${f?.field?.canonicalString?.() ?? '?'}${f?.op ?? ''}`)
      .join(',');
    const lim = typeof q?.limit === 'number' ? `|limit${q.limit}` : '';
    return `${coll}${filters ? '?' + filters : ''}${lim}`;
  } catch {
    return 'query';
  }
}

/** onSnapshot with the reads it causes counted under the query's label. */
export const onSnapshot: typeof fsOnSnapshot = ((ref: any, ...args: any[]) => {
  const label = labelOf(ref);
  row(label).listens++;
  let primed = false;
  const count = (snap: any) => {
    try {
      const md = snap?.metadata;
      if (!md || md.fromCache || md.hasPendingWrites) return;
      if (Array.isArray(snap.docs)) {
        const n = primed ? snap.docChanges().length : Math.max(1, snap.size);
        primed = true;
        if (n > 0) add(label, 'listen', n);
      } else {
        primed = true;
        add(label, 'listen', 1);
      }
    } catch {
      /* counting must never break a listener */
    }
  };
  const wrap = (fn: any) => (typeof fn === 'function' ? (snap: any) => { count(snap); return fn(snap); } : fn);

  // (ref, next, error?, complete?) | (ref, options, next, ...) | (ref, observer) | (ref, options, observer)
  const out = [...args];
  const i = out.findIndex((a) => typeof a === 'function' || (a && typeof a.next === 'function'));
  if (i >= 0) {
    out[i] = typeof out[i] === 'function' ? wrap(out[i]) : { ...out[i], next: wrap(out[i].next) };
  }
  return (fsOnSnapshot as any)(ref, ...out);
}) as any;

const countDocs = (label: string) => (snap: any) => {
  row(label).gets++;
  if (!snap?.metadata?.fromCache) add(label, 'get', Math.max(1, snap?.size ?? 0));
  return snap;
};
const countDoc = (label: string) => (snap: any) => {
  row(label).gets++;
  if (!snap?.metadata?.fromCache) add(label, 'get', 1);
  return snap;
};

export const getDocs: typeof fsGetDocs = ((q: any) => fsGetDocs(q).then(countDocs(labelOf(q)))) as any;
export const getDocsFromServer: typeof fsGetDocsFromServer = ((q: any) =>
  fsGetDocsFromServer(q).then(countDocs(labelOf(q)))) as any;
export const getDoc: typeof fsGetDoc = ((r: any) => fsGetDoc(r).then(countDoc(labelOf(r)))) as any;
export const getDocFromServer: typeof fsGetDocFromServer = ((r: any) =>
  fsGetDocFromServer(r).then(countDoc(labelOf(r)))) as any;

/** A count costs one read per 1,000 index entries it covers (at least one). */
export const getCountFromServer: typeof fsGetCountFromServer = ((q: any) =>
  fsGetCountFromServer(q).then((snap: any) => {
    const label = `count:${labelOf(q)}`;
    row(label).gets++;
    add(label, 'get', Math.max(1, Math.ceil((snap?.data?.()?.count ?? 0) / 1000)));
    return snap;
  })) as any;
export const getAggregateFromServer: typeof fsGetAggregateFromServer = ((q: any, spec: any) =>
  fsGetAggregateFromServer(q, spec).then((snap: any) => {
    const label = `aggregate:${labelOf(q)}`;
    row(label).gets++;
    add(label, 'get', 1); // the true cost scales with the entries scanned; not visible here
    return snap;
  })) as any;

/**
 * Counts something that is not a read but explains reads — e.g. listener
 * restarts. Uploaded with the reads, under `events` in the same document, and
 * left out of `total`.
 */
export function countEvent(name: string) {
  events.set(name, (events.get(name) || 0) + 1);
}

/** This session's reads, most expensive first. */
export function readTable() {
  return Array.from(rows.entries())
    .map(([label, r]) => ({ label, reads: r.listenReads + r.getReads, ...r }))
    .sort((a, b) => b.reads - a.reads);
}

export function totalReads(): number {
  let n = 0;
  rows.forEach((r) => (n += r.listenReads + r.getReads));
  return n;
}

// ── Upload ────────────────────────────────────────────────────────────────

const UPLOAD_EVERY_MS = 10 * 60 * 1000;

function deviceId(): string {
  try {
    let id = localStorage.getItem('jamanot_device_id');
    if (!id) {
      id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('jamanot_device_id', id);
    }
    return id;
  } catch {
    return 'd-unknown';
  }
}

const fieldKey = (label: string) => label.replace(/[./~*[\]]/g, '_').slice(0, 120);

/**
 * Adds this device's new reads to `readStats/{YYYY-MM-DD}_{device}`: one merge
 * write with increments, only when there is something new. `who()` supplies
 * the signed-in uid and listener role at upload time.
 */
export function startReadStatsUpload(db: Firestore, who: () => { uid: string | null; role: string | null }) {
  if (typeof window === 'undefined') return;
  (window as any).__jamanotReads = () => {
    const t = readTable();
    // eslint-disable-next-line no-console
    console.table(t);
    return t;
  };

  const upload = () => {
    if (pending.size === 0 && events.size === 0) return;
    const counts: Record<string, any> = {};
    let total = 0;
    pending.forEach((n, label) => {
      counts[fieldKey(label)] = increment(n);
      total += n;
    });
    pending.clear();
    const eventCounts: Record<string, any> = {};
    events.forEach((n, name) => {
      eventCounts[fieldKey(name)] = increment(n);
    });
    events.clear();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const { uid, role } = who();
    setDoc(
      doc(db, 'readStats', `${day}_${deviceId()}`),
      {
        day,
        device: deviceId(),
        uid: uid || null,
        role: role || 'guest',
        native: !!(window as any).Capacitor?.isNativePlatform?.(),
        updatedAt: now.toISOString(),
        total: increment(total),
        counts,
        ...(Object.keys(eventCounts).length > 0 ? { events: eventCounts } : {}),
      },
      { merge: true }
    ).catch(() => {
      /* best effort; the next upload carries on */
    });
  };

  setInterval(upload, UPLOAD_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') upload();
  });
}
