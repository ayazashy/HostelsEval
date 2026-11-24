// ============================================================================
// HostelsEval — High Efficiency Client-side Media & Attachment Processor
// Multi-pass adaptive compression + Firestore 1 MiB Document Capacity Estimator
// Rejects any single file that still exceeds 1 MiB after maximum compression
// ============================================================================

import { FacilityMediaItem } from '../types/hostel';

// Firestore hard limit is 1,048,576 bytes (1 MiB) including field keys & doc metadata
export const FIRESTORE_HARD_LIMIT_BYTES = 1048576;
// Safe threshold per Firestore document before dynamically opening a linked overflow document (_PART_2, _PART_3...)
export const SAFE_FIRESTORE_DOC_BYTES = 850 * 1024; // ~870,400 bytes
// Maximum allowed UTF-8/Base64 byte size for a SINGLE atomic attachment after compression
export const MAX_SINGLE_FILE_BASE64_BYTES = 840 * 1024; // ~860,160 bytes Base64 (~630 KB binary)

export interface CompressedImageResult {
  base64: string;
  sizeBytes: number;
  base64ByteLength: number;
  width: number;
  height: number;
  compressionPasses: number;
}

/**
 * Estimates the serialized Firestore document size in bytes (UTF-8 + metadata overhead).
 */
export function estimateFirestoreDocSizeBytes(payload: unknown): number {
  if (payload === null || payload === undefined) return 64;
  try {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const utf8Len =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(json).length
        : json.length * 1.1;
    // Add 1.5 KB safety margin for Firestore document path, field names, and protobuf framing
    return Math.ceil(utf8Len + 1536);
  } catch {
    return 2048;
  }
}

/**
 * Estimates how many dynamically linked Firestore documents (`MEDIA_${id}`, `MEDIA_${id}_PART_2`, ...)
 * will be needed to store a list of attachments without any single document exceeding 1 MiB.
 */
export function estimateFacilityMediaShards(items: Array<{ url?: string }>): {
  totalBase64Bytes: number;
  estimatedDocsCount: number;
  currentDocFillPct: number;
} {
  let docsCount = 1;
  let currentBucketBytes = 2048;
  let totalBytes = 0;

  for (const item of items) {
    const itemBytes = item?.url ? estimateFirestoreDocSizeBytes(item.url) : 512;
    totalBytes += itemBytes;
    if (currentBucketBytes + itemBytes > SAFE_FIRESTORE_DOC_BYTES) {
      docsCount += 1;
      currentBucketBytes = 2048 + itemBytes;
    } else {
      currentBucketBytes += itemBytes;
    }
  }

  const fillPct = Math.min(100, Math.round((currentBucketBytes / SAFE_FIRESTORE_DOC_BYTES) * 100));
  return {
    totalBase64Bytes: totalBytes,
    estimatedDocsCount: docsCount,
    currentDocFillPct: fillPct,
  };
}

function renderWatermarkedCanvasToBase64(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number,
  metadata?: { fixtureId?: string; inspectorName?: string }
): { base64: string; width: number; height: number } {
  let width = img.width;
  let height = img.height;

  if (width > height) {
    if (width > maxDimension) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    }
  } else {
    if (height > maxDimension) {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('تعذر إنشاء سياق Canvas الرسومي لضغط الصورة');
  }

  ctx.drawImage(img, 0, 0, width, height);

  const bannerHeight = Math.max(24, Math.min(32, Math.round(height * 0.08)));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const idText = metadata?.fixtureId ? metadata.fixtureId : 'HostelsEval';
  const timeText = `${dateStr} - ${timeStr}`;

  ctx.font = 'bold 11px "Inter", "Segoe UI", Tahoma, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'right';
  ctx.fillText(idText, width - 10, height - bannerHeight / 2);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(timeText, 10, height - bannerHeight / 2);

  const base64 = canvas.toDataURL('image/jpeg', quality);
  return { base64, width, height };
}

export async function compressAndWatermarkImage(
  file: File | Blob,
  metadata?: { fixtureId?: string; inspectorName?: string }
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));

    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('فشل تحميل الصورة في الذاكرة'));

      img.onload = () => {
        try {
          // Adaptive multi-pass compression schedule to guarantee small footprint & fit within 1 MiB
          const passes: Array<{ maxDim: number; quality: number; targetMaxBase64Bytes: number }> = [
            { maxDim: 800, quality: 0.58, targetMaxBase64Bytes: 180 * 1024 },
            { maxDim: 720, quality: 0.46, targetMaxBase64Bytes: 320 * 1024 },
            { maxDim: 600, quality: 0.36, targetMaxBase64Bytes: 520 * 1024 },
            { maxDim: 480, quality: 0.28, targetMaxBase64Bytes: MAX_SINGLE_FILE_BASE64_BYTES },
          ];

          let bestResult = renderWatermarkedCanvasToBase64(img, 800, 0.58, metadata);
          let passUsed = 1;

          for (let i = 0; i < passes.length; i++) {
            const p = passes[i];
            if (i > 0) {
              bestResult = renderWatermarkedCanvasToBase64(img, p.maxDim, p.quality, metadata);
              passUsed = i + 1;
            }
            if (bestResult.base64.length <= p.targetMaxBase64Bytes) {
              break;
            }
          }

          if (bestResult.base64.length > MAX_SINGLE_FILE_BASE64_BYTES) {
            const sizeMb = (bestResult.base64.length / (1024 * 1024)).toFixed(2);
            reject(
              new Error(
                `عفواً، حجم الصورة حتى بعد أقصى درجات الضغط التلقائي (${sizeMb} MB) يتجاوز السعة القصوى المسموحة للملف الواحد في الخادم (1 ميغابايت - 1MB Server Capacity). يرجى اختيار صورة أخرى.`
              )
            );
            return;
          }

          const approxBytes = Math.round((bestResult.base64.length * 3) / 4);

          resolve({
            base64: bestResult.base64,
            sizeBytes: approxBytes,
            base64ByteLength: bestResult.base64.length,
            width: bestResult.width,
            height: bestResult.height,
            compressionPasses: passUsed,
          });
        } catch (err) {
          reject(err);
        }
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Processes an image, video, or PDF file into a FacilityMediaItem safe for Firestore storage.
 * Compresses images automatically and verifies that no single file exceeds the 1 MiB Firestore document capacity.
 */
export async function processFacilityMediaFile(
  file: File,
  metadata?: { fixtureId?: string; actorName?: string }
): Promise<FacilityMediaItem> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isImage) {
    const res = await compressAndWatermarkImage(file, {
      fixtureId: metadata?.fixtureId,
      inspectorName: metadata?.actorName,
    });
    return {
      id: `med_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image',
      url: res.base64,
      name: file.name,
      capturedAt: new Date().toISOString(),
      capturedBy: metadata?.actorName,
    };
  }

  if (isVideo || isPdf) {
    // Estimate Base64 serialized size on Firestore (Base64 is 4/3 of binary size + JSON/Firestore overhead)
    const estimatedBase64Bytes = Math.ceil((file.size * 4) / 3) + 2048;

    if (estimatedBase64Bytes > MAX_SINGLE_FILE_BASE64_BYTES) {
      const rawKb = Math.round(file.size / 1024);
      const encodedMb = (estimatedBase64Bytes / (1024 * 1024)).toFixed(2);
      throw new Error(
        isPdf
          ? `عفواً، حجم ملف الـ PDF (${rawKb} كيلوبايت — يعادل ${encodedMb} MB بعد الترميز السحابي) يتجاوز السعة القصوى للخادم للملف الواحد (1 ميغابايت / 1MB Server Limit) ولا يمكن ضغطه لأقل من 1MB. يرجى ضغط ملف الـ PDF أو رفع صورة/لقطة شاشة للبلاغ بدلاً منه.`
          : `عفواً، حجم ملف الفيديو (${rawKb} كيلوبايت — يعادل ${encodedMb} MB بعد الترميز السحابي) يتجاوز السعة القصوى للخادم للملف الواحد (1 ميغابايت / 1MB Server Limit). يرجى رفع مقطع أقصر أو التقاط عدة صور واضحة (سيقوم النظام بتوزيع الصور تلقائياً على عدة مستندات مرتبطة).`
      );
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذر قراءة الملف المرفق'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    if ( estimateFirestoreDocSizeBytes(base64) > MAX_SINGLE_FILE_BASE64_BYTES ) {
      const encodedMb = (base64.length / (1024 * 1024)).toFixed(2);
      throw new Error(
        `عفواً، حجم المرفق بعد الترميز (${encodedMb} MB) يتجاوز السعة القصوى المسموحة للملف الواحد في الخادم (1MB). يرجى تقليل حجم الملف أو رفع صورة بدلاً منه.`
      );
    }

    return {
      id: `med_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: isPdf ? 'pdf' : 'video',
      url: base64,
      name: file.name,
      capturedAt: new Date().toISOString(),
      capturedBy: metadata?.actorName,
    };
  }

  throw new Error('نوع الملف غير مدعوم. يرجى اختيار صورة، فيديو قصير، أو ملف PDF.');
}
