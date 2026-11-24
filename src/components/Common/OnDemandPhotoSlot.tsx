// ============================================================================
// إطار معاينة الصورة غير المحمّلة (Not-Loaded Photo Frame Placeholder)
// يظهر كبطاقة صورة مصغّرة احترافية بدلاً من الأزرار المستطيلة ويُحمّل عند الضغط فقط
// ============================================================================

import React from 'react';
import { Image as ImageIcon, Film, FileText, DownloadCloud, Loader2 } from 'lucide-react';

interface OnDemandPhotoSlotProps {
  loadedUrl?: string;
  mediaType?: 'image' | 'video' | 'pdf';
  badgeLabel: string;
  badgeTone?: 'slate' | 'emerald' | 'rose' | 'blue';
  isLoading?: boolean;
  onClick: () => void;
  sizeClass?: string;
}

export const OnDemandPhotoSlot: React.FC<OnDemandPhotoSlotProps> = ({
  loadedUrl,
  mediaType = 'image',
  badgeLabel,
  badgeTone = 'slate',
  isLoading = false,
  onClick,
  sizeClass = 'w-24 h-24',
}) => {
  const toneBorder =
    badgeTone === 'emerald'
      ? 'border-emerald-400'
      : badgeTone === 'rose'
      ? 'border-rose-400'
      : badgeTone === 'blue'
      ? 'border-blue-300'
      : 'border-slate-300';

  const toneBadgeBg =
    badgeTone === 'emerald'
      ? 'bg-emerald-700 text-white'
      : badgeTone === 'rose'
      ? 'bg-rose-700 text-white'
      : badgeTone === 'blue'
      ? 'bg-blue-700 text-white'
      : 'bg-slate-900/80 text-white';

  const isLoaded = !!loadedUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`relative ${sizeClass} rounded-xl overflow-hidden shrink-0 cursor-pointer transition flex flex-col items-center justify-center p-0 ${
        isLoaded
          ? `border-2 ${toneBorder} bg-slate-100 hover:shadow-md`
          : `border-2 border-dashed ${toneBorder} bg-slate-100 hover:bg-blue-50/70 hover:border-blue-400`
      }`}
      title={`${badgeLabel} — اضغط للتحميل والمعاينة`}
    >
      {isLoaded ? (
        mediaType === 'image' ? (
          <img src={loadedUrl} alt={badgeLabel} className="w-full h-full object-cover" />
        ) : mediaType === 'video' ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white text-[10px] font-bold gap-1 pb-4">
            <Film className="w-5 h-5 text-blue-300" />
            <span>تشغيل فيديو</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-rose-50 text-rose-700 text-[10px] font-bold gap-1 pb-4">
            <FileText className="w-5 h-5 text-rose-600" />
            <span>ملف PDF</span>
          </div>
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1.5 pb-5 text-center">
          <div className="w-8 h-8 rounded-lg bg-white/90 border border-slate-200 flex items-center justify-center shadow-2xs">
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            ) : mediaType === 'video' ? (
              <Film className="w-4 h-4 text-violet-600" />
            ) : mediaType === 'pdf' ? (
              <FileText className="w-4 h-4 text-rose-600" />
            ) : (
              <ImageIcon className="w-4 h-4 text-slate-500" />
            )}
          </div>
          <span className="text-[9px] font-bold text-slate-600 leading-tight inline-flex items-center gap-0.5">
            {!isLoading && <DownloadCloud className="w-2.5 h-2.5 text-blue-600 shrink-0" />}
            <span>{isLoading ? 'جاري التحميل' : 'صورة للتحميل'}</span>
          </span>
        </div>
      )}

      {/* Bottom Caption Bar (Never overlaps center icon!) */}
      <span
        className={`w-full text-[9px] text-center py-0.5 px-1 font-bold leading-tight ${toneBadgeBg}`}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
      >
        {badgeLabel}
      </span>
    </button>
  );
};
