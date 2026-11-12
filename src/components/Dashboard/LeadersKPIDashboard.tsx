// ============================================================================
// 📊 لوحة مؤشرات الأداء وتقييم رواد المباني (Building Leaders KPI & Full-Scan Dashboard)
// Evaluate all 34 Building Leaders on 100% initial building scan completion,
// period activity (Last 7/14/30 days or specific month), documentation quality, and follow-up.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { getBuildingStructure } from '../../utils/buildingStructureStore';
import {
  getZonesForFloor,
  loadActiveFacilityCategories,
} from '../../config/facilityTemplates';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  ArrowUpDown,
  Calendar,
  Camera,
  TrendingUp,
  Building2,
  Eye,
  Filter,
  ShieldAlert,
} from 'lucide-react';

interface LeadersKPIDashboardProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  isReadOnlyViewer?: boolean;
  viewerName?: string;
  onSelectBuilding: (buildingId: string) => void;
}

type PeriodFilterMode = 'last_7_days' | 'last_14_days' | 'last_30_days' | 'month' | 'all';

type SortOption =
  | 'scan_desc'
  | 'scan_asc'
  | 'activity_desc'
  | 'activity_asc'
  | 'kpi_desc'
  | 'kpi_asc'
  | 'pending_desc'
  | 'building_asc';

type StatusFilter = 'all' | 'completed_100' | 'in_progress' | 'lagging' | 'not_started';

interface FloorScanStat {
  floor: number;
  required: number;
  scanned: number;
  pct: number;
}

interface LeaderKPIRow {
  buildingId: string;
  buildingNumber: number;
  buildingNameAr: string;
  leaderName: string;
  totalRequiredFacilities: number;
  scannedFacilitiesCount: number;
  scanCompletionPct: number;
  floorBreakdown: FloorScanStat[];
  periodInspectionsCount: number;
  periodIssuesReported: number;
  periodVerifiedClosures: number;
  pendingLeaderApprovalCount: number;
  photoDocumentationPct: number;
  lastActivityIso: string | null;
  kpiScore: number;
  ratingTier: 'excellent' | 'good' | 'needs_followup' | 'inactive';
}

export const LeadersKPIDashboard: React.FC<LeadersKPIDashboardProps> = ({
  buildings,
  allEvaluations,
  isReadOnlyViewer = false,
  viewerName,
  onSelectBuilding,
}) => {
  const [periodMode, setPeriodMode] = useState<PeriodFilterMode>('last_30_days');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sortBy, setSortBy] = useState<SortOption>('scan_desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeCategories = useMemo(() => loadActiveFacilityCategories(), []);

  // Extract available YYYY-MM months from evaluations & history for the month selector
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    for (const ev of allEvaluations) {
      if (ev.updatedAt && ev.updatedAt.length >= 7) {
        set.add(ev.updatedAt.slice(0, 7));
      }
      if (Array.isArray(ev.history)) {
        for (const h of ev.history) {
          if (h.timestamp && h.timestamp.length >= 7) {
            set.add(h.timestamp.slice(0, 7));
          }
        }
      }
    }
    return Array.from(set).sort().reverse();
  }, [allEvaluations]);

  // Helper to check if an ISO date string falls within the selected time window
  const isTimestampInPeriod = (iso?: string | null): boolean => {
    if (!iso) return false;
    if (periodMode === 'all') return true;

    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return false;

    if (periodMode === 'month') {
      return iso.startsWith(selectedMonth);
    }

    const now = Date.now();
    const days =
      periodMode === 'last_7_days' ? 7 : periodMode === 'last_14_days' ? 14 : 30;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return ts >= cutoff && ts <= now + 60 * 1000;
  };

  // Compute per-building KPI rows
  const kpiRows: LeaderKPIRow[] = useMemo(() => {
    return buildings.map((b) => {
      const structure = getBuildingStructure(b.id);
      const bEvals = allEvaluations.filter(
        (e) => e.buildingId?.toUpperCase() === b.id.toUpperCase() && !e.isDeleted
      );

      // Map of unique scanned facility keys: `${floor}-${wingId}-${categoryCode}-${fixtureTypeCode}-${fixtureIndex}`
      const scannedSlotsByFloor = new Map<number, Set<string>>();
      for (let f = 1; f <= structure.floorsCount; f++) {
        scannedSlotsByFloor.set(f, new Set<string>());
      }

      let lastActivityIso: string | null = null;
      let periodInspectionsCount = 0;
      let periodIssuesReported = 0;
      let periodVerifiedClosures = 0;
      let pendingLeaderApprovalCount = 0;
      let totalDefectEvals = 0;
      let documentedDefectEvals = 0;
      let detectedLeaderName = b.leaderName || '';

      for (const ev of bEvals) {
        const slotKey = `${ev.floor}-${ev.wingId}-${ev.categoryCode}-${ev.fixtureTypeCode}-${ev.fixtureIndex}`;
        if (!scannedSlotsByFloor.has(ev.floor)) {
          scannedSlotsByFloor.set(ev.floor, new Set<string>());
        }
        scannedSlotsByFloor.get(ev.floor)!.add(slotKey);

        if (
          ev.inspectorName &&
          !ev.inspectorName.includes('زائر') &&
          !ev.inspectorName.includes('المشرف')
        ) {
          detectedLeaderName = ev.inspectorName;
        }

        if (ev.updatedAt && (!lastActivityIso || ev.updatedAt > lastActivityIso)) {
          lastActivityIso = ev.updatedAt;
        }

        if (ev.maintenanceTicket?.status === 'pending_evaluation') {
          pendingLeaderApprovalCount++;
        }

        if (ev.status !== 'operational') {
          totalDefectEvals++;
          const hasDocPhoto =
            ev.hasPhoto ||
            Boolean(ev.photoBase64) ||
            (Array.isArray(ev.media) && ev.media.length > 0);
          if (hasDocPhoto) {
            documentedDefectEvals++;
          }
        }

        // Count period activity from history events or evaluation updatedAt
        const leaderEventsInPeriod = Array.isArray(ev.history)
          ? ev.history.filter(
              (h) =>
                (h.actorRole === 'leader' || h.action === 'inspection') &&
                isTimestampInPeriod(h.timestamp)
            )
          : [];

        if (leaderEventsInPeriod.length > 0) {
          periodInspectionsCount += leaderEventsInPeriod.length;
          for (const h of leaderEventsInPeriod) {
            if (h.action === 'inspection' && h.status !== 'operational') {
              periodIssuesReported++;
            }
            if (h.action === 'leader_verified') {
              periodVerifiedClosures++;
            }
            if (h.timestamp && (!lastActivityIso || h.timestamp > lastActivityIso)) {
              lastActivityIso = h.timestamp;
            }
          }
        } else if (isTimestampInPeriod(ev.updatedAt)) {
          periodInspectionsCount += 1;
          if (ev.status !== 'operational') {
            periodIssuesReported += 1;
          }
          if (
            ev.maintenanceTicket?.status === 'verified_closed' &&
            isTimestampInPeriod(ev.maintenanceTicket.verifiedAt)
          ) {
            periodVerifiedClosures += 1;
          }
        }
      }

      // Compute exact required facilities per floor based on active zones and templates
      let totalRequiredFacilities = 0;
      let totalScannedFacilities = 0;
      const floorBreakdown: FloorScanStat[] = [];

      for (let f = 1; f <= structure.floorsCount; f++) {
        const activeTowers = structure.floorTowers[f] || [1, 2, 3, 4];
        const zones = getZonesForFloor(f, activeTowers);
        let floorRequired = 0;

        for (const zId of zones) {
          for (const cat of activeCategories) {
            const templates = cat.wingTemplates[zId] || [];
            for (const tmpl of templates) {
              floorRequired += tmpl.count;
            }
          }
        }

        const scannedSet = scannedSlotsByFloor.get(f) || new Set<string>();
        const floorScanned = Math.min(floorRequired, scannedSet.size);

        totalRequiredFacilities += floorRequired;
        totalScannedFacilities += floorScanned;

        floorBreakdown.push({
          floor: f,
          required: floorRequired,
          scanned: floorScanned,
          pct: floorRequired > 0 ? Math.round((floorScanned / floorRequired) * 100) : 0,
        });
      }

      const scanCompletionPct =
        totalRequiredFacilities > 0
          ? Math.min(
              100,
              Math.round((totalScannedFacilities / totalRequiredFacilities) * 100)
            )
          : 0;

      const photoDocumentationPct =
        totalDefectEvals > 0
          ? Math.round((documentedDefectEvals / totalDefectEvals) * 100)
          : totalScannedFacilities > 0
          ? 100
          : 0;

      // Composite KPI Score (0 - 100):
      // - 70 pts: Initial Full Building Scan Completion %
      // - 15 pts: Period Activity (scaled up to 15 pts for active inspections in window)
      // - 15 pts: Quality & Responsiveness (photo documentation + low pending backlog)
      const scanScore = scanCompletionPct * 0.7;
      const activityScore = Math.min(15, periodInspectionsCount * 0.75);
      const docScore =
        totalScannedFacilities > 0
          ? (photoDocumentationPct / 100) * 10 +
            Math.max(0, 5 - pendingLeaderApprovalCount * 1.5)
          : 0;
      const kpiScore = Math.min(100, Math.round(scanScore + activityScore + docScore));

      const ratingTier: LeaderKPIRow['ratingTier'] =
        scanCompletionPct === 0 && periodInspectionsCount === 0
          ? 'inactive'
          : kpiScore >= 85 || scanCompletionPct === 100
          ? 'excellent'
          : kpiScore >= 50 || scanCompletionPct >= 50
          ? 'good'
          : 'needs_followup';

      return {
        buildingId: b.id,
        buildingNumber: b.number,
        buildingNameAr: b.nameAr,
        leaderName: detectedLeaderName || `رائد ${b.id}`,
        totalRequiredFacilities,
        scannedFacilitiesCount: totalScannedFacilities,
        scanCompletionPct,
        floorBreakdown,
        periodInspectionsCount,
        periodIssuesReported,
        periodVerifiedClosures,
        pendingLeaderApprovalCount,
        photoDocumentationPct,
        lastActivityIso,
        kpiScore,
        ratingTier,
      };
    });
  }, [buildings, allEvaluations, activeCategories, periodMode, selectedMonth]);

  // Aggregate Campus-Wide Leader KPIs
  const campusTotals = useMemo(() => {
    const totalReq = kpiRows.reduce((acc, r) => acc + r.totalRequiredFacilities, 0);
    const totalScanned = kpiRows.reduce((acc, r) => acc + r.scannedFacilitiesCount, 0);
    const campusScanPct = totalReq > 0 ? Math.round((totalScanned / totalReq) * 100) : 0;

    const completed100Count = kpiRows.filter((r) => r.scanCompletionPct === 100).length;
    const advancedCount = kpiRows.filter(
      (r) => r.scanCompletionPct >= 50 && r.scanCompletionPct < 100
    ).length;
    const laggingCount = kpiRows.filter(
      (r) => r.scanCompletionPct > 0 && r.scanCompletionPct < 50
    ).length;
    const notStartedCount = kpiRows.filter((r) => r.scanCompletionPct === 0).length;

    const totalPeriodActions = kpiRows.reduce(
      (acc, r) => acc + r.periodInspectionsCount,
      0
    );
    const activeLeadersInPeriod = kpiRows.filter(
      (r) => r.periodInspectionsCount > 0
    ).length;
    const totalPendingApprovals = kpiRows.reduce(
      (acc, r) => acc + r.pendingLeaderApprovalCount,
      0
    );

    return {
      totalReq,
      totalScanned,
      campusScanPct,
      completed100Count,
      advancedCount,
      laggingCount,
      notStartedCount,
      totalPeriodActions,
      activeLeadersInPeriod,
      totalPendingApprovals,
    };
  }, [kpiRows]);

  // Filtered and Sorted rows
  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = kpiRows.filter((r) => {
      if (statusFilter === 'completed_100' && r.scanCompletionPct < 100) return false;
      if (
        statusFilter === 'in_progress' &&
        (r.scanCompletionPct < 50 || r.scanCompletionPct === 100)
      ) {
        return false;
      }
      if (statusFilter === 'lagging' && (r.scanCompletionPct === 0 || r.scanCompletionPct >= 50)) {
        return false;
      }
      if (statusFilter === 'not_started' && r.scanCompletionPct > 0) return false;

      if (q) {
        const matchBld =
          r.buildingId.toLowerCase().includes(q) ||
          r.buildingNameAr.toLowerCase().includes(q) ||
          r.leaderName.toLowerCase().includes(q);
        if (!matchBld) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'scan_desc':
          return (
            b.scanCompletionPct - a.scanCompletionPct ||
            b.scannedFacilitiesCount - a.scannedFacilitiesCount ||
            a.buildingNumber - b.buildingNumber
          );
        case 'scan_asc':
          return (
            a.scanCompletionPct - b.scanCompletionPct ||
            a.scannedFacilitiesCount - b.scannedFacilitiesCount ||
            a.buildingNumber - b.buildingNumber
          );
        case 'activity_desc':
          return (
            b.periodInspectionsCount - a.periodInspectionsCount ||
            b.scanCompletionPct - a.scanCompletionPct
          );
        case 'activity_asc':
          return (
            a.periodInspectionsCount - b.periodInspectionsCount ||
            a.scanCompletionPct - b.scanCompletionPct
          );
        case 'kpi_desc':
          return b.kpiScore - a.kpiScore || b.scanCompletionPct - a.scanCompletionPct;
        case 'kpi_asc':
          return a.kpiScore - b.kpiScore || a.scanCompletionPct - b.scanCompletionPct;
        case 'pending_desc':
          return (
            b.pendingLeaderApprovalCount - a.pendingLeaderApprovalCount ||
            b.scanCompletionPct - a.scanCompletionPct
          );
        case 'building_asc':
        default:
          return a.buildingNumber - b.buildingNumber;
      }
    });
  }, [kpiRows, statusFilter, searchQuery, sortBy]);

  const periodLabelAr = useMemo(() => {
    switch (periodMode) {
      case 'last_7_days':
        return 'آخر 7 أيام';
      case 'last_14_days':
        return 'آخر 14 يوماً';
      case 'last_30_days':
        return 'آخر 30 يوماً';
      case 'month':
        return `شهر ${selectedMonth}`;
      case 'all':
        return 'كل الفترات';
    }
  }, [periodMode, selectedMonth]);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20 md:pb-8">
      {/* Read-Only Account Notice Banner */}
      {isReadOnlyViewer && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-indigo-950">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              مرحباً <strong>{viewerName || 'متابع الأداء والمؤشرات'}</strong> — أنت تتصفح النظام بحساب{' '}
              <strong>متابعة الأداء ومؤشرات رواد المباني (عرض فقط بدون صلاحيات تعديل)</strong>.
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-[11px] shrink-0">
            صلاحية قراءة ورقابة فقط • Read-Only KPI View
          </span>
        </div>
      )}

      {/* Header + Time Period Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold mb-2">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>قياس الأداء والمسح الشامل لمرافق المباني الـ 34</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">
            مؤشرات أداء رواد المباني (KPI) ونسب إتمام المسح الشامل
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            المستهدف الأساسي: قيام كل رائد مبنى بفحص ومسح جميع مرافق المبنى (100% Full Scan) لمرة واحدة على الأقل، مع متابعة نشاطه الدوري واعتماد بلاغات الصيانة والنظافة.
          </p>
        </div>

        {/* Period Filter Selector */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-bold px-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>نطاق قياس النشاط:</span>
          </div>

          <button
            type="button"
            onClick={() => setPeriodMode('last_7_days')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition ${
              periodMode === 'last_7_days'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            آخر 7 أيام
          </button>

          <button
            type="button"
            onClick={() => setPeriodMode('last_30_days')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition ${
              periodMode === 'last_30_days'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            آخر 30 يوماً
          </button>

          <button
            type="button"
            onClick={() => setPeriodMode('month')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition ${
              periodMode === 'month'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            شهر محدد
          </button>

          {periodMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-blue-300 text-slate-900 rounded-lg px-2.5 py-1 font-mono font-bold text-xs"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setPeriodMode('all')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition ${
              periodMode === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            كل الفترات
          </button>
        </div>
      </div>

      {/* Top 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Campus Full Scan % */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              نسبة المسح الشامل للحرم السكني
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">
                {campusTotals.campusScanPct}%
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                ({campusTotals.totalScanned} / {campusTotals.totalReq} مرفق)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${campusTotals.campusScanPct}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-500">
            إجمالي المرافق الممسوحة لمرة واحدة على الأقل
          </span>
        </div>

        {/* Card 2: Buildings Completed 100% Scan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              المباني المكتملة المسح (100%)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700 font-mono">
              {campusTotals.completed100Count}
            </span>
            <span className="text-xs font-bold text-slate-400">من أصل 34 مبنى</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold">
              متقدم (50-99%): {campusTotals.advancedCount}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">
              جزئي (1-49%): {campusTotals.laggingCount}
            </span>
          </div>
        </div>

        {/* Card 3: Activity in Selected Period */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              نشاط الفحص ({periodLabelAr})
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-700 font-mono">
              {campusTotals.totalPeriodActions}
            </span>
            <span className="text-xs text-slate-500">عملية فحص وتحديث</span>
          </div>
          <span className="text-[11px] text-slate-600">
            عدد الرواد النشطين في الفترة:{' '}
            <strong className="text-slate-900 font-mono">
              {campusTotals.activeLeadersInPeriod} / 34
            </strong>
          </span>
        </div>

        {/* Card 4: Uninspected / Pending Attention */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              مبانٍ لم تبدأ المسح (0%)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 font-mono">
              {campusTotals.notStartedCount}
            </span>
            <span className="text-xs text-slate-500">مبنى بحاجة لتوجيه الرائد</span>
          </div>
          <span className="text-[11px] text-purple-700 font-bold">
            بانتظار اعتماد الرائد بعد الصيانة: {campusTotals.totalPendingApprovals} بلاغ
          </span>
        </div>
      </div>

      {/* Visual Matrix of All 34 Buildings Full-Scan Progress */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              المخطط البصري لنسب إتمام المسح الشامل للمباني الـ 34
            </h3>
            <p className="text-[11px] text-slate-500">
              اضغط على أي مبنى لاستعراض تفاصيله الميدانية. الألوان توضح نسبة تغطية رائد المبنى لجميع مرافق مبناه.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              مكتمل 100% ({campusTotals.completed100Count})
            </span>
            <span className="flex items-center gap-1.5 text-blue-700">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              متقدم 50-99% ({campusTotals.advancedCount})
            </span>
            <span className="flex items-center gap-1.5 text-amber-700">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              متأخر 1-49% ({campusTotals.laggingCount})
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              لم يبدأ 0% ({campusTotals.notStartedCount})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
          {kpiRows.map((row) => {
            const barColor =
              row.scanCompletionPct === 100
                ? 'bg-emerald-500'
                : row.scanCompletionPct >= 50
                ? 'bg-blue-500'
                : row.scanCompletionPct > 0
                ? 'bg-amber-500'
                : 'bg-slate-300';

            const cardBorder =
              row.scanCompletionPct === 100
                ? 'border-emerald-200 bg-emerald-50/40'
                : row.scanCompletionPct >= 50
                ? 'border-blue-200 bg-blue-50/30'
                : row.scanCompletionPct > 0
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-slate-200 bg-slate-50/60';

            return (
              <button
                key={row.buildingId}
                type="button"
                onClick={() => onSelectBuilding(row.buildingId)}
                className={`p-2.5 rounded-xl border text-right transition hover:shadow-sm flex flex-col gap-1.5 ${cardBorder}`}
                title={`${row.buildingNameAr} (${row.leaderName}): ${row.scannedFacilitiesCount}/${row.totalRequiredFacilities} مرفق (${row.scanCompletionPct}%)`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 font-mono">
                    {row.buildingId}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-black ${
                      row.scanCompletionPct === 100
                        ? 'text-emerald-700'
                        : row.scanCompletionPct >= 50
                        ? 'text-blue-700'
                        : row.scanCompletionPct > 0
                        ? 'text-amber-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {row.scanCompletionPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${Math.max(row.scanCompletionPct, 4)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="font-mono">
                    {row.scannedFacilitiesCount}/{row.totalRequiredFacilities}
                  </span>
                  {row.periodInspectionsCount > 0 && (
                    <span className="text-indigo-600 font-bold">
                      +{row.periodInspectionsCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Controls: Search, Filter by Completion Tier, and Sort Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث برقم المبنى (B01..B34) أو اسم رائد المبنى..."
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl pr-9 pl-3 py-2.5 placeholder-slate-400"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            {(
              [
                { id: 'all', label: `الكل (${kpiRows.length})` },
                {
                  id: 'completed_100',
                  label: `مكتمل 100% (${campusTotals.completed100Count})`,
                },
                {
                  id: 'in_progress',
                  label: `متقدم 50-99% (${campusTotals.advancedCount})`,
                },
                { id: 'lagging', label: `متأخر 1-49% (${campusTotals.laggingCount})` },
                {
                  id: 'not_started',
                  label: `لم يبدأ 0% (${campusTotals.notStartedCount})`,
                },
              ] as { id: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-xl font-bold transition ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-slate-600 font-bold shrink-0">ترتيب حسب:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 font-bold"
            >
              <option value="scan_desc">الأعلى إنجازاً في المسح الشامل (%)</option>
              <option value="scan_asc">الأقل إنجازاً (المتأخرون في المسح أولاً)</option>
              <option value="activity_desc">
                الأكثر نشاطاً في الفترة ({periodLabelAr})
              </option>
              <option value="activity_asc">
                الأقل نشاطاً في الفترة ({periodLabelAr})
              </option>
              <option value="kpi_desc">الأعلى في التقييم العام (KPI Score)</option>
              <option value="kpi_asc">الأقل في التقييم العام (KPI Score)</option>
              <option value="pending_desc">الأكثر بلاغات معلقة بانتظار الاعتماد</option>
              <option value="building_asc">رقم المبنى بالتسلسل (B01 → B34)</option>
            </select>
          </div>
        </div>

        {/* Sortable Evaluation Table */}
        <div className="border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">المبنى ورائد المبنى</th>
                <th className="p-3 min-w-[210px]">
                  الهدف الأساسي: المسح الشامل للمبنى (Full Scan)
                </th>
                <th className="p-3 min-w-[165px]">تغطية الأدوار (1..5)</th>
                <th className="p-3">النشاط في ({periodLabelAr})</th>
                <th className="p-3">التوثيق بالصور والمتابعة</th>
                <th className="p-3">مؤشر الأداء العام (KPI)</th>
                <th className="p-3">آخر نشاط</th>
                <th className="p-3 text-center">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredAndSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    لا توجد مباني مطابقة لخيارات الفلترة الحالية.
                  </td>
                </tr>
              ) : (
                filteredAndSortedRows.map((row, idx) => {
                  const progressColor =
                    row.scanCompletionPct === 100
                      ? 'bg-emerald-600'
                      : row.scanCompletionPct >= 50
                      ? 'bg-blue-600'
                      : row.scanCompletionPct > 0
                      ? 'bg-amber-500'
                      : 'bg-slate-300';

                  return (
                    <tr
                      key={row.buildingId}
                      className="hover:bg-slate-50/90 transition"
                    >
                      <td className="p-3 font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Building & Leader Name */}
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-black text-slate-800 shrink-0">
                            {row.buildingId}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">
                              {row.buildingNameAr}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {row.leaderName}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Full Scan Progress */}
                      <td className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-black text-sm text-slate-900">
                            {row.scanCompletionPct}%
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {row.scannedFacilitiesCount} من {row.totalRequiredFacilities}{' '}
                            مرفق
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progressColor}`}
                            style={{ width: `${row.scanCompletionPct}%` }}
                          />
                        </div>
                      </td>

                      {/* Per-Floor Breakdown Pills */}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {row.floorBreakdown.map((fb) => (
                            <span
                              key={fb.floor}
                              title={`الدور ${fb.floor}: تم مسح ${fb.scanned} من ${fb.required} (${fb.pct}%)`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                fb.pct === 100
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : fb.pct > 0
                                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              }`}
                            >
                              د{fb.floor}: {fb.pct}%
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Activity in Selected Period */}
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-900">
                            <span className="font-mono text-indigo-700 font-black">
                              {row.periodInspectionsCount}
                            </span>{' '}
                            عملية فحص
                          </span>
                          <span className="text-[10px] text-slate-500">
                            أعطال مرصودة: {row.periodIssuesReported} • اعتماد إغلاق:{' '}
                            {row.periodVerifiedClosures}
                          </span>
                        </div>
                      </td>

                      {/* Photo Documentation & Pending Approvals */}
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700">
                            <Camera className="w-3.5 h-3.5 text-blue-600" />
                            <span>توثيق الصور:</span>
                            <strong className="font-mono">
                              {row.photoDocumentationPct}%
                            </strong>
                          </span>
                          {row.pendingLeaderApprovalCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 font-bold w-fit">
                              <AlertTriangle className="w-3 h-3" />
                              بانتظار اعتماده: {row.pendingLeaderApprovalCount}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-bold">
                              لا توجد بلاغات معلقة ✓
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Overall KPI Score & Badge */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-9 h-9 rounded-xl font-mono font-black text-xs flex items-center justify-center border ${
                              row.ratingTier === 'excellent'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : row.ratingTier === 'good'
                                ? 'bg-blue-50 border-blue-300 text-blue-800'
                                : row.ratingTier === 'needs_followup'
                                ? 'bg-amber-50 border-amber-300 text-amber-800'
                                : 'bg-rose-50 border-rose-200 text-rose-700'
                            }`}
                          >
                            {row.kpiScore}
                          </div>
                          <div className="flex flex-col">
                            <span
                              className={`text-[11px] font-bold ${
                                row.ratingTier === 'excellent'
                                  ? 'text-emerald-700'
                                  : row.ratingTier === 'good'
                                  ? 'text-blue-700'
                                  : row.ratingTier === 'needs_followup'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {row.ratingTier === 'excellent'
                                ? 'ممتاز / متميز'
                                : row.ratingTier === 'good'
                                ? 'جيد جداً'
                                : row.ratingTier === 'needs_followup'
                                ? 'بحاجة متابعة'
                                : 'لم يبدأ المسح'}
                            </span>
                            <span className="text-[10px] text-slate-400">من 100 نقطة</span>
                          </div>
                        </div>
                      </td>

                      {/* Last Activity Date */}
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {row.lastActivityIso
                          ? new Date(row.lastActivityIso).toLocaleDateString('ar-SA', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'لا يوجد'}
                      </td>

                      {/* Inspect Building Details Action */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => onSelectBuilding(row.buildingId)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white rounded-xl font-bold transition inline-flex items-center gap-1.5"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>عرض المبنى</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
