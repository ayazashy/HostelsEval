// ============================================================================
// 📸 HostelsEval — High Efficiency Client-side Image Compressor
// Converts photos to ultra-compact Base64 (<60KB) for Firestore safe storage
// Burns official audit watermark (Fixture UID + Timestamp)
// ============================================================================

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

        // 4. Export as compressed JPEG (Quality 0.60)
        // Produces ~35KB - 60KB Base64
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
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
