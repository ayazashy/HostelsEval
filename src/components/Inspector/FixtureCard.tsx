// ============================================================================
// 🛠️ بطاقة فحص المرفق (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  FixtureEvaluation,
  FixtureStatus,
  FixtureTemplate,
  FacilityCategoryCode,
} from '../../types/hostel';
import { DEFECT_TAGS } from '../../config/facilityTemplates';
import { generateFixtureUID } from '../../utils/uidGenerator';
import { compressAndWatermarkImage } from '../../utils/imageCompressor';
import { CloudSaveResult } from '../../services/firestoreService';
import {
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Check,
  Lock,
  Cloud,
} from 'lucide-react';

interface FixtureCardProps {
  buildingId: string;
  wingId: number;
  floor: number;
  categoryCode: FacilityCategoryCode;
  template: FixtureTemplate;
  fixtureIndex: number;
  existingEvaluation?: FixtureEvaluation;
  inspectorName: string;
  onSave: (evaluation: FixtureEvaluation) => Promise<CloudSaveResult>;
  isReadOnly?: boolean;
  onOpenLogin?: () => void;
}

export const FixtureCard: React.FC<FixtureCardProps> = ({
  buildingId,
  wingId,
  floor,
  categoryCode,
  template,
  fixtureIndex,
  existingEvaluation,
  inspectorName,
  onSave,
  isReadOnly = false,
  onOpenLogin,
}) => {
  const fixtureId = generateFixtureUID({
    buildingId,
    wingId,
    floor,
    categoryCode,
    fixtureTypeCode: template.typeCode,
    fixtureIndex,
  });

  const [status, setStatus] = useState<FixtureStatus>(
    existingEvaluation?.status || 'operational'
  );
  const [selectedDefects, setSelectedDefects] = useState<string[]>(
    existingEvaluation?.defects || []
  );
  const [notes, setNotes] = useState<string>(existingEvaluation?.notes || '');
  const [photoBase64, setPhotoBase64] = useState<string | undefined>(
    existingEvaluation?.photoBase64
  );
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    status: 'idle' | 'cloud_success' | 'local_only' | 'error';
    message?: string;
  }>({ status: 'idle' });

  // 🔄 Sync component state whenever existing evaluation changes or loads from cloud/cache
  useEffect(() => {
    if (existingEvaluation) {
      setStatus(existingEvaluation.status);
      setSelectedDefects(existingEvaluation.defects || []);
      setNotes(existingEvaluation.notes || '');
      setPhotoBase64(existingEvaluation.photoBase64);
    } else {
      setStatus('operational');
      setSelectedDefects([]);
      setNotes('');
      setPhotoBase64(undefined);
    }
  }, [existingEvaluation, fixtureId]);

  const toggleDefect = (defectId: string) => {
    let nextDefects: string[];
    if (selectedDefects.includes(defectId)) {
      nextDefects = selectedDefects.filter((d) => d !== defectId);
    } else {
      nextDefects = [...selectedDefects, defectId];
      if (status === 'operational') {
        setStatus('needs_maintenance');
      }
    }
    setSelectedDefects(nextDefects);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const result = await compressAndWatermarkImage(file, {
        fixtureId,
        inspectorName,
      });
      setPhotoBase64(result.base64);
    } catch {
      alert('حدث خطأ أثناء معالجة الصورة، يرجى المحاولة مجدداً');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleCardSave = async () => {
    if (isReadOnly) {
      if (onOpenLogin) onOpenLogin();
      return;
    }

    setIsSaving(true);
    setSaveFeedback({ status: 'idle' });

    const evaluationData: FixtureEvaluation = {
      id: fixtureId,
      buildingId,
      wingId,
      floor,
      categoryCode,
      fixtureTypeCode: template.typeCode,
      fixtureIndex,
      status,
      defects: selectedDefects,
      notes,
      rating: status === 'operational' ? 5 : status === 'needs_maintenance' ? 3 : 1,
      photoBase64,
      hasPhoto: !!photoBase64,
      inspectorName,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await onSave(evaluationData);
      setIsSaving(false);

      if (res && res.cloudSynced) {
        setSaveFeedback({
          status: 'cloud_success',
          message: 'تم الحفظ سحابياً ☁️ ✓',
        });
      } else if (res && res.success) {
        setSaveFeedback({
          status: 'local_only',
          message: res.cloudError
            ? `حُفظ محلياً (${res.cloudError})`
            : 'حُفظ في الذاكرة المؤقتة',
        });
      } else {
        setSaveFeedback({
          status: 'error',
          message: res?.cloudError || 'تعذر الحفظ: غير مصرح بالكتابة',
        });
      }
    } catch (err: any) {
      setIsSaving(false);
      setSaveFeedback({
        status: 'error',
        message: err?.message || 'حدث خطأ أثناء الحفظ',
      });
    }

    setTimeout(() => {
      setSaveFeedback({ status: 'idle' });
    }, 4500);
  };

  const getCardBorder = () => {
    if (status === 'broken') return 'border-rose-300 bg-rose-50/30';
    if (status === 'needs_maintenance') return 'border-amber-300 bg-amber-50/30';
    return 'border-slate-200 bg-white';
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition shadow-sm ${getCardBorder()} flex flex-col gap-3.5`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
              status === 'broken'
                ? 'bg-rose-100 text-rose-700'
                : status === 'needs_maintenance'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {fixtureIndex}#
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>{template.nameAr}</span>
              <span className="text-xs text-slate-500">({fixtureIndex})</span>
            </h4>
            <span className="text-[11px] font-mono text-slate-500">
              {fixtureId}
            </span>
          </div>
        </div>

        {saveFeedback.status === 'cloud_success' && (
          <span className="text-xs text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300 font-bold flex items-center gap-1.5 shadow-sm animate-pulse">
            <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" />
            <span>{saveFeedback.message}</span>
          </span>
        )}
        {saveFeedback.status === 'local_only' && (
          <span className="text-xs text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 font-bold flex items-center gap-1.5 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>{saveFeedback.message}</span>
          </span>
        )}
        {saveFeedback.status === 'error' && (
          <span className="text-xs text-rose-800 bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-300 font-bold flex items-center gap-1.5 shadow-sm">
            <XCircle className="w-3.5 h-3.5 text-rose-700" />
            <span>{saveFeedback.message}</span>
          </span>
        )}
      </div>

      {/* Status Segmented Control */}
      <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setStatus('operational');
            setSelectedDefects([]);
          }}
          className={`py-1.5 px-1 text-xs rounded-lg font-bold flex items-center justify-center gap-1 transition ${
            status === 'operational'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>سليم</span>
        </button>

        <button
          type="button"
          onClick={() => setStatus('needs_maintenance')}
          className={`py-1.5 px-1 text-xs rounded-lg font-bold flex items-center justify-center gap-1 transition ${
            status === 'needs_maintenance'
              ? 'bg-white text-amber-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>صيانة</span>
        </button>

        <button
          type="button"
          onClick={() => setStatus('broken')}
          className={`py-1.5 px-1 text-xs rounded-lg font-bold flex items-center justify-center gap-1 transition ${
            status === 'broken'
              ? 'bg-white text-rose-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-rose-600" />
          <span>عاطل/تالف</span>
        </button>
      </div>

      {/* Defect Chips */}
      {status !== 'operational' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-700">
            حدد نوع الخلل:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DEFECT_TAGS.map((defect) => {
              const isSelected = selectedDefects.includes(defect.id);
              return (
                <button
                  key={defect.id}
                  type="button"
                  onClick={() => toggleDefect(defect.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition ${
                    isSelected
                      ? defect.severity === 'critical'
                        ? 'bg-rose-100 border-rose-300 text-rose-800 font-bold'
                        : 'bg-amber-100 border-amber-300 text-amber-800 font-bold'
                      : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{defect.labelAr}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Photo & Notes */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-slate-100">
        <div className="flex-1">
          {photoBase64 ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={photoBase64}
                alt="دليل التفتيش"
                className="w-full h-24 object-cover"
              />
              <button
                type="button"
                onClick={() => setPhotoBase64(undefined)}
                className="absolute top-1.5 left-1.5 bg-rose-600 text-white p-1 rounded-lg hover:bg-rose-700"
                title="حذف الصورة"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 h-24">
              {/* Option 1: Direct Camera Snap */}
              <label className="cursor-pointer border border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-2 flex flex-col items-center justify-center gap-1 text-center bg-slate-50 hover:bg-white transition group">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                  disabled={isCompressing}
                />
                <Camera className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition" />
                <span className="font-bold text-[11px] text-slate-700 leading-tight">
                  {isCompressing ? 'جاري...' : 'التقاط بالكاميرا'}
                </span>
                <span className="text-[9px] text-slate-400">تصوير مباشر</span>
              </label>

              {/* Option 2: Upload from Library / Gallery */}
              <label className="cursor-pointer border border-dashed border-slate-300 hover:border-violet-500 rounded-xl p-2 flex flex-col items-center justify-center gap-1 text-center bg-slate-50 hover:bg-white transition group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoCapture}
                  className="hidden"
                  disabled={isCompressing}
                />
                <ImageIcon className="w-5 h-5 text-slate-500 group-hover:text-violet-600 transition" />
                <span className="font-bold text-[11px] text-slate-700 leading-tight">
                  {isCompressing ? 'جاري...' : 'اختيار من المعرض'}
                </span>
                <span className="text-[9px] text-slate-400">مكتبة الصور</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex-1">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية (اختياري)..."
            rows={3}
            className="w-full h-full text-xs bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 placeholder-slate-400 focus:bg-white resize-none"
          />
        </div>
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={handleCardSave}
        disabled={isSaving}
        className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
          isReadOnly
            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            : status === 'broken'
            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
            : status === 'needs_maintenance'
            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
        }`}
      >
        {isReadOnly ? (
          <>
            <Lock className="w-4 h-4 text-slate-500" />
            <span>تسجيل الدخول مطلوب لتعديل التقييم</span>
          </>
        ) : (
          <>
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'جاري الحفظ...' : `حفظ تقييم المرفق (${fixtureId})`}</span>
          </>
        )}
      </button>
    </div>
  );
};
