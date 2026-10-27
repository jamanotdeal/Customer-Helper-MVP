#!/usr/bin/env node
/**
 * Moves photos saved inside Firestore documents as base64 data: URLs into
 * Firebase Storage, and puts the file's download link in their place.
 *
 *   store_products/*  photoUrl
 *   shops/*           photoUrl
 *   settings/pricing  homeSlides[].imageUrl
 *
 * Why: the 597 products alone came to ~22 MB with their photos inline, and
 * every listener on the collection downloaded all of it on each launch. The
 * app now uploads new photos itself (uploadImageIfInline in
 * src/lib/imageUtils.ts); this moves the ones saved before that, and sweeps
 * up any that an older app version still saves inline. Safe to run again.
 *
 *   node scripts/migrate-photos-to-storage.mjs              # dry run: reports, changes nothing
 *   node scripts/migrate-photos-to-storage.mjs --apply      # back up, upload, verify, update
 *   node scripts/migrate-photos-to-storage.mjs --restore <backup.json>
 *
 * Options: --only PATH (just that document, e.g. store_products/sp_123), --limit N
 * (only the first N documents that need it), --backup-dir DIR (default
 * ~/jamanot-photo-backups).
 *
 * Credentials: the Firebase CLI login on this machine (`firebase login`), as
 * project owner. That is why rules do not apply here.
 *
 * Safety:
 *  - Each distinct image is uploaded once, named by its SHA-256 (products
 *    copied between stores share a photo), and downloaded back and compared
 *    byte for byte before any document changes.
 *  - Every document is updated with a precondition on the update time read
 *    at the start, and only the photo field: a document edited in the
 *    meantime is skipped (reported), never overwritten. Run again to retry.
 *  - Before the first update, the original values are written to a backup
 *    file; --restore puts them back, but only where the field still holds
 *    the link this script set.
 */
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT = 'jamanot-pwa';
const BUCKET = 'jamanot-pwa.firebasestorage.app';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FOLDER = 'migrated';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const APPLY = flag('--apply');
const RESTORE = option('--restore', null);
const LIMIT = Number(option('--limit', '0')) || Infinity;
const ONLY = option('--only', null);
const BACKUP_DIR = option('--backup-dir', path.join(os.homedir(), 'jamanot-photo-backups'));

// ── Credentials: the Firebase CLI's own login ───────────────────────────────

async function accessToken() {
  const root = execSync('npm root -g').toString().trim();
  const require = createRequire(import.meta.url);
  const { getAccessToken } = require(path.join(root, 'firebase-tools/lib/auth.js'));
  const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  if (!store.tokens?.refresh_token) throw new Error('Not logged in: run `firebase login` first.');
  return (await getAccessToken(store.tokens.refresh_token, [])).access_token;
}

let TOKEN = '';
async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

// ── Firestore ───────────────────────────────────────────────────────────────

async function listCollection(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const { status, body } = await api(`${FS}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`);
    if (status !== 200) throw new Error(`list ${collection}: ${status} ${JSON.stringify(body.error || body)}`);
    docs.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function getDocument(docPath) {
  const { status, body } = await api(`${FS}/${docPath}`);
  if (status === 404) return null;
  if (status !== 200) throw new Error(`get ${docPath}: ${status} ${JSON.stringify(body.error || body)}`);
  return body;
}

/** Sets one top-level field, only if the document is unchanged since `updateTime`. */
async function patchField(doc, field, value, updateTime) {
  const url = `${FS.replace(/\/documents$/, '')}/documents/${doc.name.split('/documents/')[1]}`
    + `?updateMask.fieldPaths=${field}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  const { status, body } = await api(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [field]: value } }),
  });
  if (status === 200) return { ok: true, updateTime: body.updateTime };
  const reason = body.error?.status || status;
  return { ok: false, reason };
}

// ── Images ──────────────────────────────────────────────────────────────────

function decodeDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const type = /^data:([^;,]+)/.exec(head)?.[1] || 'image/jpeg';
  const bytes = head.includes(';base64')
    ? Buffer.from(dataUrl.slice(comma + 1), 'base64')
    : Buffer.from(decodeURIComponent(dataUrl.slice(comma + 1)), 'latin1');
  return { type, bytes };
}

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function downloadUrl(objectName, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectName)}?alt=media&token=${token}`;
}

const uploaded = new Map(); // sha256 → download URL, for this run

/** Uploads (once per distinct image) and verifies; returns the download URL. */
async function uploadVerified(dataUrl) {
  const { type, bytes } = decodeDataUrl(dataUrl);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (uploaded.has(sha)) return uploaded.get(sha);
  const objectName = `${FOLDER}/${sha}.${EXT[type] || 'jpg'}`;

  // Already there from an earlier run: reuse its download token.
  let token = null;
  const existing = await api(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectName)}`);
  if (existing.status === 200) {
    token = (existing.body.metadata?.firebaseStorageDownloadTokens || '').split(',')[0] || null;
  }
  if (!token) {
    token = randomUUID();
    const boundary = `b-${randomUUID()}`;
    const meta = {
      name: objectName,
      contentType: type,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const up = await api(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (up.status !== 200) throw new Error(`upload ${objectName}: ${up.status} ${JSON.stringify(up.body.error || up.body)}`);
  }

  const url = downloadUrl(objectName, token);
  const check = await fetch(url);
  const got = Buffer.from(await check.arrayBuffer());
  if (check.status !== 200 || !got.equals(bytes)) {
    throw new Error(`verify ${objectName}: status ${check.status}, ${got.length} bytes vs ${bytes.length}`);
  }
  uploaded.set(sha, url);
  return url;
}

// ── What needs moving ───────────────────────────────────────────────────────

const isInline = (v) => typeof v?.stringValue === 'string' && v.stringValue.startsWith('data:');

async function findWork() {
  const work = [];
  for (const collection of ['store_products', 'shops']) {
    for (const doc of await listCollection(collection)) {
      const v = doc.fields?.photoUrl;
      if (isInline(v)) work.push({ kind: 'photoUrl', doc, field: 'photoUrl', inline: [v.stringValue] });
    }
  }
  const settings = await getDocument('settings/pricing');
  const slides = settings?.fields?.homeSlides?.arrayValue?.values || [];
  const inlineSlides = slides.map((s) => s.mapValue?.fields?.imageUrl).filter(isInline).map((v) => v.stringValue);
  if (inlineSlides.length > 0) work.push({ kind: 'homeSlides', doc: settings, field: 'homeSlides', inline: inlineSlides });
  return work;
}

// ── Modes ───────────────────────────────────────────────────────────────────

async function dryRun(work) {
  let bytes = 0;
  const distinct = new Set();
  work.forEach((w) => w.inline.forEach((d) => {
    const { bytes: b } = decodeDataUrl(d);
    bytes += d.length;
    distinct.add(createHash('sha256').update(b).digest('hex'));
  }));
  const by = {};
  work.forEach((w) => {
    const c = w.doc.name.split('/documents/')[1].split('/')[0];
    by[c] = (by[c] || 0) + w.inline.length;
  });
  console.log('Inline photos found:', by);
  console.log(`${distinct.size} distinct images; ${(bytes / 1048576).toFixed(2)} MB of base64 in the documents.`);
  console.log('Dry run: nothing changed. Run with --apply to move them.');
}

async function apply(work) {
  work = work.slice(0, LIMIT);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `photos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const backup = work.map((w) => ({
    name: w.doc.name,
    field: w.field,
    updateTimeBefore: w.doc.updateTime,
    original: w.doc.fields[w.field],
    migrated: null,
  }));
  fs.writeFileSync(backupFile, JSON.stringify(backup));
  console.log(`Backup of ${backup.length} documents' original values: ${backupFile}`);

  let done = 0, skipped = 0, failed = 0;
  for (let i = 0; i < work.length; i++) {
    const w = work[i];
    const id = w.doc.name.split('/documents/')[1];
    try {
      let value;
      if (w.kind === 'photoUrl') {
        value = { stringValue: await uploadVerified(w.doc.fields.photoUrl.stringValue) };
      } else {
        const slides = structuredClone(w.doc.fields.homeSlides);
        for (const s of slides.arrayValue.values || []) {
          const img = s.mapValue?.fields?.imageUrl;
          if (isInline(img)) img.stringValue = await uploadVerified(img.stringValue);
        }
        value = slides;
      }
      const res = await patchField(w.doc, w.field, value, w.doc.updateTime);
      if (res.ok) {
        backup[i].migrated = value;
        done++;
      } else if (res.reason === 'FAILED_PRECONDITION') {
        skipped++;
        console.log(`  skipped (edited meanwhile, run again): ${id}`);
      } else {
        failed++;
        console.log(`  failed: ${id}: ${res.reason}`);
      }
    } catch (e) {
      failed++;
      console.log(`  failed: ${id}: ${e.message}`);
    }
    if ((i + 1) % 25 === 0 || i === work.length - 1) {
      fs.writeFileSync(backupFile, JSON.stringify(backup));
      console.log(`  ${i + 1}/${work.length}: ${done} updated, ${skipped} skipped, ${failed} failed`);
    }
  }
  console.log(`Done: ${done} updated, ${skipped} skipped, ${failed} failed; ${uploaded.size} images uploaded or reused.`);
  console.log(`To undo: node scripts/migrate-photos-to-storage.mjs --restore ${backupFile}`);
}

async function restore(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8')).filter((b) => b.migrated);
  let restored = 0, skipped = 0;
  for (const b of backup) {
    const docPath = b.name.split('/documents/')[1];
    const current = await getDocument(docPath);
    if (!current || JSON.stringify(current.fields?.[b.field]) !== JSON.stringify(b.migrated)) {
      skipped++;
      console.log(`  skipped (changed since the migration): ${docPath}`);
      continue;
    }
    const res = await patchField(current, b.field, b.original, current.updateTime);
    if (res.ok) restored++;
    else { skipped++; console.log(`  skipped (${res.reason}): ${docPath}`); }
  }
  console.log(`Restored ${restored}, skipped ${skipped}. The uploaded files are left in Storage.`);
}

TOKEN = await accessToken();
if (RESTORE) {
  await restore(RESTORE);
} else {
  let work = await findWork();
  if (ONLY) work = work.filter((w) => w.doc.name.endsWith(`/documents/${ONLY}`));
  if (APPLY) await apply(work);
  else await dryRun(work);
}
