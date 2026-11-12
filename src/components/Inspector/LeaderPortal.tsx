// ============================================================================
// 📱 بوابة رائد المبنى والفحص الميداني السريع (Mobile-First Leader Portal)
// تدعم: بوابة التقييم الإلزامي بعد إغلاق الصيانة، الإضافة السريعة للمرافق، والسجل الزمني
// ============================================================================

import React, { useState } from 'react';
import {
  FixtureEvaluation,
  BuildingInfo,
} from '../../types/hostel';
import {
  BATHROOM_CATEGORY_CONFIG,
  loadActiveFacilityCategories,
  addNewFacilityItem,
  addNewFacilityCategory,
} from '../../config/facilityTemplates';
import { FixtureCard } from './FixtureCard';
import { EvaluationGateModal } from './EvaluationGateModal';
import { calculateWingHealth, getScoreColor } from '../../utils/healthScore';
import { saveEvaluation } from '../../services/firestoreService';
import { getBuildingStructure } from '../../utils/buildingStructureStore';
import { TimelineViewer } from '../Timeline/TimelineViewer';
import {
  ShieldCheck,
  CheckCheck,
  Filter,
  Layers,
  Lock,
  Clock,
  ClipboardList,
  Plus,
  ShieldAlert,
  Star,
  X,
  Check,
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

  const [portalTab, setPortalTab] = useState<'form' | 'timeline'>('form');
  const [selectedFloor, setSelectedFloor] = useState<number>(1);
  const [selectedWing, setSelectedWing] = useState<number>(1);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('BTH');
  const [filterStatus, setFilterStatus] = useState<'all' | 'issues'>('all');
  const [categories, setCategories] = useState(() => loadActiveFacilityCategories());
  const [cloudStatus, setCloudStatus] = useState<{ synced: boolean; warning?: string } | null>(null);

  // Quick Add Facility Modal State
  const [showQuickAddModal, setShowQuickAddModal] = useState<boolean>(false);
  const [quickAddMode, setQuickAddMode] = useState<'item' | 'category'>('item');
  const [newItemNameAr, setNewItemNameAr] = useState<string>('');
  const [newItemCount, setNewItemCount] = useState<number>(1);
  const [applyToAllWings, setApplyToAllWings] = useState<boolean>(true);
  const [newCatNameAr, setNewCatNameAr] = useState<string>('');

  // Mandatory Evaluation Gate Modal State
  const [showGateModal, setShowGateModal] = useState<boolean>(true);

  const [structureVersion, setStructureVersion] = useState<number>(0);

  React.useEffect(() => {
    const handleStructUpdate = () => {
      setStructureVersion((v) => v + 1);
    };
    window.addEventListener('hostels_structure_updated', handleStructUpdate);
    window.addEventListener('storage', (e) => {
      if (e.key === 'hostels_structure_version' || e.key === 'hostels_building_structures') {
        handleStructUpdate();
      }
    });

    return () => {
      window.removeEventListener('hostels_structure_updated', handleStructUpdate);
      window.removeEventListener('storage', handleStructUpdate);
    };
  }, []);

  const structure = React.useMemo(() => {
    return getBuildingStructure(currentBuilding.id);
  }, [currentBuilding.id, structureVersion]);

  const floorsCount = structure.floorsCount || currentBuilding.floorsCount || 5;
  const activeTowers = structure.floorTowers[selectedFloor] || [1, 2, 3, 4];

  React.useEffect(() => {
    if (selectedFloor > floorsCount) {
      setSelectedFloor(1);
    }
  }, [floorsCount, selectedFloor]);

  React.useEffect(() => {
    if (activeTowers.length > 0 && !activeTowers.includes(selectedWing)) {
      setSelectedWing(activeTowers[0]);
    }
  }, [activeTowers, selectedWing]);

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
          warning: 'حفظ محلي',
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

  // Pending Evaluation Tickets for this Building (Mandatory Gate)
  const pendingEvaluationTickets = React.useMemo(() => {
    return evaluations.filter(
      (e) =>
        e.buildingId === currentBuilding.id &&
        !e.isDeleted &&
        e.maintenanceTicket?.status === 'pending_evaluation'
    );
  }, [evaluations, currentBuilding.id]);

  const isLockedByGate = !isReadOnly && pendingEvaluationTickets.length > 0;

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
      Number(e.wingId) === selectedWing &&
      Number(e.floor) === selectedFloor &&
      e.categoryCode === activeCategory.code
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
    if (isLockedByGate) {
      setShowGateModal(true);
      return;
    }

    const promises: Promise<any>[] = [];

    wingTemplates.forEach((tmpl) => {
      for (let idx = 1; idx <= tmpl.count; idx++) {
        const exists = currentSectorEvals.some(
          (e) => e.fixtureTypeCode === tmpl.typeCode && Number(e.fixtureIndex) === idx
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

  // Super Simple Quick Add Handler (Auto-generates code so user only types Arabic name)
  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickAddMode === 'item') {
      if (!newItemNameAr.trim()) return;
      const autoCode = `FX${Date.now().toString(36).slice(-3).toUpperCase()}`;
      const updated = addNewFacilityItem({
        categoryCode: activeCategory.code,
        nameAr: newItemNameAr.trim(),
        typeCode: autoCode,
        count: Math.max(1, Math.min(20, Number(newItemCount) || 1)),
        wings: applyToAllWings ? [1, 2, 3, 4] : [selectedWing],
      });
      setCategories([...updated]);
      setNewItemNameAr('');
      setNewItemCount(1);
      setShowQuickAddModal(false);
    } else {
      if (!newCatNameAr.trim()) return;
      const autoCatCode = `C${Date.now().toString(36).slice(-3).toUpperCase()}`;
      const updated = addNewFacilityCategory({
        code: autoCatCode,
        nameAr: newCatNameAr.trim(),
        descriptionAr: newCatNameAr.trim(),
      });
      setCategories([...updated]);
      setSelectedCategoryCode(autoCatCode);
      setNewCatNameAr('');
      setShowQuickAddModal(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto pb-20 sm:pb-8">
      {/* 1. Mandatory Evaluation Gate Alert Banner (منع الإغلاق الصوري) */}
      {pendingEvaluationTickets.length > 0 && (
        <div className="bg-purple-700 text-white rounded-2xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <span>مطلوب تقييم الخدمة لإغلاق البلاغات ({pendingEvaluationTickets.length} بلاغ)</span>
              </h3>
              <p className="text-xs text-purple-100 mt-0.5 leading-relaxed">
                قام فريق الصيانة بإغلاق {pendingEvaluationTickets.length} بلاغ في {currentBuilding.nameAr}. يلزم تقييم الخدمة والتأكد من الإصلاح الفعلي قبل فتح أو تعديل أي بلاغات جديدة.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGateModal(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black transition shrink-0 flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Star className="w-4 h-4 fill-slate-950" />
            <span>تقييم البلاغات المغلقة الآن</span>
          </button>
        </div>
      )}

      {/* 2. Compact Top Building & Inspector Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-mono font-black text-sm flex items-center justify-center shrink-0">
            {currentBuilding.id}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-slate-900">
                {currentBuilding.nameAr}
              </span>
              {cloudStatus?.synced && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  متصل سحابياً 🟢
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{inspectorName}</span>
            </div>
          </div>
        </div>

        {/* Building Selector + Mode Switcher */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <select
            value={activeBuildingId}
            onChange={(e) => onChangeBuilding(e.target.value)}
            className="bg-slate-100 border border-slate-300 text-slate-900 text-xs rounded-xl px-3 py-2 font-bold cursor-pointer"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr} ({b.id})
              </option>
            ))}
          </select>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setPortalTab('form')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                portalTab === 'form'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>المرافق</span>
            </button>
            <button
              type="button"
              onClick={() => setPortalTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                portalTab === 'timeline'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>السجل الزمني</span>
            </button>
          </div>
        </div>
      </div>

      {/* Read-Only Public Visitor Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-bold">وضع المعاينة فقط — سجل الدخول كرائد مبنى لإضافة البلاغات.</span>
          </div>
          <button
            onClick={onOpenLogin}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0"
          >
            دخول
          </button>
        </div>
      )}

      {portalTab === 'timeline' ? (
        <TimelineViewer
          buildingId={currentBuilding.id}
          canResolve={!isReadOnly}
          currentUserName={inspectorName}
          onRefresh={onRefreshEvaluations}
        />
      ) : (
        <>
          {/* 3. Sticky Mobile-First Navigation: Floor -> Wing -> Category */}
          <div className="sticky top-14 z-30 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col gap-2.5">
            {/* Floor Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-slate-500 shrink-0 ml-1">الدور:</span>
              {Array.from({ length: floorsCount }, (_, i) => i + 1).map((floorNum) => (
                <button
                  key={floorNum}
                  type="button"
                  onClick={() => setSelectedFloor(floorNum)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition shrink-0 ${
                    selectedFloor === floorNum
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  دور {floorNum}
                </button>
              ))}
            </div>

            {/* Wing Pills */}
            <div className="grid grid-cols-4 gap-1.5">
              {activeTowers.map((wId) => {
                const isSelected = selectedWing === wId;
                return (
                  <button
                    key={wId}
                    type="button"
                    onClick={() => setSelectedWing(wId)}
                    className={`py-2 px-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-bold">جناح {wId}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Tabs + Easy "+ إضافة مرفق" Button */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.code}
                    type="button"
                    onClick={() => setSelectedCategoryCode(cat.code)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-bold transition shrink-0 ${
                      selectedCategoryCode === cat.code
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.nameAr}
                  </button>
                ))}
              </div>

              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    if (isLockedByGate) {
                      setShowGateModal(true);
                      return;
                    }
                    setQuickAddMode('item');
                    setShowQuickAddModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1 shrink-0 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>إضافة مرفق</span>
                </button>
              )}
            </div>
          </div>

          {/* 4. Sector Progress & 1-Tap "Mark Remaining Operational" */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border shrink-0"
                style={{
                  backgroundColor: `${sectorColor.hex}15`,
                  borderColor: `${sectorColor.hex}40`,
                  color: sectorColor.hex,
                }}
              >
                {sectorHealth !== null ? `%${sectorHealth}` : '—'}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  {activeCategory.nameAr} • الدور {selectedFloor} • جناح {selectedWing}
                </span>
                <span className="text-[11px] text-slate-500">
                  تم فحص <strong>{evaluatedCount}</strong> من <strong>{totalSlotsCount}</strong> مرفق
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isReadOnly && evaluatedCount < totalSlotsCount && (
                <button
                  type="button"
                  onClick={handleMarkRemainingAsGood}
                  className="flex-1 sm:flex-initial px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>تعيين المتبقي ({totalSlotsCount - evaluatedCount}) كسليم</span>
                </button>
              )}

              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold ${
                    filterStatus === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('issues')}
                  className={`px-2.5 py-1 rounded-lg font-bold ${
                    filterStatus === 'issues' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  الأعطال
                </button>
              </div>
            </div>
          </div>

          {/* 5. Compact Mobile-Friendly Fixtures List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  (!existing || existing.status === 'operational')
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
                    isLockedByEvaluationGate={isLockedByGate}
                    onOpenGateModal={() => setShowGateModal(true)}
                    onOpenLogin={onOpenLogin}
                  />
                );
              }
              return slots;
            })}
          </div>

          {/* Bottom Quick-Add Card for easy discovery on phones */}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => {
                if (isLockedByGate) {
                  setShowGateModal(true);
                  return;
                }
                setQuickAddMode('item');
                setShowQuickAddModal(true);
              }}
              className="w-full py-3.5 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl bg-white hover:bg-blue-50/40 text-slate-700 hover:text-blue-700 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>إضافة مرفق أو تجهيز جديد لهذا القسم ({activeCategory.nameAr})</span>
            </button>
          )}
        </>
      )}

      {/* Quick Add Facility / Category Modal */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>إضافة سريعة للمرافق</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setQuickAddMode('item')}
                className={`py-2 rounded-lg transition ${
                  quickAddMode === 'item' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                مرفق داخل "{activeCategory.nameAr}"
              </button>
              <button
                type="button"
                onClick={() => setQuickAddMode('category')}
                className={`py-2 rounded-lg transition ${
                  quickAddMode === 'category' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                قسم مرافق جديد
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="flex flex-col gap-3.5 text-xs">
              {quickAddMode === 'item' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700">اسم المرفق الجديد:</label>
                    <input
                      type="text"
                      value={newItemNameAr}
                      onChange={(e) => setNewItemNameAr(e.target.value)}
                      placeholder="مثال: براد مياه، مرآة، باب، إنارة سقف..."
                      required
                      autoFocus
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700">العدد في كل جناح:</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={newItemCount}
                      onChange={(e) => setNewItemCount(Number(e.target.value) || 1)}
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-bold"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      checked={applyToAllWings}
                      onChange={(e) => setApplyToAllWings(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="font-bold text-slate-700">
                      إضافة لجميع الأجنحة (1 إلى 4)
                    </span>
                  </label>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">اسم قسم المرافق الجديد:</label>
                  <input
                    type="text"
                    value={newCatNameAr}
                    onChange={(e) => setNewCatNameAr(e.target.value)}
                    placeholder="مثال: الممرات والإنارة، التكييف، المصاعد..."
                    required
                    autoFocus
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>إضافة فوراً للاستمارة</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory Evaluation Gate Modal */}
      {showGateModal && isLockedByGate && (
        <EvaluationGateModal
          buildingId={currentBuilding.id}
          pendingTickets={pendingEvaluationTickets}
          leaderName={inspectorName}
          onEvaluated={() => {
            onRefreshEvaluations();
          }}
          onClose={() => setShowGateModal(false)}
        />
      )}
    </div>
  );
};
