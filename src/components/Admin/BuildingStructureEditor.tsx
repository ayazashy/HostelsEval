// ============================================================================
// 🏙️ محرر هيكلية المباني والأدوار والأبراج (Building Structure & Towers Editor)
// يتيح للمشرف تعديل عدد الأدوار وعدد الأبراج المفعلة في كل دور لكل مبنى
// ============================================================================

import React, { useState } from 'react';
import { BUILDINGS_CONFIG } from '../../config/buildings';
import {
  getBuildingStructure,
  saveBuildingStructure,
  resetBuildingStructure,
} from '../../utils/buildingStructureStore';
import { BuildingStructure } from '../../types/hostel';
import {
  Building2,
  Save,
  RotateCcw,
  Check,
  Layers,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';

export const BuildingStructureEditor: React.FC = () => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('B14');
  const [structure, setStructure] = useState<BuildingStructure>(() =>
    getBuildingStructure('B14')
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSelectBuilding = (bId: string) => {
    setSelectedBuildingId(bId);
    setStructure(getBuildingStructure(bId));
    setSaveSuccess(false);
  };

  const handleFloorsCountChange = (newCount: number) => {
    const updatedTowers = { ...structure.floorTowers };
    for (let f = 1; f <= newCount; f++) {
      if (!updatedTowers[f] || updatedTowers[f].length === 0) {
        // Default: Floor 5 has [1, 2], other floors have [1, 2, 3, 4]
        updatedTowers[f] = f === 5 ? [1, 2] : [1, 2, 3, 4];
      }
    }
    setStructure({
      ...structure,
      floorsCount: newCount,
      floorTowers: updatedTowers,
    });
    setSaveSuccess(false);
  };

  const handleToggleTower = (floorNum: number, towerId: number) => {
    const currentTowers = structure.floorTowers[floorNum] || [1, 2, 3, 4];
    let nextTowers: number[];

    if (currentTowers.includes(towerId)) {
      if (currentTowers.length === 1) {
        alert('يجب أن يحتوي كل دور على برج واحد نشط على الأقل');
        return;
      }
      nextTowers = currentTowers.filter((id) => id !== towerId);
    } else {
      nextTowers = [...currentTowers, towerId].sort();
    }

    setStructure({
      ...structure,
      floorTowers: {
        ...structure.floorTowers,
        [floorNum]: nextTowers,
      },
    });
    setSaveSuccess(false);
  };

  const handleSave = () => {
    saveBuildingStructure(selectedBuildingId, structure);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleReset = () => {
    if (confirm(`هل أنت متأكد من إعادة تعيين هيكلية المبنى ${selectedBuildingId} إلى الإعدادات القياسية؟`)) {
      const def = resetBuildingStructure(selectedBuildingId);
      setStructure(def);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const currentBuilding = BUILDINGS_CONFIG.find((b) => b.id === selectedBuildingId);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              تخصيص هيكل المباني (الأدوار والأبراج النشطة)
            </h3>
            <p className="text-xs text-slate-500">
              تحديد عدد الأدوار والأبراج في كل دور لكل مبنى (مثل حصر الدور الخامس على برجين فقط)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-4 h-4" />
              تم حفظ الهيكل المعماري
            </span>
          )}

          <button
            onClick={handleReset}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="استعادة الإعدادات الافتراضية للمبنى"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>حفظ التعديلات</span>
          </button>
        </div>
      </div>

      {/* Building Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-700">المبنى المراد تعديل هيكلته:</label>
          <select
            value={selectedBuildingId}
            onChange={(e) => handleSelectBuilding(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-xs rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm"
          >
            {BUILDINGS_CONFIG.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr} ({b.id})
              </option>
            ))}
          </select>
        </div>

        {/* Floors Count Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">إجمالي عدد الأدوار:</span>
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            {[3, 4, 5, 6].map((num) => (
              <button
                key={num}
                onClick={() => handleFloorsCountChange(num)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  structure.floorsCount === num
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {num} أدوار
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floor & Towers Matrix */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>الأبراج والأجنحة المتاحة في كل دور بالمبنى {selectedBuildingId}:</span>
          </span>
          <span className="text-xs text-slate-500">
            اضغط على أي برج لتفعيله أو إلغائه في الدور المقابل
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: structure.floorsCount }, (_, i) => i + 1).map((floorNum) => {
            const activeTowers = structure.floorTowers[floorNum] || [1, 2, 3, 4];
            const isFloor5 = floorNum === 5;

            return (
              <div
                key={floorNum}
                className={`p-4 rounded-2xl border transition shadow-sm flex flex-col gap-3 ${
                  isFloor5
                    ? 'bg-amber-50/40 border-amber-300'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      الدور {floorNum}
                    </span>
                    {isFloor5 && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                        دور جزئي
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {activeTowers.length} أبراج نشطة
                  </span>
                </div>

                {/* 4 Towers Selector */}
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((towerId) => {
                    const isActive = activeTowers.includes(towerId);

                    return (
                      <button
                        key={towerId}
                        onClick={() => handleToggleTower(floorNum, towerId)}
                        className={`p-2.5 rounded-xl border text-right transition flex items-center justify-between ${
                          isActive
                            ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <span className="text-xs">برج {towerId}</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200">
                          W{towerId}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Helpful Hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-blue-900 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">ملاحظة هندسية:</p>
          <p className="text-blue-800 mt-0.5">
            أي تعديل في عدد الأدوار أو الأبراج ينعكس فورياً في استمارة الفحص الميداني لرواد المباني والمجسمات ثلاثية الأبعاد 3D للمبنى والحرم كاملاً.
          </p>
        </div>
      </div>
    </div>
  );
};
