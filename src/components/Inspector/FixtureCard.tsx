// ============================================================================
// 🛠️ بطاقة المرفق الذكية المتوافقة مع الجوال (Mobile-First Facility Card V3)
// تدعم: الاختيارات المسبقة الدقيقة لكل مرفق، الوسائط المتعددة، ومحادثة تحديثات المرفق المستمرة
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  FixtureEvaluation,
  FixtureStatus,
  FixtureTemplate,
  FacilityCategoryCode,
  FacilityMediaItem,
  FacilityHistoryEvent,
} from '../../types/hostel';
import {
  DEFECT_TAGS,
  SERVICE_DEPARTMENTS,
  resolveEvaluationDepartment,
} from '../../config/facilityTemplates';
import { generateFixtureUID } from '../../utils/uidGenerator';
import { processFacilityMediaFile, compressAndWatermarkImage } from '../../utils/imageCompressor';
import {
  CloudSaveResult,
  appendFacilityChatMessage,
  evaluateClosedTicket,
} from '../../services/firestoreService';
import { ImageViewerModal } from '../Common/ImageViewerModal';
import {
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Check,
  Lock,
  MessageSquare,
  Wrench,
  FileText,
  Film,
  ChevronDown,
  ChevronUp,
  Plus,
  Star,
  Send,
  X,
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
  isLockedByEvaluationGate?: boolean;
  onOpenGateModal?: () => void;
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
  isLockedByEvaluationGate = false,
  onOpenGateModal,
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
  const [mediaList, setMediaList] = useState<FacilityMediaItem[]>(() => {
    if (existingEvaluation?.media && existingEvaluation.media.length > 0) {
      return existingEvaluation.media;
    }
    if (existingEvaluation?.photoBase64) {
      return [
        {
          id: 'legacy_photo',
          type: 'image',
          url: existingEvaluation.photoBase64,
          capturedAt: existingEvaluation.updatedAt,
          capturedBy: existingEvaluation.inspectorName,
        },
      ];
    }
    return [];
  });

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showAllDefects, setShowAllDefects] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    status: 'idle' | 'cloud_success' | 'local_only' | 'error';
    message?: string;
  }>({ status: 'idle' });

  // Per-Facility Chat Thread State
  const [chatText, setChatText] = useState<string>('');
  const [chatPhotoBase64, setChatPhotoBase64] = useState<string | undefined>(undefined);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [quickRejectReason, setQuickRejectReason] = useState<string>('');
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);

  useEffect(() => {
    if (existingEvaluation) {
      setStatus(existingEvaluation.status);
      setSelectedDefects(existingEvaluation.defects || []);
      setNotes(existingEvaluation.notes || '');
      if (existingEvaluation.media && existingEvaluation.media.length > 0) {
        setMediaList(existingEvaluation.media);
      } else if (existingEvaluation.photoBase64) {
        setMediaList([
          {
            id: 'legacy_photo',
            type: 'image',
            url: existingEvaluation.photoBase64,
            capturedAt: existingEvaluation.updatedAt,
            capturedBy: existingEvaluation.inspectorName,
          },
        ]);
      } else {
        setMediaList([]);
      }
    } else {
      setStatus('operational');
      setSelectedDefects([]);
      setNotes('');
      setMediaList([]);
    }
  }, [existingEvaluation, fixtureId]);

  const checkPermissionAndGate = (): boolean => {
    if (isReadOnly) {
      if (onOpenLogin) onOpenLogin();
      return false;
    }
    if (isLockedByEvaluationGate) {
      if (onOpenGateModal) onOpenGateModal();
      return false;
    }
    return true;
  };

  // Fixture-specific pre-defined defect tags from نطاق بلاغات الصيانة العامة.docx
  const primaryDefects = React.useMemo(() => {
    const defaultIds = template.defaultDefectTags || [];
    const matched = defaultIds
      .map((id) => DEFECT_TAGS.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t);
    // Also include any already-selected defects so they remain visible
    for (const selId of selectedDefects) {
      if (!matched.some((m) => m.id === selId)) {
        const found = DEFECT_TAGS.find((t) => t.id === selId);
        if (found) matched.push(found);
      }
    }
    return matched.length > 0 ? matched : DEFECT_TAGS.slice(0, 12);
  }, [template.defaultDefectTags, selectedDefects]);

  const visibleDefects = showAllDefects ? DEFECT_TAGS : primaryDefects;

  // 1-Tap Quick "Operational" Save for fast mobile walkthroughs
  const handleQuickMarkOperational = async () => {
    if (!checkPermissionAndGate()) return;

    setStatus('operational');
    setSelectedDefects([]);
    setIsExpanded(false);
    setIsSaving(true);

    const primaryImage = mediaList.find((m) => m.type === 'image')?.url;
    const evaluationData: FixtureEvaluation = {
      id: fixtureId,
      buildingId,
      wingId,
      floor,
      categoryCode,
      fixtureTypeCode: template.typeCode,
      fixtureIndex,
      status: 'operational',
      defects: [],
      notes: '',
      rating: 5,
      photoBase64: primaryImage,
      hasPhoto: mediaList.length > 0,
      media: mediaList,
      history: existingEvaluation?.history,
      maintenanceTicket: existingEvaluation?.maintenanceTicket,
      inspectorName,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await onSave(evaluationData);
      setIsSaving(false);
      setSaveFeedback({
        status: res.cloudSynced ? 'cloud_success' : 'local_only',
        message: res.cloudSynced ? 'سليم ✓' : 'حُفظ محلياً ✓',
      });
    } catch {
      setIsSaving(false);
      setSaveFeedback({ status: 'error', message: 'تعذر الحفظ' });
    }

    setTimeout(() => setSaveFeedback({ status: 'idle' }), 3000);
  };

  const handleOpenIssueReport = (targetStatus: FixtureStatus = 'needs_maintenance') => {
    if (!checkPermissionAndGate()) return;
    if (status === 'operational') {
      setStatus(targetStatus);
    }
    setIsExpanded(true);
  };

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

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (mediaList.length + files.length > 6) {
      alert('الحد الأقصى 6 ملفات وسائط لكل مرفق لضمان سرعة المزامنة السحابية.');
      return;
    }

    setIsProcessingMedia(true);
    try {
      const newItems: FacilityMediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const item = await processFacilityMediaFile(files[i], {
          fixtureId,
          actorName: inspectorName,
        });
        newItems.push(item);
      }
      setMediaList((prev) => [...prev, ...newItems]);
    } catch (err: any) {
      alert(err?.message || 'حدث خطأ أثناء معالجة الملف المرفق');
    } finally {
      setIsProcessingMedia(false);
      e.target.value = '';
    }
  };

  const handleRemoveMedia = (id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCardSave = async () => {
    if (!checkPermissionAndGate()) return;

    setIsSaving(true);
    setSaveFeedback({ status: 'idle' });

    const primaryImage = mediaList.find((m) => m.type === 'image')?.url;

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
      photoBase64: primaryImage,
      hasPhoto: mediaList.length > 0,
      media: mediaList,
      history: existingEvaluation?.history,
      maintenanceTicket: existingEvaluation?.maintenanceTicket,
      inspectorName,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await onSave(evaluationData);
      setIsSaving(false);
      setIsExpanded(false);

      if (res && res.cloudSynced) {
        setSaveFeedback({
          status: 'cloud_success',
          message: 'تم فتح/تحديث البلاغ سحابياً ☁️ ✓',
        });
      } else if (res && res.success) {
        setSaveFeedback({
          status: 'local_only',
          message: 'حُفظ محلياً ✓',
        });
      } else {
        setSaveFeedback({
          status: 'error',
          message: res?.cloudError || 'تعذر الحفظ',
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
    }, 4000);
  };

  // Send a message/photo inside the Facility Chat Thread
  const handleChatPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingMedia(true);
    try {
      const res = await compressAndWatermarkImage(file, {
        fixtureId,
        inspectorName,
      });
      setChatPhotoBase64(res.base64);
    } catch {
      alert('تعذر ضغط الصورة');
    } finally {
      setIsProcessingMedia(false);
      e.target.value = '';
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    if (!chatText.trim() && !chatPhotoBase64) return;

    setIsSendingChat(true);
    try {
      const baseEval: FixtureEvaluation = existingEvaluation || {
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
        rating: 5,
        hasPhoto: false,
        inspectorName,
        updatedAt: new Date().toISOString(),
      };

      await appendFacilityChatMessage(baseEval, {
        message: chatText.trim() || 'مرفق صورة تحديث للمرفق',
        actorName: inspectorName,
        actorRole: 'leader',
        photoBase64: chatPhotoBase64,
      });

      setChatText('');
      setChatPhotoBase64(undefined);
      // Trigger parent refresh
      await onSave({
        ...baseEval,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsSendingChat(false);
    }
  };

  // Direct Approve / Reject from inside the Facility Chat Thread
  const handleQuickApproveInThread = async () => {
    if (!existingEvaluation || isReadOnly) return;
    setIsSendingChat(true);
    try {
      await evaluateClosedTicket(existingEvaluation, {
        isFixed: true,
        rating: 5,
        feedback: 'تمت معاينة المرفق واعتماد الإصلاح من داخل محادثة المرفق ✅',
        leaderName: inspectorName,
      });
      window.location.reload();
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleQuickRejectInThread = async () => {
    if (!existingEvaluation || isReadOnly) return;
    if (!quickRejectReason.trim()) {
      alert('يرجى كتابة سبب الرفض ليظهر للفني عند إعادة فتح البلاغ');
      return;
    }
    setIsSendingChat(true);
    try {
      await evaluateClosedTicket(existingEvaluation, {
        isFixed: false,
        rating: 1,
        feedback: quickRejectReason.trim(),
        leaderName: inspectorName,
      });
      setShowRejectInput(false);
      setQuickRejectReason('');
      window.location.reload();
    } finally {
      setIsSendingChat(false);
    }
  };

  const historyList: FacilityHistoryEvent[] = existingEvaluation?.history || [];
  const ticket = existingEvaluation?.maintenanceTicket;
  const isEvaluatedBefore = !!existingEvaluation;

  // Determine routed department badge
  const activeDeptKey = resolveEvaluationDepartment({
    categoryCode,
    fixtureTypeCode: template.typeCode,
    defects: selectedDefects,
    maintenanceTicket: ticket,
  });
  const activeDeptInfo = SERVICE_DEPARTMENTS[activeDeptKey];

  const getCardStyle = () => {
    if (ticket?.status === 'pending_evaluation') {
      return 'border-purple-300 bg-purple-50/40';
    }
    if (ticket?.status === 'reopened') {
      return 'border-rose-400 bg-rose-50/50 ring-1 ring-rose-200';
    }
    if (status === 'broken') return 'border-rose-300 bg-rose-50/30';
    if (status === 'needs_maintenance') return 'border-amber-300 bg-amber-50/30';
    if (isEvaluatedBefore) return 'border-emerald-200 bg-white';
    return 'border-slate-200 bg-white';
  };

  return (
    <div
      className={`rounded-2xl border p-3.5 sm:p-4 transition shadow-xs ${getCardStyle()} flex flex-col gap-3`}
    >
      {/* Compact Mobile-First Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
              status === 'broken'
                ? 'bg-rose-100 text-rose-700'
                : status === 'needs_maintenance'
                ? 'bg-amber-100 text-amber-700'
                : isEvaluatedBefore
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            #{fixtureIndex}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 truncate">
              {template.nameAr} ({fixtureIndex})
            </h4>
            <p className="text-[10px] text-slate-500 truncate">{template.nameEn}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[10px] font-mono text-slate-500">{fixtureId}</span>
              {status !== 'operational' && activeDeptInfo && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activeDeptInfo.badgeClass}`}
                >
                  {activeDeptInfo.nameAr}
                </span>
              )}
              {ticket?.maximoNumber && (
                <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                  ماكسمو #{ticket.maximoNumber}
                </span>
              )}
              {ticket?.status === 'pending_evaluation' && (
                <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-300 animate-pulse">
                  بانتظار معاينتك واعتمادك ⭐
                </span>
              )}
              {ticket?.status === 'reopened' && (
                <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300">
                  معاد فتحه 🔄
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Facility Chat / History Thread Button & Save Feedback */}
        <div className="flex items-center gap-1.5 shrink-0">
          {saveFeedback.status !== 'idle' && (
            <span
              className={`text-[11px] px-2 py-1 rounded-lg font-bold border ${
                saveFeedback.status === 'cloud_success'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : saveFeedback.status === 'local_only'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-rose-100 text-rose-800 border-rose-300'
              }`}
            >
              {saveFeedback.message}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition border ${
              ticket?.status === 'pending_evaluation'
                ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="شريط محادثة وتحديثات المرفق"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>المحادثة ({historyList.length})</span>
          </button>
        </div>
      </div>

      {/* Summary of Active Defects & Media Thumbnails when collapsed */}
      {!isExpanded && (selectedDefects.length > 0 || mediaList.length > 0 || notes) && (
        <div className="flex flex-col gap-2 bg-white/80 p-2.5 rounded-xl border border-slate-200/80">
          {selectedDefects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedDefects.map((dId) => {
                const tag = DEFECT_TAGS.find((t) => t.id === dId);
                return (
                  <span
                    key={dId}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-bold"
                  >
                    {tag ? `${tag.labelAr} (${tag.labelEn})` : dId}
                  </span>
                );
              })}
            </div>
          )}

          {notes && <p className="text-xs text-slate-600 line-clamp-2">ملاحظة: {notes}</p>}

          {mediaList.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {mediaList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => item.type === 'image' && setPreviewImage(item.url)}
                  className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 cursor-pointer"
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  ) : item.type === 'video' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white text-[9px]">
                      <Film className="w-4 h-4 mb-0.5" />
                      <span>فيديو</span>
                    </div>
                  ) : (
                    <a
                      href={item.url}
                      download={item.name || 'attachment.pdf'}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-full flex flex-col items-center justify-center bg-rose-50 text-rose-700 text-[9px] font-bold"
                    >
                      <FileText className="w-4 h-4 mb-0.5" />
                      <span>PDF</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Action Bar (Thumb-Friendly for Phone Users) */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleQuickMarkOperational}
          className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border ${
            isEvaluatedBefore && status === 'operational'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>سليم</span>
        </button>

        <button
          type="button"
          onClick={() => handleOpenIssueReport('needs_maintenance')}
          className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border ${
            status === 'needs_maintenance'
              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
              : 'bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-700 border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{categoryCode === 'CLN' ? 'يحتاج نظافة/رش' : 'يحتاج صيانة'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleOpenIssueReport('broken')}
          className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border ${
            status === 'broken'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200'
          }`}
        >
          <XCircle className="w-4 h-4 shrink-0" />
          <span>عاطل / طارئ</span>
        </button>
      </div>

      {/* Expand/Collapse Toggle if already has issue */}
      {(status !== 'operational' || isExpanded) && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[11px] font-bold text-blue-700 hover:text-blue-800 flex items-center justify-center gap-1 py-1 bg-blue-50/60 rounded-lg border border-blue-100"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>إخفاء خيارات العطل والوسائط</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>تحديد نوع العطل / إرفاق صور وتوضيح ({mediaList.length})</span>
            </>
          )}
        </button>
      )}

      {/* Expanded Issue & Multi-Media Editor */}
      {isExpanded && (
        <div className="flex flex-col gap-3.5 pt-2 border-t border-slate-200 animate-in fade-in duration-150">
          {/* Standardized Pre-Defined Defect Chips */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800">
                1. اختر العطل المحدد من القائمة المعيارية (يظهر للفني بالعربية والإنجليزية):
              </label>
              <button
                type="button"
                onClick={() => setShowAllDefects(!showAllDefects)}
                className="text-[11px] font-bold text-blue-600 hover:underline shrink-0"
              >
                {showAllDefects ? 'عرض أعطال هذا المرفق فقط' : 'عرض كافة الأعطال (+)'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {visibleDefects.map((defect) => {
                const isSelected = selectedDefects.includes(defect.id);
                return (
                  <button
                    key={defect.id}
                    type="button"
                    onClick={() => toggleDefect(defect.id)}
                    className={`text-right px-3 py-1.5 rounded-xl border transition flex flex-col ${
                      isSelected
                        ? defect.severity === 'critical'
                          ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                          : 'bg-amber-500 border-amber-500 text-white shadow-xs'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold">{defect.labelAr}</span>
                    <span
                      className={`text-[10px] ${
                        isSelected ? 'text-white/90' : 'text-slate-500'
                      }`}
                    >
                      {defect.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-Media Uploader (Multiple Photos, Short Video, PDF) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                2. تصوير العطل ({mediaList.length}/6 صور أو فيديو):
              </label>
              {isProcessingMedia && (
                <span className="text-[11px] font-bold text-blue-600 animate-pulse">
                  جاري ضغط وإرفاق الوسائط...
                </span>
              )}
            </div>

            {mediaList.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {mediaList.map((item) => (
                  <div
                    key={item.id}
                    className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shrink-0 group"
                  >
                    {item.type === 'image' ? (
                      <img
                        src={item.url}
                        alt="مرفق"
                        onClick={() => setPreviewImage(item.url)}
                        className="w-full h-full object-cover cursor-pointer"
                      />
                    ) : item.type === 'video' ? (
                      <video
                        src={item.url}
                        controls
                        className="w-full h-full object-cover bg-black"
                      />
                    ) : (
                      <a
                        href={item.url}
                        download={item.name || 'document.pdf'}
                        className="w-full h-full flex flex-col items-center justify-center bg-rose-50 text-rose-700 text-[10px] font-bold p-1 text-center"
                      >
                        <FileText className="w-5 h-5 mb-1" />
                        <span className="truncate w-full">{item.name || 'PDF'}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveMedia(item.id)}
                      className="absolute top-1 left-1 bg-rose-600 text-white p-1 rounded-lg shadow-sm"
                      title="حذف المرفق"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="cursor-pointer border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-xl p-3 flex items-center justify-center gap-2 bg-blue-50/50 hover:bg-blue-50 transition active:scale-98">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleMediaUpload}
                  className="hidden"
                  disabled={isProcessingMedia}
                />
                <Camera className="w-5 h-5 text-blue-600 shrink-0" />
                <span className="font-bold text-xs text-blue-900">التقاط صورة بالكاميرا</span>
              </label>

              <label className="cursor-pointer border-2 border-dashed border-slate-300 hover:border-violet-500 rounded-xl p-3 flex items-center justify-center gap-2 bg-slate-50 hover:bg-violet-50/40 transition active:scale-98">
                <input
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  multiple
                  onChange={handleMediaUpload}
                  className="hidden"
                  disabled={isProcessingMedia}
                />
                <Plus className="w-5 h-5 text-violet-600 shrink-0" />
                <span className="font-bold text-xs text-slate-800">صور متعددة / فيديو</span>
              </label>
            </div>
          </div>

          {/* Optional Side Note / Clarification */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-800">
              3. توضيح إضافي على جنب (اختياري):
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي توضيح إضافي بجانب الاختيار (مثال: المغسلة الوسطى بجوار الباب)..."
              rows={2}
              className="w-full text-xs bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleCardSave}
            disabled={isSaving || isProcessingMedia}
            className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
              isReadOnly
                ? 'bg-slate-200 text-slate-700'
                : status === 'broken'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : status === 'needs_maintenance'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isReadOnly ? (
              <>
                <Lock className="w-4 h-4" />
                <span>تسجيل الدخول مطلوب لحفظ البلاغ</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {isSaving
                    ? 'جاري إرسال البلاغ للقسم المختص...'
                    : `إرسال البلاغ إلى (${activeDeptInfo?.nameAr || 'الصيانة'}) وتحديث محادثة المرفق`}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Per-Facility Continuous Chat & Lifecycle Thread Modal (محادثة وتحديثات المرفق المستمرة) */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>محادثة وتاريخ المرفق: {template.nameAr} (#{fixtureIndex})</span>
                </h3>
                <p className="text-[11px] font-mono text-slate-300 mt-0.5">
                  {fixtureId} • {template.nameEn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Active Ticket Banner + Before/After Approval + Chat Thread */}
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3 bg-slate-50">
              {/* Current Ticket Status & Direct Before/After Approval Box */}
              {ticket && (
                <div className="bg-white border border-blue-200 rounded-2xl p-3.5 text-xs flex flex-col gap-2.5 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-blue-600" />
                      <span>مسار البلاغ ({activeDeptInfo?.nameAr}):</span>
                    </span>
                    <span className="font-bold px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                      {ticket.status === 'open'
                        ? 'مفتوح لدى القسم المختص'
                        : ticket.status === 'in_progress'
                        ? 'قيد المعالجة والتنفيذ'
                        : ticket.status === 'pending_evaluation'
                        ? 'تم الإصلاح - بانتظار معاينتك واعتمادك ⭐'
                        : ticket.status === 'reopened'
                        ? 'مرفوض ومعاد فتحه 🔄'
                        : 'مغلق ومعتمد نهائياً ✅'}
                    </span>
                  </div>

                  {/* Side-by-Side Before & After Images when closed by Technician */}
                  {(existingEvaluation?.photoBase64 || ticket.closurePhotoBase64) && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-rose-700">
                          صورة البلاغ (قبل الإصلاح):
                        </span>
                        {existingEvaluation?.photoBase64 ? (
                          <img
                            src={existingEvaluation.photoBase64}
                            alt="قبل"
                            onClick={() => setPreviewImage(existingEvaluation.photoBase64 || null)}
                            className="w-full h-24 object-cover rounded-lg cursor-pointer border border-slate-200"
                          />
                        ) : (
                          <div className="h-24 flex items-center justify-center text-[10px] text-slate-400">
                            بدون صورة قبل
                          </div>
                        )}
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-2 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-emerald-800">
                          صورة الفني (بعد الإصلاح):
                        </span>
                        {ticket.closurePhotoBase64 ? (
                          <img
                            src={ticket.closurePhotoBase64}
                            alt="بعد"
                            onClick={() => setPreviewImage(ticket.closurePhotoBase64 || null)}
                            className="w-full h-24 object-cover rounded-lg cursor-pointer border border-emerald-300"
                          />
                        ) : (
                          <div className="h-24 flex items-center justify-center text-[10px] text-slate-400">
                            بانتظار صورة الإصلاح
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Direct Leader Approval / Rejection Buttons inside the Chat Thread */}
                  {!isReadOnly && ticket.status === 'pending_evaluation' && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                      <span className="font-bold text-purple-900">
                        قام الفني بإغلاق البلاغ وإرفاق النتيجة — هل تعتمد الإصلاح؟
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isSendingChat}
                          onClick={handleQuickApproveInThread}
                          className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>اعتماد الإصلاح ✅</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSendingChat}
                          onClick={() => setShowRejectInput(!showRejectInput)}
                          className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>رفض وإعادة فتح ❌</span>
                        </button>
                      </div>

                      {showRejectInput && (
                        <div className="flex gap-1.5 pt-1">
                          <input
                            type="text"
                            value={quickRejectReason}
                            onChange={(e) => setQuickRejectReason(e.target.value)}
                            placeholder="اكتب سبب الرفض لإعادة فتح البلاغ للفني..."
                            className="flex-1 bg-rose-50 border border-rose-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={handleQuickRejectInThread}
                            className="px-3 py-2 bg-rose-700 text-white rounded-xl font-bold shrink-0"
                          >
                            تأكيد الرفض
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Chronological Chat / Updates Thread */}
              {historyList.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
                  لا توجد رسائل أو بلاغات سابقة في سجل هذا المرفق حتى الآن.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {historyList.map((ev) => {
                    const d = new Date(ev.timestamp);
                    const dateStr = d.toLocaleDateString('ar-SA', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    const isTech = ev.actorRole === 'maintenance' || ev.actorRole === 'cleaning';

                    const getActionLabel = () => {
                      switch (ev.action) {
                        case 'maximo_registered':
                          return {
                            text: 'تسجيل رقم ومرفق ماكسمو 🛠️',
                            cls: 'bg-blue-100 text-blue-800',
                          };
                        case 'maintenance_closed':
                          return {
                            text: 'إتمام المعالجة وإرفاق صورة الإصلاح 🔧',
                            cls: 'bg-purple-100 text-purple-800',
                          };
                        case 'leader_verified':
                          return {
                            text: 'اعتماد الإصلاح من رائد المبنى ✅',
                            cls: 'bg-emerald-100 text-emerald-800',
                          };
                        case 'leader_rejected_reopened':
                          return {
                            text: 'رفض الإصلاح وإعادة فتح البلاغ ❌',
                            cls: 'bg-rose-100 text-rose-800',
                          };
                        case 'chat_message':
                          return {
                            text: 'رسالة متابعة وتحديث 💬',
                            cls: 'bg-slate-200 text-slate-800',
                          };
                        default:
                          return {
                            text:
                              ev.status === 'operational'
                                ? 'فحص ميداني: سليم 🟢'
                                : ev.status === 'needs_maintenance'
                                ? 'فتح بلاغ: يحتاج معالجة 🟡'
                                : 'فتح بلاغ طارئ: عاطل 🚨',
                            cls:
                              ev.status === 'operational'
                                ? 'bg-emerald-50 text-emerald-700'
                                : ev.status === 'needs_maintenance'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800',
                          };
                      }
                    };

                    const badge = getActionLabel();

                    return (
                      <div
                        key={ev.id}
                        className={`rounded-2xl border p-3 text-xs flex flex-col gap-2 shadow-2xs ${
                          isTech
                            ? 'bg-emerald-50/60 border-emerald-200 mr-4'
                            : 'bg-white border-slate-200 ml-4'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${badge.cls}`}>
                            {badge.text}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">{dateStr}</span>
                        </div>

                        <div className="text-[11px] text-slate-600 flex items-center justify-between">
                          <span>
                            المرسل: <strong>{ev.actorName}</strong>
                          </span>
                          {ev.maximoNumber && (
                            <span className="font-mono font-bold text-blue-700">
                              ماكسمو #{ev.maximoNumber}
                            </span>
                          )}
                        </div>

                        {ev.evaluationRating && (
                          <div className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>تقييم الخدمة: {ev.evaluationRating} / 5</span>
                          </div>
                        )}

                        {ev.defects && ev.defects.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {ev.defects.map((dId) => {
                              const t = DEFECT_TAGS.find((x) => x.id === dId);
                              return (
                                <span
                                  key={dId}
                                  className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-bold text-slate-800"
                                >
                                  {t ? `${t.labelAr} • ${t.labelEn}` : dId}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {ev.notes && (
                          <p className="text-slate-800 bg-slate-50 p-2 rounded-xl border border-slate-200/80">
                            {ev.notes}
                          </p>
                        )}

                        {ev.media && ev.media.length > 0 && (
                          <div className="flex items-center gap-2 overflow-x-auto pt-1">
                            {ev.media.map((m) => (
                              <div
                                key={m.id}
                                onClick={() => m.type === 'image' && setPreviewImage(m.url)}
                                className="w-16 h-16 rounded-xl overflow-hidden border border-slate-300 bg-white shrink-0 cursor-pointer"
                              >
                                {m.type === 'image' ? (
                                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold">
                                    {m.type.toUpperCase()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Chat Input Bar to post updates/photos in the facility's thread */}
            {!isReadOnly && (
              <form
                onSubmit={handleSendChatMessage}
                className="p-3 bg-white border-t border-slate-200 flex flex-col gap-2"
              >
                {chatPhotoBase64 && (
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 self-start">
                    <img
                      src={chatPhotoBase64}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setChatPhotoBase64(undefined)}
                      className="text-xs text-rose-600 font-bold px-2"
                    >
                      حذف الصورة
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label
                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0"
                    title="إرفاق صورة في محادثة المرفق"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleChatPhotoSelect}
                      className="hidden"
                      disabled={isProcessingMedia || isSendingChat}
                    />
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                  </label>

                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="أضف رسالة أو تحديثاً في سجل محادثة هذا المرفق..."
                    className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={isSendingChat || (!chatText.trim() && !chatPhotoBase64)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Full-Screen Image Lightbox */}
      {previewImage && (
        <ImageViewerModal
          src={previewImage}
          title={`توثيق ${template.nameAr} (#${fixtureIndex})`}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
};
