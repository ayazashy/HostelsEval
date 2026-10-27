// ============================================================================
// 🏛️ الصفحة الرئيسية ومجسم الـ 3D لجميع المباني + لوحة الأرقام الإجمالية
// Landing Page: 3D Visualization for All 34 Buildings & Comprehensive KPI Dashboard
// ============================================================================

import React, { useState } from 'react';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { computeCampusStats, getScoreColor } from '../../utils/healthScore';
import { Campus3DViewer } from '../3D/Campus3DViewer';
import {
  Droplets,
  AlertOctagon,
  Flame,
  Search,
  Filter,
  ArrowUpDown,
  Building,
  FileText,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  LogIn,
} from 'lucide-react';

interface CampusOverviewProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  onSelectBuilding: (buildingId: string) => void;
  onOpenReportModal: () => void;
  onOpenLogin?: () => void;
  isAuthenticated?: boolean;
}

export const CampusOverview: React.FC<CampusOverviewProps> = ({
  buildings,
  allEvaluations,
  onSelectBuilding,
  onOpenReportModal,
  onOpenLogin,
  isAuthenticated = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDefect, setFilterDefect] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'worst' | 'best' | 'number'>('worst');

  const campusStats = computeCampusStats(buildings, allEvaluations);

  // Compute Total Numbers
  const totalBuildingsCount = buildings.length; // 34
  const totalWingsCount = totalBuildingsCount * 4; // 136
  const totalFloorsCount = totalBuildingsCount * 5; // 170

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

  const filteredBuildings = buildings
    .filter((b) => {
      const matchesSearch =
        b.nameAr.includes(searchQuery) || b.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterDefect === 'uninspected') {
        return b.healthScore === undefined || b.healthScore === null;
      }
      if (filterDefect === 'leak') {
        return allEvaluations.some((e) => e.buildingId === b.id && e.defects.includes('leak'));
      }
      if (filterDefect === 'toilet') {
        return allEvaluations.some(
          (e) => e.buildingId === b.id && e.fixtureTypeCode === 'TOI' && e.status === 'broken'
        );
      }
      if (filterDefect === 'shower') {
        return allEvaluations.some(
          (e) => e.buildingId === b.id && e.fixtureTypeCode === 'SHW' && e.status === 'broken'
        );
      }
      if (filterDefect === 'heater') {
        return allEvaluations.some(
          (e) => e.buildingId === b.id && e.defects.includes('cold_heater')
        );
      }
      if (filterDefect === 'critical') {
        return b.healthScore !== undefined && b.healthScore !== null && b.healthScore < 50;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'worst') {
        const valA = a.healthScore ?? 999;
        const valB = b.healthScore ?? 999;
        return valA - valB;
      }
      if (sortBy === 'best') {
        const valA = a.healthScore ?? -1;
        const valB = b.healthScore ?? -1;
        return valB - valA;
      }
      return a.number - b.number;
    });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* 1. HERO & 3D CAMPUS VISUALIZATION FOR ALL 34 BUILDINGS */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <h2 className="text-base font-bold text-slate-900">
                المجسم المعماري ثلاثي الأبعاد لجميع مباني الإسكان (34 مبنى)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              استعراض تفاعلي حي لمجمع المباني السكنية • تلوين حسب حالة الصيانة والسلامة • انقر على أي مبنى للدخول إلى أجنحته الأربعة
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenReportModal}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>التقرير الشامل</span>
            </button>

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

      {/* 2. THE TOTAL NUMBERS DASHBOARD (لوحة الإحصائيات والأرقام الإجمالية) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              لوحة الإحصائيات والأرقام الإجمالية لمجمع الإسكان
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            تحديث ميداني مباشر وموثق
          </span>
        </div>

        {/* Top 4 Primary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Buildings & Wings */}
          <div className="bg-white border border-blue-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">إجمالي المباني والأجنحة</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Building className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-blue-700 font-mono">
                {totalBuildingsCount}
              </span>
              <span className="text-xs text-slate-600 font-bold">مبنى سكني</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
              <span>{totalWingsCount} جناح مستقل</span>
              <span>{totalFloorsCount} دور سكني</span>
            </div>
          </div>

          {/* Active Water Leaks */}
          <div className="bg-white border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">تسريبات مياه نشطة</span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <Droplets className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-rose-600 font-mono">
                {campusStats.totalLeaksCount}
              </span>
              <span className="text-xs text-rose-700 font-bold">حنفية / سيفون يسرب</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-rose-600 font-bold flex items-center justify-between">
              <span>هدر مائي مستمر</span>
              <span>أولوية سباكة عاجلة</span>
            </div>
          </div>

          {/* Critical Broken Outages */}
          <div className="bg-white border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">مراحيض ومراوش عاطلة</span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-600 font-mono">
                {campusStats.totalCriticalToilets + campusStats.totalBrokenShowers}
              </span>
              <span className="text-xs text-amber-700 font-bold">مرفق خارج الخدمة</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
              <span>{campusStats.totalCriticalToilets} مرحاض مسدود</span>
              <span>{campusStats.totalBrokenShowers} مروش متضرر</span>
            </div>
          </div>

          {/* Campus Average Health */}
          <div className="bg-white border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">متوسط سلامة مرافق الإسكان</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-emerald-600 font-mono">
                %{campusStats.campusAverageHealth}
              </span>
              <span className="text-xs text-slate-500 font-medium">مؤشر الجودة الميداني</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between">
              <span>{allEvaluations.length} فحص موثق</span>
              <span className="text-emerald-700 font-bold">حالة مستقرة</span>
            </div>
          </div>
        </div>

        {/* Secondary Total Numbers Summary Row: Building Health Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="text-xs font-bold text-slate-700 shrink-0">تصنيف المباني الـ 34:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span>{uninspectedBuildingsCount} مبنى غير مفحوص</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{healthyBuildingsCount} مبنى سليم (%80-%100)</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>{maintenanceBuildingsCount} مبنى صيانة (%50-%79)</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>{criticalBuildingsCount} مبنى حرج (&lt;%50)</span>
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium self-end md:self-auto">
            أجنحة مستقلة في كل مبنى (جناح 1، 2، 3، 4)
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

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1 hidden sm:block" />
            <button
              onClick={() => setFilterDefect('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterDefect === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({totalBuildingsCount})
            </button>
            <button
              onClick={() => setFilterDefect('uninspected')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                filterDefect === 'uninspected'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>⚪ غير مفحوص ({uninspectedBuildingsCount})</span>
            </button>
            <button
              onClick={() => setFilterDefect('critical')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                filterDefect === 'critical'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <span>🚨 حرج ({criticalBuildingsCount})</span>
            </button>
            <button
              onClick={() => setFilterDefect('leak')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                filterDefect === 'leak'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <span>💧 تسريب مياه ({campusStats.totalLeaksCount})</span>
            </button>
            <button
              onClick={() => setFilterDefect('toilet')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                filterDefect === 'toilet'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <span>🚽 مراحيض ({campusStats.totalCriticalToilets})</span>
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
              <option value="worst">الأكثر تضرراً أولاً</option>
              <option value="best">الأفضل صحة أولاً</option>
              <option value="number">تسلسل أرقام المباني (1-34)</option>
            </select>
          </div>
        </div>

        {/* 34 Buildings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBuildings.map((building) => {
            const bEvals = allEvaluations.filter((e) => e.buildingId === building.id);
            const colorDef = getScoreColor(building.healthScore);
            const leaksCount = bEvals.filter((e) => e.defects.includes('leak')).length;
            const brokenCount = bEvals.filter((e) => e.status === 'broken').length;

            return (
              <div
                key={building.id}
                onClick={() => onSelectBuilding(building.id)}
                className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between gap-3 group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition">
                        {building.nameAr}
                      </h3>
                      <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {building.id}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 mt-0.5 block">
                      {building.floorsCount || 5} أدوار • أجنحة متعددة
                    </span>
                  </div>

                  {/* Health Score Pill */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border font-mono"
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

                {/* Defect Indicators */}
                <div className="flex items-center gap-2 text-xs pt-2 border-t border-slate-100">
                  {leaksCount > 0 ? (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <Droplets className="w-3.5 h-3.5" />
                      <span>{leaksCount} تسريب</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">لا توجد تسريبات</span>
                  )}

                  {brokenCount > 0 && (
                    <span className="text-amber-600 font-bold flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>{brokenCount} معطل</span>
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-blue-600 font-bold flex items-center justify-between pt-1">
                  <span>معاينة أجنحة المبنى الـ 4 والمجسم 3D</span>
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
