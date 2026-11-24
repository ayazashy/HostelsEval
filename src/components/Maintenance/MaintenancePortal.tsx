// ============================================================================
// بوابة الصيانة المكثفة (الأقسام الأربعة) وبوابة النظافة ومكافحة الآفات
// تدعم: فصل مسار الصيانة عن النظافة تماماً، فلترة الأقسام الأربعة، عرض ثنائي اللغة
// (عربي / English) لتجاوز تعدد الجنسيات، إرفاق صورة الإصلاح، ومحادثة المرفق المستمرة
// ============================================================================

import React, { useState } from 'react';
import {
  BuildingInfo,
  FixtureEvaluation,
  ServiceDepartment,
  FacilityHistoryEvent,
  FacilityMediaVaultDoc,
} from '../../types/hostel';
import {
  DEFECT_TAGS,
  SERVICE_DEPARTMENTS,
  loadActiveFacilityCategories,
  resolveEvaluationDepartment,
  isCleaningOrPestTicket,
  getZoneNameAr,
  getZoneNameEn,
  resolveFixtureDisplayName,
} from '../../config/facilityTemplates';
import {
  updateMaximoTicketInfo,
  startMaintenanceTicketWork,
  closeMaintenanceTicket,
  appendFacilityChatMessage,
  fetchFacilityMediaOnDemand,
} from '../../services/firestoreService';
import {
  processFacilityMediaFile,
  compressAndWatermarkImage,
  formatStandardDate,
} from '../../utils/imageCompressor';
import { ImageViewerModal, MediaGalleryEntry } from '../Common/ImageViewerModal';
import { OnDemandPhotoSlot } from '../Common/OnDemandPhotoSlot';
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
  MessageSquare,
  Send,
  Sparkles,
  ExternalLink,
  Download,
  ChevronDown,
  PlayCircle,
  Filter,
  X,
} from 'lucide-react';

interface MaintenancePortalProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  technicianName: string;
  portalRole?: 'maintenance' | 'cleaning';
  isAdmin?: boolean;
  onRefreshEvaluations: () => void;
}

export const MaintenancePortal: React.FC<MaintenancePortalProps> = ({
  buildings,
  allEvaluations,
  technicianName,
  portalRole = 'maintenance',
  isAdmin = false,
  onRefreshEvaluations,
}) => {
  // Admin can toggle between Maintenance Portal and Cleaning/Pest Portal; staff are locked to their own portal
  const [activeTrack, setActiveTrack] = useState<'maintenance' | 'cleaning'>(portalRole);
  const [selectedDepartment, setSelectedDepartment] = useState<'ALL' | ServiceDepartment>('ALL');
  const [selectedFixtureType, setSelectedFixtureType] = useState<string>('ALL');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'new' | 'in_progress' | 'reopened' | 'pending_eval' | 'verified' | 'all'
  >('new');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [previewGallery, setPreviewGallery] = useState<{
    items: MediaGalleryEntry[];
    initialIndex: number;
    title: string;
  } | null>(null);

  // Per-ticket editing state for Maximo # & URL & attachment
  const [maximoInputs, setMaximoInputs] = useState<Record<string, string>>({});
  const [maximoUrlInputs, setMaximoUrlInputs] = useState<Record<string, string>>({});
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [startingTicketId, setStartingTicketId] = useState<string | null>(null);
  const [uploadingAttachmentId, setUploadingAttachmentId] = useState<string | null>(null);

  // Closing Ticket Modal State
  const [closingItem, setClosingItem] = useState<FixtureEvaluation | null>(null);
  const [closureMaximoNumber, setClosureMaximoNumber] = useState<string>('');
  const [closureMaximoUrl, setClosureMaximoUrl] = useState<string>('');
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [closurePhotoBase64, setClosurePhotoBase64] = useState<string | undefined>(undefined);
  const [closureAttachment, setClosureAttachment] = useState<{
    base64: string;
    name: string;
    type: 'pdf' | 'image';
  } | null>(null);
  const [isProcessingClosureFile, setIsProcessingClosureFile] = useState<boolean>(false);
  const [isSubmittingClosure, setIsSubmittingClosure] = useState<boolean>(false);

  // Facility Chat Thread Modal State for Technicians
  const [chatItem, setChatItem] = useState<FixtureEvaluation | null>(null);
  const [chatText, setChatText] = useState<string>('');
  const [chatPhotoBase64, setChatPhotoBase64] = useState<string | undefined>(undefined);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);

  // On-Demand Media Loading & Ticket Pagination (Prevents OOM on Old Devices)
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [loadedMediaByFixtureId, setLoadedMediaByFixtureId] = useState<
    Record<string, FacilityMediaVaultDoc>
  >({});
  const [loadingMediaKey, setLoadingMediaKey] = useState<string | null>(null);

  React.useEffect(() => {
    setActiveTrack(portalRole);
    setSelectedDepartment('ALL');
    setSelectedFixtureType('ALL');
    setVisibleCount(20);
  }, [portalRole]);

  React.useEffect(() => {
    setVisibleCount(20);
  }, [selectedDepartment, selectedFixtureType, selectedBuildingId, statusFilter, searchQuery]);

  /**
   * Builds unified gallery entries from a loaded vault & ticket so clicking any photo opens
   * ALL attached photos (Before #1..#N, After, Rejection, Image Attachments) with next/prev navigation.
   */
  const buildTicketGalleryEntries = (
    item: FixtureEvaluation,
    vault: FacilityMediaVaultDoc
  ): {
    entries: MediaGalleryEntry[];
    beforeCount: number;
    afterIndex: number;
    rejectionIndex: number;
    maximoImgIndex: number;
  } => {
    const entries: MediaGalleryEntry[] = [];
    const mediaList =
      vault.media && vault.media.length > 0
        ? vault.media
        : vault.photoBase64
        ? [
            {
              id: 'primary',
              type: 'image' as const,
              url: vault.photoBase64,
              capturedAt: vault.updatedAt,
            },
          ]
        : [];

    mediaList.forEach((m, idx) => {
      if (m?.url) {
        entries.push({
          url: m.url,
          type: m.type || 'image',
          name: m.name,
          label:
            mediaList.length > 1
              ? `صورة البلاغ قبل الإصلاح (#${idx + 1})`
              : 'صورة البلاغ قبل الإصلاح',
        });
      }
    });

    const beforeCount = entries.length;
    let afterIndex = -1;
    let rejectionIndex = -1;
    let maximoImgIndex = -1;

    const afterUrl = vault.closurePhotoBase64 || item.maintenanceTicket?.closurePhotoBase64;
    if (afterUrl) {
      afterIndex = entries.length;
      entries.push({
        url: afterUrl,
        type: 'image',
        label: 'صورة الصيانة بعد الإصلاح (After)',
      });
    }

    const rejUrl =
      vault.lastRejectionPhotoBase64 || item.maintenanceTicket?.lastRejectionPhotoBase64;
    if (rejUrl) {
      rejectionIndex = entries.length;
      entries.push({
        url: rejUrl,
        type: 'image',
        label: 'صورة إثبات رفض الإغلاق من رائد المبنى',
      });
    }

    const maxUrl = vault.maximoAttachmentBase64 || item.maintenanceTicket?.maximoAttachmentBase64;
    const maxType = vault.maximoAttachmentType || item.maintenanceTicket?.maximoAttachmentType;
    if (maxUrl && maxType !== 'pdf' && !maxUrl.startsWith('data:application/pdf')) {
      maximoImgIndex = entries.length;
      entries.push({
        url: maxUrl,
        type: 'image',
        name: vault.maximoAttachmentName || item.maintenanceTicket?.maximoAttachmentName,
        label: `مرفق ماكسمو: ${
          vault.maximoAttachmentName || item.maintenanceTicket?.maximoAttachmentName || ''
        }`,
      });
    }

    return { entries, beforeCount, afterIndex, rejectionIndex, maximoImgIndex };
  };

  const handleLoadOnDemandAttachment = async (
    item: FixtureEvaluation,
    target: 'before' | 'after' | 'rejection' | 'maximo' | 'chat',
    beforeIndex: number = 0,
    historyEventId?: string
  ) => {
    const key = `${item.id}_${target}_${beforeIndex}_${historyEventId || ''}`;
    setLoadingMediaKey(key);
    try {
      let vault: FacilityMediaVaultDoc | null = loadedMediaByFixtureId[item.id] || null;
      if (!vault) {
        vault = await fetchFacilityMediaOnDemand(item.id);
        if (vault) {
          setLoadedMediaByFixtureId((prev) => ({
            ...prev,
            [item.id]: vault!,
          }));
        }
      }

      if (!vault) {
        alert('لم يتم العثور على مرفق محفوظ لهذا السجل في السحابة.');
        return;
      }

      if (target === 'maximo') {
        const maxUrl =
          vault.maximoAttachmentBase64 || item.maintenanceTicket?.maximoAttachmentBase64;
        const maxType =
          vault.maximoAttachmentType || item.maintenanceTicket?.maximoAttachmentType;
        const maxName =
          vault.maximoAttachmentName ||
          item.maintenanceTicket?.maximoAttachmentName ||
          `Maximo_${item.maintenanceTicket?.maximoNumber || item.id}.pdf`;
        if (maxUrl && (maxType === 'pdf' || maxUrl.startsWith('data:application/pdf'))) {
          const a = document.createElement('a');
          a.href = maxUrl;
          a.download = maxName;
          a.click();
          return;
        }
      }

      if (target === 'chat' && historyEventId) {
        const evMedia = vault.historyMediaById?.[historyEventId] || [];
        const chatEntries: MediaGalleryEntry[] = evMedia
          .filter((m) => !!m?.url)
          .map((m, idx) => ({
            url: m.url,
            type: m.type || 'image',
            name: m.name,
            label: evMedia.length > 1 ? `مرفق المحادثة (#${idx + 1})` : 'مرفق المحادثة',
          }));
        if (chatEntries.length > 0) {
          setPreviewGallery({
            items: chatEntries,
            initialIndex: Math.max(0, Math.min(beforeIndex, chatEntries.length - 1)),
            title: `مرفقات محادثة ${item.id}`,
          });
          return;
        }
      }

      const built = buildTicketGalleryEntries(item, vault);
      if (built.entries.length === 0) {
        alert('لا توجد صور أو وسائط محفوظة لهذا البلاغ.');
        return;
      }

      let targetIdx = 0;
      if (target === 'before') {
        targetIdx = Math.max(0, Math.min(beforeIndex, Math.max(0, built.beforeCount - 1)));
      } else if (target === 'after' && built.afterIndex >= 0) {
        targetIdx = built.afterIndex;
      } else if (target === 'rejection' && built.rejectionIndex >= 0) {
        targetIdx = built.rejectionIndex;
      } else if (target === 'maximo' && built.maximoImgIndex >= 0) {
        targetIdx = built.maximoImgIndex;
      }

      setPreviewGallery({
        items: built.entries,
        initialIndex: targetIdx,
        title: `شواهد المرفق (${item.id})`,
      });
    } finally {
      setLoadingMediaKey(null);
    }
  };

  const effectiveTrack = isAdmin ? activeTrack : portalRole;
  const isCleaningMode = effectiveTrack === 'cleaning';
  const categories = React.useMemo(() => loadActiveFacilityCategories(), []);

  const getFixtureBilingualName = React.useCallback(
    (item: FixtureEvaluation): { ar: string; en: string; code: string } => {
      const resolved = resolveFixtureDisplayName(item, categories);
      return {
        code: resolved.code,
        ar: `${resolved.nameAr} (#${item.fixtureIndex})`,
        en: `${resolved.nameEn} (#${item.fixtureIndex})`,
      };
    },
    [categories]
  );

  // Strict Track Isolation: Cleaning portal ONLY sees Cleaning/Pest tickets; Maintenance portal ONLY sees Maintenance tickets
  const trackTickets = React.useMemo(() => {
    return allEvaluations
      .filter((e) => {
        if (e.isDeleted) return false;
        if (e.status === 'operational' && !e.maintenanceTicket) return false;
        const isCln = isCleaningOrPestTicket(e);
        return isCleaningMode ? isCln : !isCln;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [allEvaluations, isCleaningMode]);

  // Department counts for tabs
  const departmentCounts = React.useMemo(() => {
    const map: Record<string, number> = {
      ALL: 0,
      plumbing: 0,
      carpentry_civil: 0,
      electrical: 0,
      hvac_mechanical: 0,
      cleaning: 0,
      pest_control: 0,
    };
    for (const t of trackTickets) {
      const dept = resolveEvaluationDepartment(t);
      map.ALL++;
      map[dept] = (map[dept] || 0) + 1;
    }
    return map;
  }, [trackTickets]);

  // Determines whether an active open/in_progress ticket has already been acted upon (Maximo #/URL/Attachment or tech work started)
  const hasStartedMaintenanceAction = (item: FixtureEvaluation): boolean => {
    const t = item.maintenanceTicket;
    if (!t) return false;
    if (t.status === 'in_progress') return true;
    const maxNum = (t.maximoNumber || '').trim();
    if (maxNum && maxNum !== 'قيد التسجيل') return true;
    if (t.maximoUrl && t.maximoUrl.trim()) return true;
    if (t.hasMaximoAttachment || t.maximoAttachmentBase64) return true;
    if (t.registeredAt) return true;
    if (
      Array.isArray(item.history) &&
      item.history.some(
        (h) =>
          h.action === 'maximo_registered' ||
          h.actorRole === 'maintenance' ||
          h.actorRole === 'cleaning'
      )
    ) {
      return true;
    }
    return false;
  };

  type TicketBucket = 'new' | 'in_progress' | 'reopened' | 'pending_eval' | 'verified';

  const getTicketBucket = (item: FixtureEvaluation): TicketBucket => {
    const st =
      item.maintenanceTicket?.status ||
      (item.status !== 'operational' ? 'open' : 'verified_closed');
    if (st === 'reopened') return 'reopened';
    if (st === 'pending_evaluation') return 'pending_eval';
    if (st === 'verified_closed' || item.status === 'operational') return 'verified';
    return hasStartedMaintenanceAction(item) ? 'in_progress' : 'new';
  };

  // Fixture Type options with counts filtered by active track & department (normalized so FX*** codes never appear)
  const fixtureTypeOptions = React.useMemo(() => {
    const map = new Map<string, { code: string; ar: string; en: string; count: number }>();
    for (const item of trackTickets) {
      if (
        selectedDepartment !== 'ALL' &&
        resolveEvaluationDepartment(item) !== selectedDepartment
      ) {
        continue;
      }
      const resolved = resolveFixtureDisplayName(item, categories);
      const code = resolved.code;
      const existing = map.get(code);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(code, {
          code,
          ar: resolved.filterLabelAr,
          en: resolved.filterLabelEn,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [trackTickets, selectedDepartment, categories]);

  const counts = React.useMemo(() => {
    let newTickets = 0;
    let inProgress = 0;
    let reopened = 0;
    let pendingEval = 0;
    let verified = 0;

    for (const t of trackTickets) {
      if (selectedDepartment !== 'ALL' && resolveEvaluationDepartment(t) !== selectedDepartment) {
        continue;
      }
      if (
        selectedFixtureType !== 'ALL' &&
        resolveFixtureDisplayName(t, categories).code !== selectedFixtureType
      ) {
        continue;
      }
      const bucket = getTicketBucket(t);
      if (bucket === 'new') newTickets++;
      else if (bucket === 'in_progress') inProgress++;
      else if (bucket === 'reopened') reopened++;
      else if (bucket === 'pending_eval') pendingEval++;
      else if (bucket === 'verified') verified++;
    }
    return {
      newTickets,
      inProgress,
      reopened,
      pendingEval,
      verified,
      total: newTickets + inProgress + reopened + pendingEval + verified,
    };
  }, [trackTickets, selectedDepartment, selectedFixtureType, categories]);

  const filteredTickets = React.useMemo(() => {
    return trackTickets.filter((item) => {
      if (
        selectedDepartment !== 'ALL' &&
        resolveEvaluationDepartment(item) !== selectedDepartment
      ) {
        return false;
      }

      if (
        selectedFixtureType !== 'ALL' &&
        resolveFixtureDisplayName(item, categories).code !== selectedFixtureType
      ) {
        return false;
      }

      if (selectedBuildingId !== 'ALL' && item.buildingId !== selectedBuildingId) {
        return false;
      }

      const bucket = getTicketBucket(item);
      if (statusFilter !== 'all' && bucket !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const names = getFixtureBilingualName(item);
        const matchId = item.id.toLowerCase().includes(q);
        const matchBld = item.buildingId.toLowerCase().includes(q);
        const matchMax = (item.maintenanceTicket?.maximoNumber || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        const matchType =
          names.ar.toLowerCase().includes(q) || names.en.toLowerCase().includes(q);
        if (!matchId && !matchBld && !matchMax && !matchNotes && !matchType) return false;
      }

      return true;
    });
  }, [
    trackTickets,
    selectedDepartment,
    selectedFixtureType,
    selectedBuildingId,
    statusFilter,
    searchQuery,
    getFixtureBilingualName,
    categories,
  ]);

  const handleStartTicketWork = async (item: FixtureEvaluation) => {
    setStartingTicketId(item.id);
    try {
      await startMaintenanceTicketWork(item, {
        actorName: technicianName,
        actorRole: isCleaningMode ? 'cleaning' : isAdmin ? 'admin' : 'maintenance',
      });
      onRefreshEvaluations();
    } finally {
      setStartingTicketId(null);
    }
  };

  // Format bilingual summary so technicians or Maximo operators can copy it in 1 click
  const handleCopyTicketSummary = (item: FixtureEvaluation) => {
    const defectLabels = (item.defects || [])
      .map((d) => {
        const tag = DEFECT_TAGS.find((t) => t.id === d);
        return tag ? `${tag.labelAr} (${tag.labelEn})` : d;
      })
      .join(' ، ');
    const names = getFixtureBilingualName(item);
    const dept = SERVICE_DEPARTMENTS[resolveEvaluationDepartment(item)];
    const priority =
      item.status === 'broken' ? 'طارئ / Urgent' : 'صيانة مكثفة / Standard';

    const text = [
      `برنامج الصيانة المكثفة ومتابعة المرافق - الإسكان الطلابي بجامعة الملك سعود`,
      `القسم المختص: ${dept.nameAr} (${dept.nameEn})`,
      `المبنى: مبنى ${item.buildingId.replace('B', '')} (${item.buildingId})`,
      `الموقع: الدور ${item.floor} - ${getZoneNameAr(item.wingId)} (${getZoneNameEn(item.wingId)})`,
      `المرفق: ${names.ar} / ${names.en} [${item.id}]`,
      `الأولوية: ${priority}`,
      `الأعطال المرصودة: ${defectLabels || 'خلل تشغيلي'}`,
      item.notes ? `توضيح إضافي: ${item.notes}` : '',
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
    const urlVal =
      maximoUrlInputs[item.id] !== undefined
        ? maximoUrlInputs[item.id]
        : item.maintenanceTicket?.maximoUrl || '';
    if (!val.trim() && !urlVal.trim()) {
      alert('يرجى إدخال رقم البلاغ أو رابط البلاغ في ماكسمو أولاً');
      return;
    }

    setSavingTicketId(item.id);
    try {
      await updateMaximoTicketInfo(item, {
        maximoNumber: val.trim() || item.maintenanceTicket?.maximoNumber || 'مربوط برابط',
        maximoUrl: urlVal,
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
      alert(err?.message || 'حدث خطأ أثناء رفع المرفق');
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
    setClosureMaximoUrl(
      maximoUrlInputs[item.id] || item.maintenanceTicket?.maximoUrl || ''
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
    } catch (err: any) {
      alert(err?.message || 'تعذر ضغط صورة الإصلاح');
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
        maximoUrl: closureMaximoUrl.trim() || undefined,
        attachmentBase64: closureAttachment?.base64,
        attachmentName: closureAttachment?.name,
        attachmentType: closureAttachment?.type,
        closureNotes:
          closureNotes.trim() ||
          (isCleaningMode
            ? 'تم تنفيذ أعمال النظافة / المكافحة وإغلاق البلاغ'
            : 'تم إتمام الإصلاح وإغلاق البلاغ'),
        closurePhotoBase64,
        actorName: technicianName,
      });
      setClosingItem(null);
      onRefreshEvaluations();
    } catch (err: any) {
      alert(err?.message || 'حدث خطأ أثناء إغلاق البلاغ');
    } finally {
      setIsSubmittingClosure(false);
    }
  };

  const handleSendTechChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatItem || (!chatText.trim() && !chatPhotoBase64)) return;

    setIsSendingChat(true);
    try {
      await appendFacilityChatMessage(chatItem, {
        message: chatText.trim() || 'صورة تحديث من الفني المختص',
        actorName: technicianName,
        actorRole: isCleaningMode ? 'cleaning' : 'maintenance',
        photoBase64: chatPhotoBase64,
      });
      setChatText('');
      setChatPhotoBase64(undefined);
      onRefreshEvaluations();
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleTechChatPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatItem) return;
    try {
      const res = await compressAndWatermarkImage(file, {
        fixtureId: chatItem.id,
        inspectorName: technicianName,
      });
      setChatPhotoBase64(res.base64);
    } catch (err: any) {
      alert(err?.message || 'تعذر ضغط الصورة');
    } finally {
      e.target.value = '';
    }
  };

  const maintenanceDeptTabs: { id: 'ALL' | ServiceDepartment; labelAr: string; labelEn: string }[] = [
    { id: 'ALL', labelAr: 'جميع أقسام الصيانة', labelEn: 'All Maintenance Depts' },
    { id: 'plumbing', labelAr: 'قسم السباكة', labelEn: 'Plumbing' },
    { id: 'carpentry_civil', labelAr: 'قسم النجارة والمدني', labelEn: 'Carpentry & Civil' },
    { id: 'electrical', labelAr: 'قسم الكهرباء', labelEn: 'Electrical' },
    {
      id: 'hvac_mechanical',
      labelAr: 'التكييف والميكانيكا والمصاعد',
      labelEn: 'HVAC, Mech & Elevators',
    },
  ];

  const cleaningDeptTabs: { id: 'ALL' | ServiceDepartment; labelAr: string; labelEn: string }[] = [
    { id: 'ALL', labelAr: 'جميع بلاغات الخدمات', labelEn: 'All Services' },
    { id: 'cleaning', labelAr: 'النظافة العامة والتعقيم', labelEn: 'General Cleaning' },
    { id: 'pest_control', labelAr: 'مكافحة الحشرات والقوارض', labelEn: 'Pest & Rodent Control' },
  ];

  const activeDeptTabs = isCleaningMode ? cleaningDeptTabs : maintenanceDeptTabs;

  // Keep chatItem fresh when evaluations update
  const liveChatItem = React.useMemo(() => {
    if (!chatItem) return null;
    return allEvaluations.find((e) => e.id === chatItem.id) || chatItem;
  }, [chatItem, allEvaluations]);

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto pb-20 sm:pb-8">
      {/* Admin Track Switcher (if logged in as Admin) */}
      {isAdmin && (
        <div className="bg-slate-900 text-white rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-300">
            البوابة:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTrack('maintenance');
                setSelectedDepartment('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                !isCleaningMode ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-white'
              }`}
            >
              الصيانة وماكسمو
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTrack('cleaning');
                setSelectedDepartment('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                isCleaningMode ? 'bg-sky-400 text-slate-950' : 'bg-white/10 text-white'
              }`}
            >
              النظافة ومكافحة الآفات
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-xs ${
              isCleaningMode ? 'bg-sky-600' : 'bg-emerald-600'
            }`}
          >
            {isCleaningMode ? <Sparkles className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              {isCleaningMode
                ? 'بوابة النظافة ومكافحة الآفات'
                : 'بوابة الصيانة وماكسمو'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              المسؤول: <strong className="text-slate-800">{technicianName}</strong>
            </p>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs">
          <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-amber-800 font-mono text-base">
              {counts.newTickets}
            </span>
            <span className="text-[10px] text-amber-800 font-bold leading-tight block">
              بلاغات جديدة / New
            </span>
          </div>
          <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-blue-800 font-mono text-base">
              {counts.inProgress}
            </span>
            <span className="text-[10px] text-blue-800 font-bold leading-tight block">
              يتم العمل عليها / In Progress
            </span>
          </div>
          <div className="bg-purple-50 border border-purple-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-purple-800 font-mono text-base">
              {counts.pendingEval}
            </span>
            <span className="text-[10px] text-purple-800 font-bold leading-tight block">
              بانتظار اعتماد الرائد
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-center">
            <span className="block font-black text-emerald-800 font-mono text-base">
              {counts.verified}
            </span>
            <span className="text-[10px] text-emerald-800 font-bold leading-tight block">
              مغلقة ومعتمدة
            </span>
          </div>
        </div>
      </div>

      {/* 2. Department Filter Bar (4 Maintenance Departments OR 2 Cleaning/Pest Departments) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-wrap items-center gap-2">
        {activeDeptTabs.map((tab) => {
          const isSelected = selectedDepartment === tab.id;
          const count = departmentCounts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedDepartment(tab.id);
                setSelectedFixtureType('ALL');
              }}
              className={`px-3 py-2 rounded-xl border text-right transition flex items-center gap-2 ${
                isSelected
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div>
                <div className="text-xs font-bold leading-snug">{tab.labelAr}</div>
                <div className={`text-[10px] leading-snug ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {tab.labelEn}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-lg text-xs font-mono font-black shrink-0 ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2b. Facility / Fixture Type Filter Chips (مراوش، مراحيض، مغاسل، سخانات...) */}
      {fixtureTypeOptions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>نوع المرفق:</span>
            </span>
            {selectedFixtureType !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedFixtureType('ALL')}
                className="text-[11px] font-bold text-blue-700 hover:underline"
              >
                عرض الكل
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedFixtureType('ALL')}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                selectedFixtureType === 'ALL'
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              جميع المرافق ({departmentCounts[selectedDepartment] || trackTickets.length})
            </button>

            {fixtureTypeOptions.map((opt) => {
              const active = selectedFixtureType === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setSelectedFixtureType(opt.code)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-1.5 ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{opt.ar}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-black ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Status & Building Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-col gap-3">
        {/* Status Tabs (Split cleanly into New vs In Progress) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('new')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
              statusFilter === 'new'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            بلاغات جديدة / New ({counts.newTickets})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
              statusFilter === 'in_progress'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            بلاغات يتم العمل عليها / In Progress ({counts.inProgress})
          </button>

          {counts.reopened > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('reopened')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                statusFilter === 'reopened'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>معاد فتحه / Reopened ({counts.reopened})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setStatusFilter('pending_eval')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
              statusFilter === 'pending_eval'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            بانتظار اعتماد الرائد ({counts.pendingEval})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('verified')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
              statusFilter === 'verified'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            معتمدة نهائياً ({counts.verified})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            الكل ({counts.total})
          </button>
        </div>

        {/* Building Filter + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedBuildingId}
              onChange={(e) => setSelectedBuildingId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer w-full sm:w-auto"
            >
              <option value="ALL">جميع المباني (34 Buildings)</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr} ({b.id})
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم البلاغ أو ماكسمو أو نوع المرفق..."
              className="w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. Tickets List (Paginated + On-Demand Attachment Loading for Old Devices) */}
      {filteredTickets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800">
            لا توجد بلاغات مطابقة
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredTickets.slice(0, visibleCount).map((item) => {
              const ticket = item.maintenanceTicket;
              const ticketStatus =
                ticket?.status || (item.status !== 'operational' ? 'open' : 'verified_closed');
              const ticketBucket = getTicketBucket(item);
              const names = getFixtureBilingualName(item);
              const deptKey = resolveEvaluationDepartment(item);
              const deptInfo = SERVICE_DEPARTMENTS[deptKey];
              const currentMaxInput =
                maximoInputs[item.id] !== undefined
                  ? maximoInputs[item.id]
                  : ticket?.maximoNumber || '';

              const hasBeforeMedia = Boolean(
                item.hasPhoto ||
                  (item.mediaCount && item.mediaCount > 0) ||
                  item.photoBase64 ||
                  (item.media && item.media.length > 0)
              );
              const hasAfterMedia = Boolean(
                ticket?.hasClosurePhoto || ticket?.closurePhotoBase64
              );
              const hasRejectionMedia = Boolean(
                ticket?.hasRejectionPhoto || ticket?.lastRejectionPhotoBase64
              );
              const hasMaximoMedia = Boolean(
                ticket?.hasMaximoAttachment || ticket?.maximoAttachmentBase64
              );
              const loadedVault = loadedMediaByFixtureId[item.id];
              const beforeSlotsMeta =
                loadedVault?.media && loadedVault.media.length > 0
                  ? loadedVault.media
                  : item.mediaMeta && item.mediaMeta.length > 0
                  ? item.mediaMeta
                  : Array.from(
                      { length: item.mediaCount || (hasBeforeMedia ? 1 : 0) },
                      (_, i) => ({
                        id: `slot_${i}`,
                        type: 'image' as const,
                        name: undefined,
                        capturedAt: item.updatedAt,
                      })
                    );

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-xs flex flex-col justify-between ${
                  ticketStatus === 'reopened'
                    ? 'border-rose-400 ring-1 ring-rose-200'
                    : ticketStatus === 'pending_evaluation'
                    ? 'border-purple-300'
                    : ticketStatus === 'verified_closed'
                    ? 'border-emerald-200'
                    : ticketBucket === 'in_progress'
                    ? 'border-blue-300'
                    : 'border-slate-200'
                }`}
              >
                {/* Top Section: Bilingual Location, Department Badge, Chat Button & Copy */}
                <div className="p-4 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold leading-snug">
                          مبنى {item.buildingId.replace('B', '')} ({item.buildingId}) • الدور{' '}
                          {item.floor} • {getZoneNameAr(item.wingId, true)}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-bold border leading-snug ${deptInfo.badgeClass}`}
                        >
                          {deptInfo.nameAr} • {deptInfo.nameEn}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-bold leading-snug ${
                            ticketBucket === 'reopened'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : ticketBucket === 'pending_eval'
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : ticketBucket === 'verified'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : ticketBucket === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {ticketBucket === 'reopened'
                            ? 'معاد فتحه / Reopened'
                            : ticketBucket === 'pending_eval'
                            ? 'بانتظار اعتماد الرائد'
                            : ticketBucket === 'verified'
                            ? 'معتمد ومغلق'
                            : ticketBucket === 'in_progress'
                            ? 'يتم العمل عليه / In Progress'
                            : 'بلاغ جديد / New'}
                        </span>
                      </div>

                      <div className="mt-1.5">
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {names.ar}{' '}
                          <span className="text-xs font-mono text-slate-500">({item.id})</span>
                        </h3>
                        <p className="text-xs font-semibold text-slate-500 leading-snug mt-0.5">
                          Building {item.buildingId.replace('B', '')} • Floor {item.floor} •{' '}
                          {getZoneNameEn(item.wingId)} — {names.en}
                        </p>
                      </div>
                    </div>

                    {/* Chat Thread Button + Copy Summary Button */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setChatItem(item)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold flex items-center gap-1 transition"
                        title="فتح شريط محادثة وتحديثات المرفق"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        <span>المحادثة ({(item.history || []).length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyTicketSummary(item)}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold flex items-center gap-1 transition"
                        title="نسخ تفاصيل البلاغ"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Reopened Rejection Alert if Leader rejected closure */}
                  {ticketStatus === 'reopened' && ticket?.lastRejectionReason && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 flex flex-col gap-2">
                      <span className="font-bold flex items-center gap-1 text-rose-700">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>سبب رفض الإغلاق من رائد المبنى (Reopened by Leader):</span>
                      </span>
                      <p className="leading-relaxed">{ticket.lastRejectionReason}</p>
                      {hasRejectionMedia && (
                        <OnDemandPhotoSlot
                          loadedUrl={
                            loadedVault?.lastRejectionPhotoBase64 ||
                            ticket.lastRejectionPhotoBase64
                          }
                          badgeLabel="إثبات الرفض"
                          badgeTone="rose"
                          sizeClass="w-20 h-20"
                          isLoading={loadingMediaKey === `${item.id}_rejection_0_`}
                          onClick={() => handleLoadOnDemandAttachment(item, 'rejection', 0)}
                        />
                      )}
                    </div>
                  )}

                  {/* Bilingual Defects Chips (Arabic + English) */}
                  <div className="flex flex-wrap gap-1.5">
                    {item.defects.map((d) => {
                      const tag = DEFECT_TAGS.find((t) => t.id === d);
                      return (
                        <div
                          key={d}
                          className="px-2.5 py-1 rounded-xl bg-rose-50/70 text-slate-900 border border-rose-200 flex flex-col"
                        >
                          <span className="text-xs font-bold text-rose-900 leading-snug">
                            {tag ? tag.labelAr : d}
                          </span>
                          {tag?.labelEn && (
                            <span className="text-[10px] font-semibold text-slate-600 leading-snug">
                              {tag.labelEn}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {item.notes && (
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 leading-relaxed">
                      <strong>توضيح إضافي / Note:</strong> {item.notes}
                    </p>
                  )}

                  {/* On-Demand Photo Thumbnails Strip (Unloaded Photo Frames + Multi-Photo Lightbox) */}
                  {(beforeSlotsMeta.length > 0 || hasAfterMedia) && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        المرفقات ({beforeSlotsMeta.length + (hasAfterMedia ? 1 : 0)}):
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {beforeSlotsMeta.map((slot, idx) => {
                          const loadedUrl =
                            loadedVault?.media?.[idx]?.url ||
                            (idx === 0 ? loadedVault?.photoBase64 || item.photoBase64 : undefined);
                          return (
                            <OnDemandPhotoSlot
                              key={slot.id || idx}
                              loadedUrl={loadedUrl}
                              mediaType={slot.type || 'image'}
                              badgeLabel={
                                beforeSlotsMeta.length > 1
                                  ? `قبل #${idx + 1}`
                                  : 'قبل الإصلاح'
                              }
                              badgeTone="slate"
                              sizeClass="w-24 h-24"
                              isLoading={loadingMediaKey === `${item.id}_before_${idx}_`}
                              onClick={() => handleLoadOnDemandAttachment(item, 'before', idx)}
                            />
                          );
                        })}

                        {hasAfterMedia && (
                          <OnDemandPhotoSlot
                            loadedUrl={
                              loadedVault?.closurePhotoBase64 || ticket?.closurePhotoBase64
                            }
                            mediaType="image"
                            badgeLabel="بعد الإصلاح"
                            badgeTone="emerald"
                            sizeClass="w-24 h-24"
                            isLoading={loadingMediaKey === `${item.id}_after_0_`}
                            onClick={() => handleLoadOnDemandAttachment(item, 'after', 0)}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Section: Maximo Number (for Maintenance), Start Work, & Close with Fix Photo */}
                <div className="p-4 border-t border-slate-200 flex flex-col gap-2.5 bg-slate-50/70">
                  {/* Maximo Ticket # + Link + Attachment Row (Shown only for Maintenance track) */}
                  {!isCleaningMode && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 flex gap-1.5">
                          <input
                            type="text"
                            value={currentMaxInput}
                            onChange={(e) =>
                              setMaximoInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder="رقم البلاغ في ماكسمو (Maximo #)..."
                            className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none min-w-0"
                          />
                          <button
                            type="button"
                            disabled={savingTicketId === item.id}
                            onClick={() => handleSaveMaximoNumber(item)}
                            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 transition"
                          >
                            {savingTicketId === item.id ? '...' : 'حفظ الرقم والرابط'}
                          </button>
                        </div>

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
                              : hasMaximoMedia
                              ? 'تحديث مرفق البلاغ'
                              : 'رفع PDF / صورة البلاغ'}
                          </span>
                        </label>
                      </div>

                      {/* Maximo Direct URL Input (visible to Building Leader once linked) */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="url"
                          dir="ltr"
                          value={
                            maximoUrlInputs[item.id] !== undefined
                              ? maximoUrlInputs[item.id]
                              : ticket?.maximoUrl || ''
                          }
                          onChange={(e) =>
                            setMaximoUrlInputs((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          placeholder="رابط البلاغ في ماكسمو (https://...)"
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-[11px] font-mono text-slate-900 focus:border-blue-500 focus:outline-none text-left min-w-0"
                        />
                        {ticket?.maximoUrl && (
                          <a
                            href={ticket.maximoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>فتح الرابط</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Display existing Maximo Attachment on demand if uploaded */}
                  {!isCleaningMode && hasMaximoMedia && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-blue-900 font-bold">
                        {ticket?.maximoAttachmentType === 'pdf' ? (
                          <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <OnDemandPhotoSlot
                            loadedUrl={
                              loadedVault?.maximoAttachmentBase64 ||
                              ticket?.maximoAttachmentBase64
                            }
                            mediaType="image"
                            badgeLabel="ماكسمو"
                            badgeTone="blue"
                            sizeClass="w-16 h-16"
                            isLoading={loadingMediaKey === `${item.id}_maximo_0_`}
                            onClick={() => handleLoadOnDemandAttachment(item, 'maximo', 0)}
                          />
                        )}
                        <span className="leading-snug">
                          مرفق ماكسمو: {ticket?.maximoAttachmentName || 'مستند البلاغ'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadOnDemandAttachment(item, 'maximo', 0)}
                        disabled={loadingMediaKey === `${item.id}_maximo_0_`}
                        className="text-blue-700 font-bold underline shrink-0 inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {loadingMediaKey === `${item.id}_maximo_0_`
                            ? 'جاري التحميل...'
                            : ticket?.maximoAttachmentType === 'pdf'
                            ? 'تحميل PDF (عند الطلب)'
                            : 'معاينة الصورة'}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Quick "Start Work" Action Button for New Tickets before closing or before Maximo # */}
                  {ticketBucket === 'new' && (
                    <button
                      type="button"
                      disabled={startingTicketId === item.id}
                      onClick={() => handleStartTicketWork(item)}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>
                        {startingTicketId === item.id
                          ? 'جاري التحويل...'
                          : 'بدء العمل على البلاغ'}
                      </span>
                    </button>
                  )}

                  {/* Action Row: Close Ticket with Fix Image OR Copy Mandatory Evaluation Link */}
                  {ticketStatus === 'pending_evaluation' ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-bold text-purple-800 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>بانتظار اعتماد رائد {item.buildingId}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopyEvaluationLink(item)}
                        className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        {copiedLinkId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>نسخ رابط الاعتماد</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : ticketStatus === 'verified_closed' ? (
                    <div className="flex flex-col gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-bold">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>معتمد من رائد المبنى ({ticket?.verifiedBy})</span>
                        </span>
                        {ticket?.serviceRating && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>{ticket.serviceRating}/5</span>
                          </span>
                        )}
                      </div>
                      {ticket?.ksuEvaluationConfirmed && (
                        <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>تم تقييم الخدمة (مكتمل)</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCloseModal(item)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                    >
                      <Camera className="w-4 h-4" />
                      <span>
                        إغلاق البلاغ وإرفاق صورة الإصلاح
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          </div>

          {filteredTickets.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 20)}
              className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl text-xs font-bold text-slate-800 shadow-xs flex items-center justify-center gap-2 transition"
            >
              <ChevronDown className="w-4 h-4 text-blue-600" />
              <span>
                عرض المزيد من البلاغات (+20) — متبقي {filteredTickets.length - visibleCount} بلاغ
              </span>
            </button>
          )}
        </div>
      )}

      {/* Modal to Attach Fix Photo & Close Ticket */}
      {closingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>إغلاق البلاغ</span>
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
              {!isCleaningMode && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700">
                      رقم بلاغ ماكسمو:
                    </label>
                    <input
                      type="text"
                      value={closureMaximoNumber}
                      onChange={(e) => setClosureMaximoNumber(e.target.value)}
                      placeholder="أدخل رقم بلاغ ماكسمو..."
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:bg-white"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700">
                      رابط بلاغ ماكسمو:
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      value={closureMaximoUrl}
                      onChange={(e) => setClosureMaximoUrl(e.target.value)}
                      placeholder="https://..."
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 focus:bg-white text-left"
                    />
                  </div>
                </>
              )}

              {!isCleaningMode && !closingItem.maintenanceTicket?.maximoAttachmentBase64 && (
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">
                    مرفق ماكسمو (PDF / صورة):
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
                        : 'اختيار ملف PDF أو صورة'}
                    </span>
                  </label>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-slate-700">
                  صورة بعد الإصلاح:
                </label>
                {closurePhotoBase64 ? (
                  <div className="relative w-28 h-28 rounded-xl overflow-hidden border-2 border-emerald-500">
                    <img
                      src={closurePhotoBase64}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setClosurePhotoBase64(undefined)}
                      className="absolute top-1 left-1 bg-rose-600 text-white p-1 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer border-2 border-dashed border-emerald-400 hover:border-emerald-600 rounded-xl p-3.5 bg-emerald-50/50 flex items-center justify-center gap-2 text-emerald-900 font-bold">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleClosurePhotoSelect}
                      className="hidden"
                    />
                    <Camera className="w-5 h-5 text-emerald-600" />
                    <span>التقاط أو إرفاق صورة بعد الإصلاح</span>
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-700">
                  ملاحظات الإغلاق:
                </label>
                <textarea
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  placeholder="تفاصيل الإصلاح..."
                  rows={2}
                  className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingClosure || isProcessingClosureFile}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmittingClosure
                    ? 'جاري الإغلاق...'
                    : 'تأكيد إغلاق البلاغ'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Facility Chat Thread Modal for Technicians */}
      {liveChatItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>محادثة وتاريخ المرفق ({liveChatItem.id})</span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {getFixtureBilingualName(liveChatItem).ar} •{' '}
                  {getFixtureBilingualName(liveChatItem).en}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatItem(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2.5 bg-slate-50">
              {(liveChatItem.history || []).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  لا توجد رسائل مسجلة في محادثة هذا المرفق بعد.
                </div>
              ) : (
                (liveChatItem.history || []).map((ev: FacilityHistoryEvent) => {
                  const isTech = ev.actorRole === 'maintenance' || ev.actorRole === 'cleaning';
                  return (
                    <div
                      key={ev.id}
                      className={`rounded-2xl border p-3 text-xs flex flex-col gap-1.5 ${
                        isTech
                          ? 'bg-emerald-50/70 border-emerald-200 mr-4'
                          : 'bg-white border-slate-200 ml-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <strong className="text-slate-900">{ev.actorName}</strong>
                        <span className="font-mono text-[10px] text-slate-500">
                          {formatStandardDate(ev.timestamp, true)}
                        </span>
                      </div>
                      {ev.notes && <p className="text-slate-700">{ev.notes}</p>}
                      {(ev.hasMedia || (ev.media && ev.media.length > 0)) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ev.media && ev.media.length > 0 ? (
                            ev.media.map((m, mIdx) => (
                              <OnDemandPhotoSlot
                                key={m.id || mIdx}
                                loadedUrl={m.url}
                                mediaType={m.type || 'image'}
                                badgeLabel={`مرفق #${mIdx + 1}`}
                                badgeTone="blue"
                                sizeClass="w-16 h-16"
                                onClick={() =>
                                  setPreviewGallery({
                                    items: (ev.media || []).map((em, i) => ({
                                      url: em.url,
                                      type: em.type || 'image',
                                      name: em.name,
                                      label: `مرفق المحادثة (#${i + 1})`,
                                    })),
                                    initialIndex: mIdx,
                                    title: `مرفقات محادثة ${liveChatItem.id}`,
                                  })
                                }
                              />
                            ))
                          ) : (
                            (ev.mediaMeta && ev.mediaMeta.length > 0
                              ? ev.mediaMeta
                              : [{ id: 'ev_m0', type: 'image' as const }]
                            ).map((meta, mIdx) => {
                              const loadedEvImg =
                                loadedMediaByFixtureId[liveChatItem.id]?.historyMediaById?.[
                                  ev.id
                                ]?.[mIdx]?.url;
                              return (
                                <OnDemandPhotoSlot
                                  key={meta.id || mIdx}
                                  loadedUrl={loadedEvImg}
                                  mediaType={meta.type || 'image'}
                                  badgeLabel={
                                    ev.mediaMeta && ev.mediaMeta.length > 1
                                      ? `مرفق #${mIdx + 1}`
                                      : 'مرفق محادثة'
                                  }
                                  badgeTone="blue"
                                  sizeClass="w-20 h-20"
                                  isLoading={
                                    loadingMediaKey === `${liveChatItem.id}_chat_${mIdx}_${ev.id}`
                                  }
                                  onClick={() =>
                                    handleLoadOnDemandAttachment(liveChatItem, 'chat', mIdx, ev.id)
                                  }
                                />
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={handleSendTechChat}
              className="p-3 bg-white border-t border-slate-200 flex flex-col gap-2"
            >
              {chatPhotoBase64 && (
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 self-start">
                  <img src={chatPhotoBase64} alt="" className="w-12 h-12 rounded-lg object-cover" />
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
                <label className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleTechChatPhotoSelect}
                    className="hidden"
                  />
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                </label>
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="أضف رد أو صورة في محادثة المرفق..."
                  className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSendingChat || (!chatText.trim() && !chatPhotoBase64)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
