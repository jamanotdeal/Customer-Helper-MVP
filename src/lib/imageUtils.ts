/**
 * Client-side image compression utility
 * Compresses images to lightweight JPEG base64 strings suitable for local / Firestore storage (~30-60KB).
 */
export const compressImage = (
  file: File,
  maxWidth = 600,
  maxHeight = 600,
  quality = 0.8
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

/** Folders photos are uploaded to — the ones storage.rules accepts. */
export type ImageFolder = 'products' | 'shops' | 'slides' | 'applications' | 'notifications';

export const IMAGE_UPLOAD_FAILED_MESSAGE = 'ছবি আপলোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।';

const UPLOAD_TIMEOUT_MS = 30_000;

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const type = /^data:([^;,]+)/.exec(head)?.[1] || 'image/jpeg';
  const raw = head.includes(';base64') ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Turns a photo the forms hold as a data: URL (what compressImage returns, so
 * the preview shows at once) into a link to a file in Firebase Storage.
 *
 * Photos used to be saved inside the documents as base64. A product photo is
 * ~40 KB that way, and the 597 products came to ~22 MB that every listener on
 * the collection downloaded on every launch. A link is ~200 bytes, and the
 * image itself is fetched only where it is shown, then cached.
 *
 * Anything that is not a data: URL — an existing link, empty — is returned as
 * it is. Throws if the upload fails, so the form can stay open and say so
 * (IMAGE_UPLOAD_FAILED_MESSAGE) instead of saving the base64 after all.
 */
export async function uploadImageIfInline(value: string | undefined, folder: ImageFolder): Promise<string | undefined> {
  if (!value || !value.startsWith('data:')) return value;
  const blob = dataUrlToBlob(value);
  // Loaded on first use: only the screens that upload need the Storage SDK.
  const [{ getApp }, { getStorage, ref, uploadBytes, getDownloadURL }] = await Promise.all([
    import('firebase/app'),
    import('firebase/storage'),
  ]);
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const fileRef = ref(getStorage(getApp()), `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`);
  const upload = uploadBytes(fileRef, blob, {
    contentType: blob.type,
    // Every upload gets a new name, so a cached copy can never be stale.
    cacheControl: 'public, max-age=31536000, immutable',
  }).then(() => getDownloadURL(fileRef));
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('upload timed out')), UPLOAD_TIMEOUT_MS);
    upload.then(
      (url) => { clearTimeout(timer); resolve(url); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
