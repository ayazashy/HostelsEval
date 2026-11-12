// ============================================================================
// ⭐ بوابة التقييم الإلزامي لرواد المباني بعد إغلاق البلاغ (منع الإغلاق الصوري)
// تلزم رائد المبنى بتقييم البلاغات المغلقة من الصيانة قبل فتح أي بلاغ جديد
// ============================================================================

import React, { useState } from 'react';
import { FixtureEvaluation } from '../../types/hostel';
import { evaluateClosedTicket } from '../../services/firestoreService';
import { compressAndWatermarkImage } from '../../utils/imageCompressor';
import { DEFECT_TAGS } from '../../config/facilityTemplates';
import { ImageViewerModal } from '../Common/ImageViewerModal';
import {
  Star,
  CheckCircle2,
  XCircle,
  Camera,
  FileText,
  Image as ImageIcon,
  ShieldAlert,
  Wrench,
  Trash2,
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
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!currentItem) return null;

  const ticket = currentItem.maintenanceTicket;

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
    } catch {
      alert('تعذر ضغط الصورة المرفقة');
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

    setIsSubmitting(true);
    try {
      await evaluateClosedTicket(currentItem, {
        isFixed,
        rating: isFixed ? rating : Math.min(rating, 2),
        feedback,
        photoBase64,
        leaderName,
      });

      // Reset form for next pending ticket if any
      setFeedback('');
      setPhotoBase64(undefined);
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
                تقييم الخدمة الإلزامي لرائد المبنى ({buildingId})
              </h3>
              <p className="text-[11px] text-purple-100">
                متبقي {pendingTickets.length} بلاغ مغلق من الصيانة يتطلب تقييمك لفتح البلاغات الجديدة
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
                  {currentItem.buildingId} • الدور {currentItem.floor} • جناح {currentItem.wingId}
                </span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {currentItem.id}
                </span>
              </div>
              {ticket?.maximoNumber && (
                <span className="font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-300">
                  بلاغ ماكسمو #{ticket.maximoNumber}
                </span>
              )}
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
                    {new Date(ticket.closedAt).toLocaleDateString('ar-SA')}
                  </span>
                )}
              </div>
              <p className="text-slate-700">
                {ticket?.closureNotes || 'تم إتمام الإصلاح وإغلاق البلاغ في النظام.'}
              </p>

              {/* Maximo Attachment & Closure Photo */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {ticket?.maximoAttachmentBase64 && (
                  ticket.maximoAttachmentType === 'pdf' ? (
                    <a
                      href={ticket.maximoAttachmentBase64}
                      download={ticket.maximoAttachmentName || `Maximo_${ticket.maximoNumber}.pdf`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-bold"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      <span>مرفق بلاغ ماكسمو (PDF)</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(ticket.maximoAttachmentBase64 || null)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-bold"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>صورة مستند ماكسمو</span>
                    </button>
                  )
                )}

                {ticket?.closurePhotoBase64 && (
                  <button
                    type="button"
                    onClick={() => setPreviewImage(ticket.closurePhotoBase64 || null)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>صورة الصيانة بعد الإصلاح</span>
                  </button>
                )}

                {currentItem.photoBase64 && (
                  <button
                    type="button"
                    onClick={() => setPreviewImage(currentItem.photoBase64 || null)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-bold"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-slate-600" />
                    <span>صورة العطل قبل الإصلاح</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Step 1: Was it actually fixed? */}
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-900">
              1. بعد معاينتك الميدانية للمرفق، هل تم الإصلاح فعلياً؟
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
                <span>نعم، تم الإصلاح بنجاح ✅</span>
                <span className="text-[10px] font-normal text-slate-500">
                  اعتماد إغلاق البلاغ وتحويل المرفق لسليم
                </span>
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
                <span>لا، إغلاق صوري ❌</span>
                <span className="text-[10px] font-normal text-slate-500">
                  إعادة فتح البلاغ فوراً لفريق الصيانة
                </span>
              </button>
            </div>
          </div>

          {/* Step 2: Star Rating */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-slate-900">2. تقييم مستوى خدمة الصيانة (1 إلى 5 نجوم):</label>
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
                ? '3. ملاحظات التقييم أو صورة بعد الإصلاح (اختياري):'
                : '3. سبب رفض الإغلاق وصورة تثبت بقاء العطل (إلزامي لإعادة الفتح):'}
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
                    ? 'مثال: تم الإصلاح بشكل ممتاز وتغيير القطعة التالفة...'
                    : 'اشرح ما لم يتم إصلاحه ليظهر لفريق الصيانة عند إعادة فتح البلاغ...'
                }
                rows={3}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isCompressing}
            className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition flex items-center justify-center gap-2 ${
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
                <span>اعتماد الإغلاق النهائي وفتح النظام للبلاغات الجديدة</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>رفض الإغلاق الصوري وإعادة فتح البلاغ للصيانة</span>
              </>
            )}
          </button>
        </form>
      </div>

      {previewImage && (
        <ImageViewerModal
          src={previewImage}
          title="معاينة شواهد البلاغ"
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
};

