// ============================================================================
// 📱 استمارة الفحص الميداني لرواد المباني (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React, { useState } from 'react';
import {
  FixtureEvaluation,
  BuildingInfo,
} from '../../types/hostel';
import {
  ALL_FACILITY_CATEGORIES,
  BATHROOM_CATEGORY_CONFIG,
  loadActiveFacilityCategories,
} from '../../config/facilityTemplates';
import { WING_NAMES_AR } from '../../config/buildings';
import { FixtureCard } from './FixtureCard';
import { calculateWingHealth, getScoreColor } from '../../utils/healthScore';
import { saveEvaluation } from '../../services/firestoreService';
import {
  ShieldCheck,
  CheckCheck,
  Filter,
  Layers,
  Lock,
} from 'lucide-react';

interface LeaderPortalProps {
  buildings: BuildingInfo[];
  activeBuildingId: string;
  evaluations: FixtureEvaluation[];
  inspectorName: string;
  onChangeBuilding: (buildingId: string) => void;
  onRefreshEvaluations: () => void;
  isReadOnly?: boolean;
  onOpenLogin?: () => void;
}

export const LeaderPortal: React.FC<LeaderPortalProps> = ({
  buildings,
  activeBuildingId,
  evaluations,
  inspectorName,
  onChangeBuilding,
  onRefreshEvaluations,
  isReadOnly = false,
  onOpenLogin,
}) => {
  const currentBuilding = buildings.find((b) => b.id === activeBuildingId) || buildings[0];

  const [selectedFloor, setSelectedFloor] = useState<number>(1);
  const [selectedWing, setSelectedWing] = useState<number>(1);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('BTH');
  const [filterStatus, setFilterStatus] = useState<'all' | 'issues'>('all');
  const [categories, setCategories] = useState(() => loadActiveFacilityCategories());
  const [cloudStatus, setCloudStatus] = useState<{ synced: boolean; warning?: string } | null>(null);

  React.useEffect(() => {
    const handleUpdate = () => {
      setCategories(loadActiveFacilityCategories());
    };
    const handleCloudEvent = (e: any) => {
      if (e.detail?.type === 'save_success') {
        setCloudStatus({ synced: true });
      } else if (e.detail?.type === 'save_warning') {
        setCloudStatus({
          synced: false,
          warning: 'تم الحفظ محلياً (التخزين السحابي بحاجة لتفعيل قواعد Firebase)',
        });
      }
    };

    window.addEventListener('hostels-facilities-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('hostels_cloud_sync_event', handleCloudEvent);

    return () => {
      window.removeEventListener('hostels-facilities-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('hostels_cloud_sync_event', handleCloudEvent);
    };
  }, []);

  const activeCategory =
    categories.find((cat) => cat.code === selectedCategoryCode) ||
    categories[0] ||
    BATHROOM_CATEGORY_CONFIG;

  const wingTemplates =
    activeCategory.wingTemplates[selectedWing] ||
    activeCategory.wingTemplates[1] ||
    [];

  const currentSectorEvals = evaluations.filter(
    (e) =>
      e.buildingId === currentBuilding.id &&
      e.wingId === selectedWing &&
      e.floor === selectedFloor &&
      e.categoryCode === selectedCategoryCode
  );

  const totalSlotsCount = wingTemplates.reduce((acc, curr) => acc + curr.count, 0);
  const evaluatedCount = currentSectorEvals.length;
  const sectorHealth = calculateWingHealth(currentSectorEvals);
  const sectorColor = getScoreColor(sectorHealth);

  const handleSaveEvaluation = async (evaluation: FixtureEvaluation) => {
    const res = await saveEvaluation(evaluation);
    onRefreshEvaluations();
    return res;
  };

  const handleMarkRemainingAsGood = async () => {
    const promises: Promise<any>[] = [];

    wingTemplates.forEach((tmpl) => {
      for (let idx = 1; idx <= tmpl.count; idx++) {
        const exists = currentSectorEvals.some(
          (e) => e.fixtureTypeCode === tmpl.typeCode && e.fixtureIndex === idx
        );
        if (!exists) {
          const newEval: FixtureEvaluation = {
            id: `${currentBuilding.id}-W${selectedWing}-F${selectedFloor}-${activeCategory.code}-${tmpl.typeCode}-${idx.toString().padStart(2, '0')}`,
            buildingId: currentBuilding.id,
            wingId: selectedWing,
            floor: selectedFloor,
            categoryCode: activeCategory.code,
            fixtureTypeCode: tmpl.typeCode,
            fixtureIndex: idx,
            status: 'operational',
            defects: [],
            rating: 5,
            hasPhoto: false,
            inspectorName,
            updatedAt: new Date().toISOString(),
          };
          promises.push(saveEvaluation(newEval));
        }
      }
    });

    await Promise.all(promises);
    onRefreshEvaluations();
  };

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">
              استمارة الفحص الميداني
            </span>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs px-2.5 py-0.5 rounded-lg font-bold">
              {currentBuilding.nameAr} ({currentBuilding.id})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>المفتش المعتمد:</span>
              <span className="text-slate-800 font-bold">{inspectorName}</span>
            </div>

            {cloudStatus?.synced && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                سحابي Firebase متصل 🟢
              </span>
            )}
            {cloudStatus && !cloudStatus.synced && (
              <span
                className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200"
                title={cloudStatus.warning}
              >
                تخزين محلي (Firebase بحاجة لتفعيل القواعد) 🟡
              </span>
            )}
          </div>
        </div>

        {/* Change Building */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">المبنى:</label>
          <select
            value={activeBuildingId}
            onChange={(e) => onChangeBuilding(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3 py-2 font-bold cursor-pointer"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr} ({b.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Read-Only Public Visitor Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold">وضع المعاينة العامة (للقراءة فقط - لا توجد صلاحيات كتابة أو تعديل)</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                تصفح استمارة الفحص مفتوح للاطلاع العام. لتسجيل الملاحظات الميدانية وتحديث حالة المرافق، يلزم تسجيل الدخول بكود رائد المبنى أو حساب المشرف.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenLogin}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-sm flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>تسجيل الدخول للتعديل</span>
          </button>
        </div>
      )}

      {/* Sector Navigation: Category + Floor + Wing */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
        {/* Category Tabs */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            المرفق المطلوب فحصه:
          </span>
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat.code}
                onClick={() => setSelectedCategoryCode(cat.code)}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition ${
                  selectedCategoryCode === cat.code
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{cat.nameAr}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Floor Selector */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-slate-600 shrink-0">الدور:</span>
          <div className="flex gap-1.5 flex-1 justify-end">
            {Array.from({ length: currentBuilding.floorsCount }, (_, i) => i + 1).map((floorNum) => (
              <button
                key={floorNum}
                onClick={() => setSelectedFloor(floorNum)}
                className={`py-1.5 px-3.5 rounded-xl text-xs font-bold transition ${
                  selectedFloor === floorNum
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الدور {floorNum}
              </button>
            ))}
          </div>
        </div>

        {/* Wing Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((wId) => {
            const isSelected = selectedWing === wId;
            return (
              <button
                key={wId}
                onClick={() => setSelectedWing(wId)}
                className={`p-3 rounded-xl border text-right transition flex flex-col gap-1 ${
                  isSelected
                    ? 'bg-blue-50 border-blue-500 text-slate-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    جناح {wId}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    W{wId}
                  </span>
                </div>
                <span className="text-[10px] text-blue-700 font-medium">
                  {wId <= 2 ? '3 مراحيض • 3 مراوش • 3 مغاسل • 1 سخان' : 'مرحاضين • مروشين • مغسلتين • سخانين'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sector Progress */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-base border"
            style={{
              backgroundColor: `${sectorColor.hex}15`,
              borderColor: `${sectorColor.hex}40`,
              color: sectorColor.hex,
            }}
          >
            %{sectorHealth}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                حالة {activeCategory.nameAr} (الجناح {selectedWing} - الدور {selectedFloor})
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{
                  backgroundColor: `${sectorColor.hex}15`,
                  color: sectorColor.hex,
                }}
              >
                {sectorColor.labelAr}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              تم فحص <strong className="text-slate-900">{evaluatedCount}</strong> من أصل{' '}
              <strong className="text-slate-900">{totalSlotsCount}</strong> مرفق محدد لهذا الجناح
            </div>
          </div>
        </div>

        {!isReadOnly && evaluatedCount < totalSlotsCount && (
          <button
            onClick={handleMarkRemainingAsGood}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>تعيين المتبقي ({totalSlotsCount - evaluatedCount}) كسليم 🟢</span>
          </button>
        )}
      </div>

      {/* Fixtures List */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-900">
            قائمة مرافق الجناح ({totalSlotsCount} خانات فحص):
          </h3>

          <div className="flex items-center gap-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2 py-0.5 rounded-lg ${
                filterStatus === 'all'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setFilterStatus('issues')}
              className={`px-2 py-0.5 rounded-lg ${
                filterStatus === 'issues'
                  ? 'bg-rose-100 text-rose-800 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الأعطال فقط
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wingTemplates.map((template) => {
            const slots = [];
            for (let idx = 1; idx <= template.count; idx++) {
              const targetFixtureId = `${currentBuilding.id}-W${selectedWing}-F${selectedFloor}-${activeCategory.code}-${template.typeCode}-${idx.toString().padStart(2, '0')}`;

              const existing = evaluations.find(
                (e) =>
                  e.id === targetFixtureId ||
                  (e.buildingId === currentBuilding.id &&
                   Number(e.wingId) === selectedWing &&
                   Number(e.floor) === selectedFloor &&
                   e.categoryCode === activeCategory.code &&
                   e.fixtureTypeCode === template.typeCode &&
                   Number(e.fixtureIndex) === idx)
              );

              if (
                filterStatus === 'issues' &&
                existing &&
                existing.status === 'operational'
              ) {
                continue;
              }

              slots.push(
                <FixtureCard
                  key={targetFixtureId}
                  buildingId={currentBuilding.id}
                  wingId={selectedWing}
                  floor={selectedFloor}
                  categoryCode={activeCategory.code}
                  template={template}
                  fixtureIndex={idx}
                  existingEvaluation={existing}
                  inspectorName={inspectorName}
                  onSave={handleSaveEvaluation}
                  isReadOnly={isReadOnly}
                  onOpenLogin={onOpenLogin}
                />
              );
            }
            return slots;
          })}
        </div>
      </div>
    </div>
  );
};
