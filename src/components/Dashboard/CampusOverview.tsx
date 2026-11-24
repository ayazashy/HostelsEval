// ============================================================================
// الصفحة الرئيسية ومجسم الـ 3D لجميع المباني + لوحة المؤشرات الشاملة
// Landing Page: 3D Visualization for All 34 Buildings & Comprehensive Dashboard
// ============================================================================

import React, { useState } from 'react';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { computeCampusStats, getScoreColor } from '../../utils/healthScore';
import { resolveEvaluationDepartment } from '../../config/facilityTemplates';
import { Campus3DViewer } from '../3D/Campus3DViewer';
import {
  AlertOctagon,
  Search,
  Filter,
  ArrowUpDown,
  Building,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  LogIn,
  Wrench,
  Clock,
  Droplets,
  Zap,
} from 'lucide-react';

interface CampusOverviewProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  onSelectBuilding: (buildingId: string) => void;
  onOpenReportModal: () => void;
  onOpenLogin?: () => void;
  isAuthenticated?: boolean;
  canOpenReport?: boolean;
}

type CampusFilterMode =
  | 'all'
  | 'uninspected'
  | 'has_issues'
  | 'critical'
  | 'plumbing'
  | 'tech_civil';

export const CampusOverview: React.FC<CampusOverviewProps> = ({
  buildings,
  allEvaluations,
  onSelectBuilding,
  onOpenReportModal,
  onOpenLogin,
  isAuthenticated = false,
  canOpenReport = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<CampusFilterMode>('all');
  const [sortBy, setSortBy] = useState<'worst' | 'best' | 'issues' | 'number'>('number');

  const campusStats = computeCampusStats(buildings, allEvaluations);
  const totalBuildingsCount = buildings.length;

  // Health distribution
  const uninspectedBuildingsCount = buildings.filter(
    (b) => b.healthScore === undefined || b.healthScore === null
  ).length;
  const healthyBuildingsCount = buildings.filter(
    (b) => b.healthScore !== undefined && b.healthScore !== null && b.healthScore >= 80
  ).length;
  const maintenanceBuildingsCount = buildings.filter(
    (b) =>
      b.healthScore !== undefined &&
      b.healthScore !== null &&
      b.healthScore >= 50 &&
      b.healthScore < 80
  ).length;
  const criticalBuildingsCount = buildings.filter(
    (b) => b.healthScore !== undefined && b.healthScore !== null && b.healthScore < 50
  ).length;

  const buildingsWithIssuesCount = buildings.filter((b) =>
    allEvaluations.some(
      (e) => !e.isDeleted && e.buildingId === b.id && e.status !== 'operational'
    )
  ).length;

  const filteredBuildings = buildings
    .filter((b) => {
      const matchesSearch =
        b.nameAr.includes(searchQuery) ||
        b.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const bEvals = allEvaluations.filter(
        (e) => !e.isDeleted && e.buildingId === b.id
      );

      if (filterMode === 'uninspected') {
        return b.healthScore === undefined || b.healthScore === null;
      }
      if (filterMode === 'has_issues') {
        return bEvals.some((e) => e.status !== 'operational');
      }
      if (filterMode === 'critical') {
        return (
          b.healthScore !== undefined && b.healthScore !== null && b.healthScore < 50
        );
      }
      if (filterMode === 'plumbing') {
        return bEvals.some(
          (e) =>
            e.status !== 'operational' &&
            resolveEvaluationDepartment(e) === 'plumbing'
        );
      }
      if (filterMode === 'tech_civil') {
        return bEvals.some((e) => {
          if (e.status === 'operational') return false;
          const dept = resolveEvaluationDepartment(e);
          return (
            dept === 'electrical' ||
            dept === 'hvac_mechanical' ||
            dept === 'carpentry_civil'
          );
        });
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'worst') {
        const valA = a.healthScore ?? 999;
        const valB = b.healthScore ?? 999;
        return valA - valB || a.number - b.number;
      }
      if (sortBy === 'best') {
        const valA = a.healthScore ?? -1;
        const valB = b.healthScore ?? -1;
        return valB - valA || a.number - b.number;
      }
      if (sortBy === 'issues') {
        const issuesA = a.stats.activeDefectsCount || 0;
        const issuesB = b.stats.activeDefectsCount || 0;
        return issuesB - issuesA || a.number - b.number;
      }
      return a.number - b.number;
    });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* 1. HERO & 3D CAMPUS VISUALIZATION FOR ALL 34 BUILDINGS */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">
              خريطة مجمع الإسكان ({totalBuildingsCount} مبنى)
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canOpenReport && (
              <button
                onClick={onOpenReportModal}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span>التقرير الشامل</span>
              </button>
            )}

            {!isAuthenticated && onOpenLogin && (
              <button
                onClick={onOpenLogin}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>دخول رائد المبنى / المشرف</span>
              </button>
            )}
          </div>
        </div>

        {/* 3D Canvas Element */}
        <Campus3DViewer
          buildings={buildings}
          allEvaluations={allEvaluations}
          onSelectBuilding={onSelectBuilding}
        />
      </section>

      {/* 2. THE TOTAL NUMBERS DASHBOARD (Comprehensive Across All Trades & Categories) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              المؤشرات العامة لمجمع الإسكان
            </h2>
          </div>
        </div>

        {/* Top 4 Primary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Audited vs Uninspected Buildings */}
          <div className="bg-white border border-blue-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">تغطية مباني المجمع</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Building className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-blue-700 font-mono">
                {campusStats.auditedBuildings}
              </span>
              <span className="text-xs text-slate-600 font-bold">
                من {totalBuildingsCount} مبنى مفحوص
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
              <span>{uninspectedBuildingsCount} لم يبدأ الفحص</span>
              <span>{campusStats.totalFixturesCount} مرفق مسجل</span>
            </div>
          </div>

          {/* Card 2: Total Active Issues & Tickets Across ALL Departments */}
          <div className="bg-white border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">
                إجمالي البلاغات والأعطال النشطة
              </span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Wrench className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-700 font-mono">
                {campusStats.totalActiveIssuesCount}
              </span>
              <span className="text-xs text-amber-800 font-bold">مرفق يحتاج معالجة</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
              <span>{campusStats.totalNeedsMaintenance} يحتاج صيانة/نظافة</span>
              <span className="text-rose-600 font-bold">{campusStats.totalBrokenOutages} عاطل</span>
            </div>
          </div>

          {/* Card 3: Critical Outages (Broken) */}
          <div className="bg-white border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">مرافق عاطلة / طارئة</span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-rose-600 font-mono">
                {campusStats.totalBrokenOutages}
              </span>
              <span className="text-xs text-rose-700 font-bold">خارج الخدمة</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
              <span>{buildingsWithIssuesCount} مبنى بها بلاغات</span>
              <span className="text-rose-700 font-bold">أولوية عاجلة</span>
            </div>
          </div>

          {/* Card 4: Campus Average Readiness & Safety */}
          <div className="bg-white border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">مؤشر الجاهزية والسلامة</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-emerald-600 font-mono">
                {campusStats.auditedBuildings > 0
                  ? `%${campusStats.campusAverageHealth}`
                  : '—'}
              </span>
              <span className="text-xs text-slate-500 font-medium">متوسط المباني المفحوصة</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between">
              <span>{campusStats.totalOperationalCount} مرفق سليم</span>
              <span className="text-emerald-700 font-bold">حالة التشغيل</span>
            </div>
          </div>
        </div>

        {/* Secondary Summary Row: Building Health Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
            <span className="text-xs font-bold text-slate-700 shrink-0">تصنيف حالة المباني:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{uninspectedBuildingsCount} لم يفحص</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{healthyBuildingsCount} سليم (80%-100%)</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>{maintenanceBuildingsCount} صيانة (50%-79%)</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>{criticalBuildingsCount} حرج (&lt;50%)</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SEARCH, FILTERS & 34 BUILDINGS CARDS */}
      <section className="flex flex-col gap-4">
        {/* Controls Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم المبنى (مثال: مبنى 14 أو B07)..."
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl pr-9 pl-4 py-2.5 placeholder-slate-400 focus:bg-white"
            />
          </div>

          {/* Filter Chips (All Icons via Lucide - Zero Emojis) */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1 hidden sm:block" />
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({totalBuildingsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('uninspected')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterMode === 'uninspected'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>لم يفحص ({uninspectedBuildingsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('has_issues')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterMode === 'has_issues'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>بها أعطال ({buildingsWithIssuesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('critical')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterMode === 'critical'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>حرج ({criticalBuildingsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('plumbing')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterMode === 'plumbing'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>سباكة</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('tech_civil')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterMode === 'tech_civil'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>كهرباء / تكييف / مدني</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1 self-end md:self-auto text-xs text-slate-600">
            <ArrowUpDown className="w-3.5 h-3.5 ml-1" />
            <span>ترتيب:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-2.5 py-1.5 font-bold cursor-pointer"
            >
              <option value="number">رقم المبنى (1-34)</option>
              <option value="issues">الأكثر بلاغات</option>
              <option value="worst">الأقل جاهزية</option>
              <option value="best">الأعلى جاهزية</option>
            </select>
          </div>
        </div>

        {/* 34 Buildings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBuildings.map((building) => {
            const bEvals = allEvaluations.filter(
              (e) => !e.isDeleted && e.buildingId === building.id
            );
            const colorDef = getScoreColor(building.healthScore);
            const brokenCount = bEvals.filter((e) => e.status === 'broken').length;
            const needsMaintCount = bEvals.filter(
              (e) => e.status === 'needs_maintenance'
            ).length;
            const totalIssuesCount = brokenCount + needsMaintCount;

            return (
              <div
                key={building.id}
                onClick={() => onSelectBuilding(building.id)}
                className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between gap-3 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-blue-50 border border-slate-200 group-hover:border-blue-400 text-slate-900 group-hover:text-blue-600 flex items-center justify-center font-mono font-black text-xl transition shadow-xs shrink-0">
                      {building.number}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {building.id}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        {building.floorsCount || 5} أدوار • 4 أجنحة
                      </span>
                    </div>
                  </div>

                  {/* Health Score Pill */}
                  <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border font-mono shrink-0"
                    style={{
                      backgroundColor: `${colorDef.hex}15`,
                      borderColor: `${colorDef.hex}30`,
                      color: colorDef.hex,
                    }}
                  >
                    <span>
                      {building.healthScore !== undefined && building.healthScore !== null
                        ? `%${building.healthScore}`
                        : 'غير مفحوص'}
                    </span>
                  </div>
                </div>

                {/* Comprehensive Facility Status Row (Never defaults to "no leaks"!) */}
                <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-slate-100">
                  {bEvals.length === 0 ? (
                    <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>غير مفحوص</span>
                    </span>
                  ) : totalIssuesCount === 0 ? (
                    <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>سليم ({bEvals.length} مرفق)</span>
                    </span>
                  ) : (
                    <>
                      {brokenCount > 0 && (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <AlertOctagon className="w-3.5 h-3.5" />
                          <span>{brokenCount} عاطل</span>
                        </span>
                      )}
                      {needsMaintCount > 0 && (
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>{needsMaintCount} صيانة</span>
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 mr-auto font-mono">
                        ({bEvals.length} فحص)
                      </span>
                    </>
                  )}
                </div>

                <div className="text-[11px] text-blue-600 font-bold flex items-center justify-between pt-1">
                  <span>عرض المبنى</span>
                  <span className="transform group-hover:-translate-x-1 transition">←</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
