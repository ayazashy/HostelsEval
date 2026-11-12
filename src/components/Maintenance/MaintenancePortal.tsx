// ============================================================================
// 🔧 بوابة الصيانة ونظام ماكسمو (Maintenance & Maximo Portal)
// تتيح لفريق الصيانة استعراض البلاغات، نسخ متطلبات ماكسمو، تسجيل رقم البلاغ،
// رفع مرفق البلاغ (PDF أو صورة)، وإغلاق البلاغ مع تفعيل رابط التقييم الإلزامي للرائد
// ============================================================================

import React, { useState } from 'react';
import {
  BuildingInfo,
  FixtureEvaluation,
} from '../../types/hostel';
import {
  DEFECT_TAGS,
  loadActiveFacilityCategories,
} from '../../config/facilityTemplates';
import {
  updateMaximoTicketInfo,
  closeMaintenanceTicket,
} from '../../services/firestoreService';
import { processFacilityMediaFile, compressAndWatermarkImage } from '../../utils/imageCompressor';
import { ImageViewerModal } from '../Common/ImageViewerModal';
import {
  Wrench,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Building2,
  Link2,
  Camera,
  Star,
  Clock,
  Trash2,
  X,
} from 'lucide-react';

interface MaintenancePortalProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  technicianName: string;
  onRefreshEvaluations: () => void;
}

export const MaintenancePortal: React.FC<MaintenancePortalProps> = ({
  buildings,
  allEvaluations,
  technicianName,
  onRefreshEvaluations,
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'reopened' | 'pending_eval' | 'verified' | 'all'
  >('active');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Per-ticket editing state for Maximo # & attachment
  const [maximoInputs, setMaximoInputs] = useState<Record<string, string>>({});
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [uploadingAttachmentId, setUploadingAttachmentId] = useState<string | null>(null);

  // Closing Ticket Modal State
  const [closingItem, setClosingItem] = useState<FixtureEvaluation | null>(null);
  const [closureMaximoNumber, setClosureMaximoNumber] = useState<string>('');
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [closurePhotoBase64, setClosurePhotoBase64] = useState<string | undefined>(undefined);
  const [closureAttachment, setClosureAttachment] = useState<{
    base64: string;
    name: string;
    type: 'pdf' | 'image';
  } | null>(null);
  const [isProcessingClosureFile, setIsProcessingClosureFile] = useState<boolean>(false);
  const [isSubmittingClosure, setIsSubmittingClosure] = useState<boolean>(false);

  const categories = React.useMemo(() => loadActiveFacilityCategories(), []);

  const getFixtureNameAr = (item: FixtureEvaluation): string => {
    const cat = categories.find((c) => c.code === item.categoryCode);
    const tmpl =
      cat?.wingTemplates[item.wingId]?.find((t) => t.typeCode === item.fixtureTypeCode) ||
      cat?.wingTemplates[1]?.find((t) => t.typeCode === item.fixtureTypeCode);
    return tmpl ? `${tmpl.nameAr} (#${item.fixtureIndex})` : `${item.fixtureTypeCode} (#${item.fixtureIndex})`;
  };

  // All reports that are either non-operational or have a maintenanceTicket record
  const allTickets = React.useMemo(() => {
    return allEvaluations
      .filter((e) => !e.isDeleted && (e.status !== 'operational' || e.maintenanceTicket))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [allEvaluations]);

  const counts = React.useMemo(() => {
    let active = 0;
    let reopened = 0;
    let pendingEval = 0;
    let verified = 0;

    for (const t of allTickets) {
      const st = t.maintenanceTicket?.status || (t.status !== 'operational' ? 'open' : 'verified_closed');
      if (st === 'reopened') reopened++;
      else if (st === 'pending_evaluation') pendingEval++;
      else if (st === 'verified_closed' || t.status === 'operational') verified++;
      else active++;
    }
    return { active, reopened, pendingEval, verified, total: allTickets.length };
  }, [allTickets]);

  const filteredTickets = React.useMemo(() => {
    return allTickets.filter((item) => {
      if (selectedBuildingId !== 'ALL' && item.buildingId !== selectedBuildingId) {
        return false;
      }

      const st =
        item.maintenanceTicket?.status ||
        (item.status !== 'operational' ? 'open' : 'verified_closed');

      if (statusFilter === 'active' && st !== 'open' && st !== 'in_progress' && st !== 'reopened') {
        return false;
      }
      if (statusFilter === 'reopened' && st !== 'reopened') return false;
      if (statusFilter === 'pending_eval' && st !== 'pending_evaluation') return false;
      if (statusFilter === 'verified' && st !== 'verified_closed' && item.status !== 'operational') {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = item.id.toLowerCase().includes(q);
        const matchBld = item.buildingId.toLowerCase().includes(q);
        const matchMax = (item.maintenanceTicket?.maximoNumber || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        if (!matchId && !matchBld && !matchMax && !matchNotes) return false;
      }

      return true;
    });
  }, [allTickets, selectedBuildingId, statusFilter, searchQuery]);

  // Format Maximo clipboard summary so maintenance can paste directly into Maximo
  const handleCopyForMaximo = (item: FixtureEvaluation) => {
    const defectLabels = (item.defects || [])
      .map((d) => DEFECT_TAGS.find((t) => t.id === d)?.labelAr || d)
      .join(' ، ');
    const fixtureName = getFixtureNameAr(item);
    const priority = item.status === 'broken' ? 'طارئ / حرج (عاطل)' : 'صيانة اعتيادية';

    const text = [
      `بلاغ صيانة مرافق الإسكان الطلابي - جامعة الملك سعود`,
      `المبنى: مبنى ${item.buildingId.replace('B', '')} (${item.buildingId})`,
      `الموقع الدقيق: الدور ${item.floor} - جناح ${item.wingId}`,
      `المرفق: ${fixtureName} [${item.id}]`,
      `الأولوية: ${priority}`,
      `الأعطال المرصودة: ${defectLabels || 'خلل تشغيلي'}`,
      item.notes ? `ملاحظات الفاحص: ${item.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyEvaluationLink = (item: FixtureEvaluation) => {
    const url = `${window.location.origin}${window.location.pathname}?evaluate=${item.buildingId}&ticket=${item.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(item.id);
    setTimeout(() => setCopiedLinkId(null), 3000);
  };

  const handleSaveMaximoNumber = async (item: FixtureEvaluation) => {
    const val =
      maximoInputs[item.id] !== undefined
        ? maximoInputs[item.id]
        : item.maintenanceTicket?.maximoNumber || '';
    if (!val.trim()) {
      alert('يرجى إدخال رقم البلاغ في ماكسمو أولاً');
      return;
    }

    setSavingTicketId(item.id);
    try {
      await updateMaximoTicketInfo(item, {
        maximoNumber: val.trim(),
        actorName: technicianName,
      });
      onRefreshEvaluations();
    } finally {
      setSavingTicketId(null);
    }
  };

  const handleUploadMaximoAttachment = async (
    item: FixtureEvaluation,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentMaxNum =
      maximoInputs[item.id] !== undefined
        ? maximoInputs[item.id]
        : item.maintenanceTicket?.maximoNumber || 'قيد التسجيل';

    setUploadingAttachmentId(item.id);
    try {
      const processed = await processFacilityMediaFile(file, {
        fixtureId: item.id,
        actorName: technicianName,
      });

      await updateMaximoTicketInfo(item, {
        maximoNumber: currentMaxNum,
        attachmentBase64: processed.url,
        attachmentName: file.name,
        attachmentType: processed.type === 'pdf' ? 'pdf' : 'image',
        actorName: technicianName,
      });
      onRefreshEvaluations();
    } catch (err: any) {
      alert(err?.message || 'حدث خطأ أثناء رفع مرفق ماكسمو');
    } finally {
      setUploadingAttachmentId(null);
      e.target.value = '';
    }
  };

  const openCloseModal = (item: FixtureEvaluation) => {
    setClosingItem(item);
    setClosureMaximoNumber(
      maximoInputs[item.id] || item.maintenanceTicket?.maximoNumber || ''
    );
    setClosureNotes('');
    setClosurePhotoBase64(undefined);
    setClosureAttachment(null);
  };

  const handleClosureAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !closingItem) return;
    setIsProcessingClosureFile(true);
    try {
      const processed = await processFacilityMediaFile(file, {
        fixtureId: closingItem.id,
        actorName: technicianName,
      });
      setClosureAttachment({
        base64: processed.url,
        name: file.name,
        type: processed.type === 'pdf' ? 'pdf' : 'image',
      });
    } catch (err: any) {
      alert(err?.message || 'تعذر إرفاق ملف البلاغ');
    } finally {
      setIsProcessingClosureFile(false);
      e.target.value = '';
    }
  };

  const handleClosurePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !closingItem) return;
    setIsProcessingClosureFile(true);
    try {
      const res = await compressAndWatermarkImage(file, {
        fixtureId: closingItem.id,
        inspectorName: technicianName,
      });
      setClosurePhotoBase64(res.base64);
    } catch {
      alert('تعذر ضغط صورة الإصلاح');
    } finally {
      setIsProcessingClosureFile(false);
      e.target.value = '';
    }
  };

  const handleConfirmCloseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingItem) return;

    setIsSubmittingClosure(true);
    try {
      await closeMaintenanceTicket(closingItem, {
        maximoNumber: closureMaximoNumber.trim() || undefined,
        attachmentBase64: closureAttachment?.base64,
        attachmentName: closureAttachment?.name,
        attachmentType: closureAttachment?.type,
        closureNotes: closureNotes.trim() || 'تم إتمام الإصلاح وإغلاق البلاغ',
        closurePhotoBase64,
        actorName: technicianName,
      });
      setClosingItem(null);
      onRefreshEvaluations();
    } catch {
      alert('حدث خطأ أثناء إغلاق البلاغ');
    } finally {
      setIsSubmittingClosure(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto pb-20 sm:pb-8">
      {/* 1. Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              بوابة الصيانة ونظام ماكسمو (Maximo)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              المسؤول النشط: <strong className="text-slate-800">{technicianName}</strong> • نسخ متطلبات ماكسمو، إرفاق رقم وصورة/PDF البلاغ، وإغلاق البلاغات
            </p>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-3 sm:flex items-center gap-2 text-xs">
          <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-amber-800 font-mono text-base">
              {counts.active + counts.reopened}
            </span>
            <span className="text-[10px] text-amber-700 font-bold">بلاغات مفتوحة</span>
          </div>
          <div className="bg-purple-50 border border-purple-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-purple-800 font-mono text-base">
              {counts.pendingEval}
            </span>
            <span className="text-[10px] text-purple-700 font-bold">بانتظار تقييم الرائد</span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-emerald-800 font-mono text-base">
              {counts.verified}
            </span>
            <span className="text-[10px] text-emerald-700 font-bold">مغلقة ومعتمدة</span>
          </div>
        </div>
      </div>

      {/* 2. Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition ${
              statusFilter === 'active'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            قيد العمل ({counts.active + counts.reopened})
          </button>

          {counts.reopened > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('reopened')}
              className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition flex items-center gap-1 ${
                statusFilter === 'reopened'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>معاد فتحه ({counts.reopened})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setStatusFilter('pending_eval')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition ${
              statusFilter === 'pending_eval'
                ? 'bg-purple-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            بانتظار تقييم الرائد ({counts.pendingEval})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('verified')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition ${
              statusFilter === 'verified'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            معتمدة نهائياً ({counts.verified})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({counts.total})
          </button>
        </div>

        {/* Building Filter + Search */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedBuildingId}
              onChange={(e) => setSelectedBuildingId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="ALL">جميع المباني (34)</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr} ({b.id})
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 sm:w-52">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم البلاغ أو المرفق..."
              className="w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. Tickets List */}
      {filteredTickets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800">لا توجد بلاغات مطابقة للفلتر المحدد</p>
          <p className="text-xs text-slate-500 mt-1">
            جميع البلاغات الميدانية التي يرصدها رواد المباني تظهر هنا فوراً مع متطلبات ماكسمو.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTickets.map((item) => {
            const ticket = item.maintenanceTicket;
            const ticketStatus =
              ticket?.status || (item.status !== 'operational' ? 'open' : 'verified_closed');
            const fixtureName = getFixtureNameAr(item);
            const currentMaxInput =
              maximoInputs[item.id] !== undefined
                ? maximoInputs[item.id]
                : ticket?.maximoNumber || '';

            const mediaItems =
              item.media && item.media.length > 0
                ? item.media
                : item.photoBase64
                ? [{ id: 'p0', type: 'image' as const, url: item.photoBase64, capturedAt: item.updatedAt }]
                : [];

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-4 shadow-xs flex flex-col justify-between gap-3.5 ${
                  ticketStatus === 'reopened'
                    ? 'border-rose-400 ring-1 ring-rose-200'
                    : ticketStatus === 'pending_evaluation'
                    ? 'border-purple-300'
                    : ticketStatus === 'verified_closed'
                    ? 'border-emerald-200'
                    : 'border-slate-200'
                }`}
              >
                {/* Top Section: Location, Status Badge & Copy for Maximo */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold">
                          مبنى {item.buildingId.replace('B', '')} ({item.buildingId}) • الدور {item.floor} • جناح {item.wingId}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                            ticketStatus === 'reopened'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : ticketStatus === 'pending_evaluation'
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : ticketStatus === 'verified_closed'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : ticketStatus === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {ticketStatus === 'reopened'
                            ? 'معاد فتحه (رفض إغلاق صوري) 🔄'
                            : ticketStatus === 'pending_evaluation'
                            ? 'مغلق - بانتظار تقييم الرائد ⭐'
                            : ticketStatus === 'verified_closed'
                            ? 'مغلق ومعتمد ✅'
                            : ticketStatus === 'in_progress'
                            ? 'مسجل بماكسمو (قيد الإصلاح)'
                            : 'بلاغ جديد (بانتظار ماكسمو)'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1.5">
                        {fixtureName}{' '}
                        <span className="text-xs font-mono text-slate-500">({item.id})</span>
                      </h3>
                    </div>

                    {/* 1-Click Copy for Maximo */}
                    <button
                      type="button"
                      onClick={() => handleCopyForMaximo(item)}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold flex items-center gap-1 transition shrink-0"
                      title="نسخ تفاصيل البلاغ جاهزة للصق في نظام ماكسمو"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">تم النسخ لماكسمو ✓</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ لماكسمو</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Reopened Rejection Alert if Leader rejected closure */}
                  {ticketStatus === 'reopened' && ticket?.lastRejectionReason && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 flex flex-col gap-1">
                      <span className="font-bold flex items-center gap-1 text-rose-700">
                        <AlertTriangle className="w-4 h-4" />
                        <span>سبب رفض الإغلاق من رائد المبنى:</span>
                      </span>
                      <p>{ticket.lastRejectionReason}</p>
                      {ticket.lastRejectionPhotoBase64 && (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(ticket.lastRejectionPhotoBase64 || null)}
                          className="self-start mt-1 text-[11px] font-bold text-rose-700 underline"
                        >
                          عرض صورة إثبات عدم الإصلاح
                        </button>
                      )}
                    </div>
                  )}

                  {/* Defects & Notes */}
                  <div className="flex flex-wrap gap-1.5">
                    {item.defects.map((d) => {
                      const tag = DEFECT_TAGS.find((t) => t.id === d);
                      return (
                        <span
                          key={d}
                          className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 font-bold"
                        >
                          {tag ? tag.labelAr : d}
                        </span>
                      );
                    })}
                  </div>

                  {item.notes && (
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      {item.notes}
                    </p>
                  )}

                  {/* Inspector Media Strip */}
                  {mediaItems.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto py-1">
                      {mediaItems.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => m.type === 'image' && setPreviewImage(m.url)}
                          className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 cursor-pointer"
                        >
                          {m.type === 'image' ? (
                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">
                              {m.type.toUpperCase()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Section: Maximo Number, Attachment (PDF/Image), and Close Button */}
                <div className="pt-3 border-t border-slate-200 flex flex-col gap-2.5 bg-slate-50/70 -mx-4 -mb-4 p-4 rounded-b-2xl">
                  {/* Maximo Ticket # + Attachment Row */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex gap-1.5">
                      <input
                        type="text"
                        value={currentMaxInput}
                        onChange={(e) =>
                          setMaximoInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="رقم البلاغ في ماكسمو (مثال: MX-99421)..."
                        className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={savingTicketId === item.id}
                        onClick={() => handleSaveMaximoNumber(item)}
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 transition"
                      >
                        {savingTicketId === item.id ? '...' : 'حفظ الرقم'}
                      </button>
                    </div>

                    {/* Upload PDF or Image of Maximo Ticket */}
                    <label className="cursor-pointer px-3 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition">
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => handleUploadMaximoAttachment(item, e)}
                        className="hidden"
                        disabled={uploadingAttachmentId === item.id}
                      />
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingAttachmentId === item.id
                          ? 'جاري الرفع...'
                          : ticket?.maximoAttachmentBase64
                          ? 'تحديث مرفق البلاغ'
                          : 'رفع PDF / صورة البلاغ'}
                      </span>
                    </label>
                  </div>

                  {/* Display existing Maximo Attachment if uploaded */}
                  {ticket?.maximoAttachmentBase64 && (
                    <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-blue-900 font-bold truncate">
                        {ticket.maximoAttachmentType === 'pdf' ? (
                          <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                        <span className="truncate">
                          مرفق ماكسمو: {ticket.maximoAttachmentName || 'مستند البلاغ'}
                        </span>
                      </div>
                      {ticket.maximoAttachmentType === 'pdf' ? (
                        <a
                          href={ticket.maximoAttachmentBase64}
                          download={ticket.maximoAttachmentName || `Maximo_${ticket.maximoNumber}.pdf`}
                          className="text-blue-700 font-bold underline shrink-0 mr-2"
                        >
                          تحميل PDF
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(ticket.maximoAttachmentBase64 || null)}
                          className="text-blue-700 font-bold underline shrink-0 mr-2"
                        >
                          معاينة الصورة
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action Row: Close Ticket OR Copy Mandatory Evaluation Link */}
                  {ticketStatus === 'pending_evaluation' ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-bold text-purple-800 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>مغلق من الصيانة — يلزم تقييم رائد {item.buildingId}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopyEvaluationLink(item)}
                        className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        {copiedLinkId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>تم نسخ رابط التقييم ✓</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>نسخ رابط تقييم الخدمة للرائد</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : ticketStatus === 'verified_closed' ? (
                    <div className="flex items-center justify-between text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-bold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>تم اعتماد الإغلاق من رائد المبنى ({ticket?.verifiedBy})</span>
                      </span>
                      {ticket?.serviceRating && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>{ticket.serviceRating}/5</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCloseModal(item)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>إغلاق البلاغ بعد إتمام الصيانة (تحويل لتقييم الرائد)</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal to Close Ticket & Request Mandatory Leader Evaluation */}
      {closingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>إغلاق البلاغ وطلب تقييم رائد المبنى</span>
                </h3>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">{closingItem.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setClosingItem(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCloseTicket} className="flex flex-col gap-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-700">رقم البلاغ في ماكسمو:</label>
                <input
                  type="text"
                  value={closureMaximoNumber}
                  onChange={(e) => setClosureMaximoNumber(e.target.value)}
                  placeholder="أدخل رقم بلاغ ماكسمو..."
                  required
                  className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:bg-white"
                />
              </div>

              {!closingItem.maintenanceTicket?.maximoAttachmentBase64 && (
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">
                    مرفق البلاغ (PDF أو صورة من ماكسمو - اختياري):
                  </label>
                  <label className="cursor-pointer border border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-2.5 bg-slate-50 flex items-center justify-center gap-2 text-slate-700 font-bold">
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleClosureAttachmentSelect}
                      className="hidden"
                    />
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>
                      {closureAttachment
                        ? `تم إرفاق: ${closureAttachment.name}`
                        : 'اختيار ملف PDF أو صورة البلاغ'}
                    </span>
                  </label>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-700">تفاصيل الإصلاح المنفذ:</label>
                <textarea
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  placeholder="مثال: تم استبدال قلب الخلاط ومعالجة التسريب بالكامل..."
                  rows={2}
                  required
                  className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-700">
                  صورة المرفق بعد الإصلاح (تظهر لرائد المبنى عند التقييم):
                </label>
                {closurePhotoBase64 ? (
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-300">
                    <img src={closurePhotoBase64} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setClosurePhotoBase64(undefined)}
                      className="absolute top-1 left-1 bg-rose-600 text-white p-1 rounded-md"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl p-3 bg-emerald-50/40 flex items-center justify-center gap-2 text-emerald-900 font-bold">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleClosurePhotoSelect}
                      className="hidden"
                    />
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>التقاط / رفع صورة بعد الإصلاح</span>
                  </label>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmittingClosure || isProcessingClosureFile}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 mt-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmittingClosure
                    ? 'جاري إغلاق البلاغ...'
                    : 'تأكيد الإغلاق وإلزام رائد المبنى بالتقييم'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {previewImage && (
        <ImageViewerModal
          src={previewImage}
          title="معاينة المرفق"
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
};

