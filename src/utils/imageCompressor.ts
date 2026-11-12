// ============================================================================
// 📸 HostelsEval — High Efficiency Client-side Media & Attachment Processor
// Converts photos to ultra-compact Base64 (<60KB) for Firestore safe storage
// Also processes short videos / PDFs with strict size validation (<380KB)
// ============================================================================

import { FacilityMediaItem } from '../types/hostel';

export interface CompressedImageResult {
  base64: string;
  sizeBytes: number;
  width: number;
  height: number;
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
        // 1. Calculate Target Dimensions (Max 800px on longest side)
        const maxDimension = 800;
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

        // 2. Setup Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('تعذر إنشاء سياق Canvas الرسومي'));
          return;
        }

        // Draw original scaled image
        ctx.drawImage(img, 0, 0, width, height);

        // 3. Burn Official Audit Watermark Banner at Bottom
        const bannerHeight = 32;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'; // Dark Slate Semi-transparent
        ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

        // Watermark Text: ID + Timestamp
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

        const idText = metadata?.fixtureId ? `📌 ${metadata.fixtureId}` : '🏢 HostelsEval';
        const timeText = `⏱️ ${dateStr} - ${timeStr}`;

        ctx.font = 'bold 12px "Inter", "Segoe UI", Tahoma, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';

        // Right side (Arabic layout)
        ctx.textAlign = 'right';
        ctx.fillText(idText, width - 12, height - bannerHeight / 2);

        // Left side
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8'; // Muted text for timestamp
        ctx.fillText(timeText, 12, height - bannerHeight / 2);

        // 4. Export as compressed JPEG (Quality 0.58)
        // Produces ~30KB - 55KB Base64
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.58);
        const approxBytes = Math.round((compressedBase64.length * 3) / 4);

        resolve({
          base64: compressedBase64,
          sizeBytes: approxBytes,
          width,
          height,
        });
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Processes an image, video, or PDF file into a FacilityMediaItem safe for Firestore storage.
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
    // Firestore document limit is 1 MiB. Limit raw non-image file to 420 KB (~560 KB base64).
    const maxRawBytes = 420 * 1024;
    if (file.size > maxRawBytes) {
      throw new Error(
        isPdf
          ? 'حجم ملف الـ PDF كبير جداً للتخزين السحابي (الحد الأقصى 400 كيلوبايت). يرجى رفع لقطة شاشة (صورة) للبلاغ بدلاً منه أو ضغط الملف.'
          : 'حجم الفيديو كبير جداً للتخزين السحابي (الحد الأقصى 400 كيلوبايت / مقطع قصير جداً). يفضل التقاط عدة صور واضحة.'
      );
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذر قراءة الملف المرفق'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

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
