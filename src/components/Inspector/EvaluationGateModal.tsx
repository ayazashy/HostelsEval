// ============================================================================
// بوابة التقييم الإلزامي لرواد المباني بعد إغلاق البلاغ (منع الإغلاق الصوري)
// تلزم رائد المبنى بتقييم البلاغات المغلقة من الصيانة قبل فتح أي بلاغ جديد
// ============================================================================

import React, { useState } from 'react';
import { FixtureEvaluation, FacilityMediaVaultDoc } from '../../types/hostel';
import {
  evaluateClosedTicket,
  fetchFacilityMediaOnDemand,
} from '../../services/firestoreService';
import { compressAndWatermarkImage, formatStandardDate } from '../../utils/imageCompressor';
import { DEFECT_TAGS, getZoneNameAr, KSU_SERVICE_EVALUATION_URL } from '../../config/facilityTemplates';
import { ImageViewerModal, MediaGalleryEntry } from '../Common/ImageViewerModal';
import { OnDemandPhotoSlot } from '../Common/OnDemandPhotoSlot';
import {
  Star,
  CheckCircle2,
  XCircle,
  Camera,
  ShieldAlert,
  Wrench,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  X,
} from 'lucide-react';

interface EvaluationGateModalProps {
  buildingId: string;
  pendingTickets: FixtureEvaluation[];
  leaderName: string;
  onEvaluated: () => void;
  onClose?: () => void;
}

export const EvaluationGateModal: React.FC<EvaluationGateModalProps> = ({
  buildingId,
  pendingTickets,
  leaderName,
  onEvaluated,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentItem = pendingTickets[currentIndex] || pendingTickets[0];

  const [isFixed, setIsFixed] = useState<boolean | null>(true);
  const [rating, setRating] = useState<number>(5);
  const [feedback, setFeedback] = useState<string>('');
  const [photoBase64, setPhotoBase64] = useState<string | undefined>(undefined);
  const [ksuConfirmed, setKsuConfirmed] = useState<boolean>(false);
  const [copiedMaximo, setCopiedMaximo] = useState<boolean>(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewGallery, setPreviewGallery] = useState<{
    items: MediaGalleryEntry[];
    initialIndex: number;
    title: string;
  } | null>(null);
  const [loadedVaults, setLoadedVaults] = useState<Record<string, FacilityMediaVaultDoc>>({});
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);

  if (!currentItem) return null;

  const ticket = currentItem.maintenanceTicket;
  const loadedVault = loadedVaults[currentItem.id];

  const handleLoadAndPreviewGateMedia = async (
    target: 'maximo' | 'after' | 'before',
    beforeIndex: number = 0
  ) => {
    setLoadingTarget(`${target}_${beforeIndex}`);
    try {
      let vault: FacilityMediaVaultDoc | null = loadedVaults[currentItem.id] || null;
      if (!vault) {
        vault = await fetchFacilityMediaOnDemand(currentItem.id);
        if (vault) {
          setLoadedVaults((prev) => ({ ...prev, [currentItem.id]: vault! }));
        }
      }
      if (!vault) return;

      if (target === 'maximo') {
        const maxUrl = vault.maximoAttachmentBase64 || ticket?.maximoAttachmentBase64;
        const maxType = vault.maximoAttachmentType || ticket?.maximoAttachmentType;
        const maxName =
          vault.maximoAttachmentName ||
          ticket?.maximoAttachmentName ||
          `Maximo_${ticket?.maximoNumber || currentItem.id}.pdf`;
        if (maxUrl && (maxType === 'pdf' || maxUrl.startsWith('data:application/pdf'))) {
          const a = document.createElement('a');
          a.href = maxUrl;
          a.download = maxName;
          a.click();
          return;
        }
      }

      const entries: MediaGalleryEntry[] = [];
      const baseMedia =
        vault.media && vault.media.length > 0
          ? vault.media
          : vault.photoBase64
          ? [
              {
                id: 'p0',
                type: 'image' as const,
                url: vault.photoBase64,
                capturedAt: vault.updatedAt,
              },
            ]
          : [];
      baseMedia.forEach((m, idx) => {
        if (m?.url) {
          entries.push({
            url: m.url,
            type: m.type || 'image',
            name: m.name,
            label: baseMedia.length > 1 ? `صورة العطل قبل الإصلاح (#${idx + 1})` : 'صورة العطل قبل الإصلاح',
          });
        }
      });

      const beforeLen = entries.length;
      let afterIdx = -1;
      let maxIdx = -1;

      const afterUrl = vault.closurePhotoBase64 || ticket?.closurePhotoBase64;
      if (afterUrl) {
        afterIdx = entries.length;
        entries.push({ url: afterUrl, type: 'image', label: 'صورة الصيانة بعد الإصلاح' });
      }

      const maxUrl = vault.maximoAttachmentBase64 || ticket?.maximoAttachmentBase64;
      const maxType = vault.maximoAttachmentType || ticket?.maximoAttachmentType;
      if (maxUrl && maxType !== 'pdf' && !maxUrl.startsWith('data:application/pdf')) {
        maxIdx = entries.length;
        entries.push({ url: maxUrl, type: 'image', label: 'مرفق مستند ماكسمو' });
      }

      if (entries.length === 0) return;

      let idxToOpen = 0;
      if (target === 'before') {
        idxToOpen = Math.max(0, Math.min(beforeIndex, Math.max(0, beforeLen - 1)));
      } else if (target === 'after' && afterIdx >= 0) {
        idxToOpen = afterIdx;
      } else if (target === 'maximo' && maxIdx >= 0) {
        idxToOpen = maxIdx;
      }

      setPreviewGallery({
        items: entries,
        initialIndex: idxToOpen,
        title: `شواهد البلاغ (${currentItem.id})`,
      });
    } finally {
      setLoadingTarget(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const res = await compressAndWatermarkImage(file, {
        fixtureId: currentItem.id,
        inspectorName: leaderName,
      });
      setPhotoBase64(res.base64);
    } catch (err: any) {
      alert(err?.message || 'تعذر ضغط الصورة المرفقة');
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFixed === null) return;

    if (!isFixed && !feedback.trim()) {
      alert('يرجى كتابة سبب رفض الإغلاق (مثال: التسريب ما زال مستمراً) لإعادة فتح البلاغ للصيانة.');
      return;
    }

    if (isFixed && !ksuConfirmed) {
      alert('يرجى رفع تقييم الخدمة عبر رابط نماذج الجامعة أولاً ثم وضع علامة تأكيد التقييم.');
      return;
    }

    setIsSubmitting(true);
    try {
      await evaluateClosedTicket(currentItem, {
        isFixed,
        rating: isFixed ? rating : Math.min(rating, 2),
        feedback,
        photoBase64,
        leaderName,
        ksuEvaluationConfirmed: isFixed ? ksuConfirmed : false,
      });

      // Reset form for next pending ticket if any
      setFeedback('');
      setPhotoBase64(undefined);
      setKsuConfirmed(false);
      setRating(5);
      setIsFixed(true);
      setCurrentIndex(0);
      onEvaluated();
    } catch {
      alert('حدث خطأ أثناء حفظ تقييم الخدمة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Top Banner */}
        <div className="bg-purple-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                اعتماد وتقييم إغلاق البلاغ ({buildingId})
              </h3>
              <p className="text-[11px] text-purple-100">
                متبقي {pendingTickets.length} بلاغ بانتظار التقييم
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              title="معاينة فقط"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-xs">
          {/* Ticket Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold">
                  {currentItem.buildingId} • الدور {currentItem.floor} • {getZoneNameAr(currentItem.wingId, false)}
                </span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {currentItem.id}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ticket?.maximoNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ticket.maximoNumber!);
                      setCopiedMaximo(true);
                      setTimeout(() => setCopiedMaximo(false), 2000);
                    }}
                    className="font-mono font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-300 inline-flex items-center gap-1.5 transition"
                    title="نسخ رقم بلاغ ماكسمو"
                  >
                    <span>بلاغ ماكسمو #{ticket.maximoNumber}</span>
                    {copiedMaximo ? (
                      <Check className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <Copy className="w-3 h-3 text-emerald-700" />
                    )}
                  </button>
                )}

                {ticket?.maximoUrl && (
                  <a
                    href={ticket.maximoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>رابط البلاغ في ماكسمو</span>
                  </a>
                )}
              </div>
            </div>

            {/* Defects that were reported */}
            {currentItem.defects && currentItem.defects.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-slate-500 font-bold ml-1">الأعطال المبلّغ عنها:</span>
                {currentItem.defects.map((d) => {
                  const tag = DEFECT_TAGS.find((t) => t.id === d);
                  return (
                    <span
                      key={d}
                      className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]"
                    >
                      {tag ? tag.labelAr : d}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Maintenance Closure Report */}
            <div className="bg-white border border-purple-200 rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-purple-900 font-bold">
                <span className="flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5 text-purple-600" />
                  <span>إفادة الصيانة عند الإغلاق ({ticket?.closedBy || 'فريق الصيانة'}):</span>
                </span>
                {ticket?.closedAt && (
                  <span className="font-mono text-[10px] text-slate-500">
                    {formatStandardDate(ticket.closedAt)}
                  </span>
                )}
              </div>
              <p className="text-slate-700">
                {ticket?.closureNotes || 'تم إتمام الإصلاح وإغلاق البلاغ في النظام.'}
              </p>

              {/* Maximo Attachment & Before/After Photos (On-Demand Photo Frames) */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {(ticket?.hasClosurePhoto || ticket?.closurePhotoBase64) && (
                  <OnDemandPhotoSlot
                    loadedUrl={loadedVault?.closurePhotoBase64 || ticket?.closurePhotoBase64}
                    mediaType="image"
                    badgeLabel="بعد الإصلاح"
                    badgeTone="emerald"
                    sizeClass="w-20 h-20"
                    isLoading={loadingTarget === 'after_0'}
                    onClick={() => handleLoadAndPreviewGateMedia('after', 0)}
                  />
                )}

                {(currentItem.hasPhoto ||
                  currentItem.photoBase64 ||
                  (currentItem.mediaCount || 0) > 0) &&
                  (currentItem.mediaMeta && currentItem.mediaMeta.length > 0
                    ? currentItem.mediaMeta
                    : Array.from(
                        { length: currentItem.mediaCount || 1 },
                        (_, i) => ({ id: `gate_b_${i}`, type: 'image' as const })
                      )
                  ).map((meta, idx, arr) => (
                    <OnDemandPhotoSlot
                      key={meta.id || idx}
                      loadedUrl={
                        loadedVault?.media?.[idx]?.url ||
                        (idx === 0
                          ? loadedVault?.photoBase64 || currentItem.photoBase64
                          : undefined)
                      }
                      mediaType={meta.type || 'image'}
                      badgeLabel={arr.length > 1 ? `قبل #${idx + 1}` : 'قبل الإصلاح'}
                      badgeTone="slate"
                      sizeClass="w-20 h-20"
                      isLoading={loadingTarget === `before_${idx}`}
                      onClick={() => handleLoadAndPreviewGateMedia('before', idx)}
                    />
                  ))}

                {(ticket?.hasMaximoAttachment || ticket?.maximoAttachmentBase64) && (
                  <OnDemandPhotoSlot
                    loadedUrl={
                      loadedVault?.maximoAttachmentBase64 || ticket?.maximoAttachmentBase64
                    }
                    mediaType={ticket.maximoAttachmentType === 'pdf' ? 'pdf' : 'image'}
                    badgeLabel={ticket.maximoAttachmentType === 'pdf' ? 'PDF ماكسمو' : 'مرفق ماكسمو'}
                    badgeTone="blue"
                    sizeClass="w-20 h-20"
                    isLoading={loadingTarget === 'maximo_0'}
                    onClick={() => handleLoadAndPreviewGateMedia('maximo', 0)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Step 1: Was it actually fixed? */}
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-900">
              هل تم الإصلاح؟
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsFixed(true);
                  if (rating < 3) setRating(5);
                }}
                className={`p-3 rounded-xl border-2 font-bold flex flex-col items-center gap-1.5 transition ${
                  isFixed === true
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2
                  className={`w-6 h-6 ${isFixed === true ? 'text-emerald-600' : 'text-slate-400'}`}
                />
                <span>نعم، تم الإصلاح</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsFixed(false);
                  setRating(1);
                }}
                className={`p-3 rounded-xl border-2 font-bold flex flex-col items-center gap-1.5 transition ${
                  isFixed === false
                    ? 'bg-rose-50 border-rose-600 text-rose-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <XCircle
                  className={`w-6 h-6 ${isFixed === false ? 'text-rose-600' : 'text-slate-400'}`}
                />
                <span>لا، لم يتم الإصلاح</span>
              </button>
            </div>
          </div>

          {/* Step 2: Star Rating */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-slate-900">تقييم الخدمة:</label>
            <div className="flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 rounded-xl py-2.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 transition transform active:scale-125"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Photo & Feedback */}
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-900">
              {isFixed
                ? 'ملاحظات وصورة (اختياري):'
                : 'سبب الرفض وصورة العطل (إلزامي):'}
            </label>

            <div className="flex gap-2">
              {photoBase64 ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 shrink-0">
                  <img src={photoBase64} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoBase64(undefined)}
                    className="absolute top-1 left-1 bg-rose-600 text-white p-1 rounded-md"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="w-24 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={isCompressing}
                  />
                  <Camera className="w-5 h-5 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-600">
                    {isCompressing ? 'جاري...' : 'إرفاق صورة'}
                  </span>
                </label>
              )}

              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                required={!isFixed}
                placeholder={
                  isFixed
                    ? 'ملاحظات...'
                    : 'سبب رفض الإغلاق...'
                }
                rows={3}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Step 4: Mandatory KSU Service Evaluation Form Confirmation when Approved */}
          {isFixed && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-3.5 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-blue-950 text-xs">
                  نموذج تقييم الخدمة بالجامعة:
                </span>
                {ticket?.maximoNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ticket.maximoNumber!);
                      setCopiedMaximo(true);
                      setTimeout(() => setCopiedMaximo(false), 2000);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-blue-300 text-blue-900 font-mono font-bold text-[11px] inline-flex items-center gap-1 hover:bg-blue-100"
                  >
                    <span>رقم البلاغ: {ticket.maximoNumber}</span>
                    {copiedMaximo ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>

              <a
                href={KSU_SERVICE_EVALUATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح نموذج تقييم الخدمة (forms.ksu.edu.sa)</span>
              </a>

              <label className="flex items-start gap-2.5 bg-white border border-blue-200 rounded-xl p-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ksuConfirmed}
                  onChange={(e) => setKsuConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-400"
                />
                <span className="text-xs font-bold text-slate-900 leading-snug">
                  تم رفع التقييم برقم البلاغ بحالة (مكتمل)
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isCompressing || (isFixed === true && !ksuConfirmed)}
            className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              isFixed
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {isSubmitting ? (
              <span>جاري الحفظ...</span>
            ) : isFixed ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>اعتماد إغلاق البلاغ</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>رفض الإغلاق وإعادة فتح البلاغ</span>
              </>
            )}
          </button>
        </form>
      </div>

      {previewGallery && (
        <ImageViewerModal
          src={previewGallery.items[previewGallery.initialIndex]?.url || null}
          items={previewGallery.items}
          initialIndex={previewGallery.initialIndex}
          title={previewGallery.title}
          onClose={() => setPreviewGallery(null)}
        />
      )}
    </div>
  );
};

