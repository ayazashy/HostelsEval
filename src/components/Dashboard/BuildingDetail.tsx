// ============================================================================
// 🏢 تفاصيل المبنى والمجسم ثلاثي الأبعاد (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React, { useState } from 'react';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { Building3DViewer } from '../3D/Building3DViewer';
import { WING_NAMES_AR } from '../../config/buildings';
import { summarizeWing, getScoreColor } from '../../utils/healthScore';
import { getBuildingStructure } from '../../utils/buildingStructureStore';
import { TimelineViewer } from '../Timeline/TimelineViewer';
import {
  ArrowRight,
  ClipboardEdit,
  FileDown,
  Camera,
  Layers,
  Lock,
  Clock,
} from 'lucide-react';

interface BuildingDetailProps {
  building: BuildingInfo;
  evaluations: FixtureEvaluation[];
  onBack: () => void;
  onOpenAudit: (wingId?: number, floor?: number) => void;
  onOpenReport: () => void;
  isAuthenticated?: boolean;
  onOpenLogin?: () => void;
}

export const BuildingDetail: React.FC<BuildingDetailProps> = ({
  building,
  evaluations,
  onBack,
  onOpenAudit,
  onOpenReport,
  isAuthenticated = false,
  onOpenLogin,
}) => {
  const [selectedWing, setSelectedWing] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [activePhotoModal, setActivePhotoModal] = useState<string | null>(null);

  const structure = getBuildingStructure(building.id);
  const floorsCount = structure.floorsCount || building.floorsCount || 5;

  const handleSelectSector = (wingId: number, floor: number) => {
    setSelectedWing(wingId);
    setSelectedFloor(floor);
  };

  const photoEvaluations = evaluations.filter((e) => e.photoBase64);

  const wingsSummary = [1, 2, 3, 4].map((wId) => {
    const wEvals = evaluations.filter((e) => e.wingId === wId);
    return summarizeWing(wId, WING_NAMES_AR[wId], wEvals);
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            title="العودة لجميع المباني"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{building.nameAr}</h1>
              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-lg">
                {building.id}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              مجمع سكني مكون من 4 أجنحة متصلة بمركز وسطي • {building.floorsCount} أدوار
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            onClick={onOpenReport}
            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm"
          >
            <FileDown className="w-4 h-4 text-blue-600" />
            <span>تقرير المبنى</span>
          </button>

          <button
            onClick={() => {
              if (isAuthenticated) {
                onOpenAudit(selectedWing || 1, selectedFloor || 1);
              } else {
                onOpenLogin?.();
              }
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm"
          >
            {isAuthenticated ? (
              <ClipboardEdit className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4 text-blue-200" />
            )}
            <span>{isAuthenticated ? 'تسجيل فحص ميداني' : 'دخول رائد المبنى للتفتيش'}</span>
          </button>
        </div>
      </div>

      {/* 3D Visualizer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>المجسم المعماري للأجنحة الـ 4:</span>
          </h2>
          <span className="text-xs text-slate-500">
            اضغط على أي جناح داخل المجسم لتفقد حالته
          </span>
        </div>

        <Building3DViewer
          buildingId={building.id}
          floorsCount={floorsCount}
          evaluations={evaluations}
          selectedWing={selectedWing}
          selectedFloor={selectedFloor}
          onSelectSector={handleSelectSector}
        />
      </div>

      {/* Wings Analytical Breakdown */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-600" />
          <span>حالة أجنحة المبنى:</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {wingsSummary.map((wing) => {
            const wColor = getScoreColor(wing.healthScore);
            const isHighlighted = selectedWing === wing.wingId;

            return (
              <div
                key={wing.wingId}
                onClick={() => setSelectedWing(wing.wingId)}
                className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-3 shadow-sm ${
                  isHighlighted
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      جناح {wing.wingId}
                    </h4>
                  </div>
                  <div
                    className="w-14 h-10 px-2 rounded-xl flex items-center justify-center font-bold text-xs border"
                    style={{
                      backgroundColor: `${wColor.hex}15`,
                      borderColor: `${wColor.hex}40`,
                      color: wColor.hex,
                    }}
                  >
                    {wing.healthScore !== null ? `%${wing.healthScore}` : 'غير مفحوص'}
                  </div>
                </div>

                {/* Fixture Stats */}
                <div className="space-y-1.5 text-xs pt-2 border-t border-slate-100 text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">💧 تسريب مياه:</span>
                    <span className={`font-bold ${wing.activeLeaks > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {wing.activeLeaks}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">🚽 مراحيض عاطلة:</span>
                    <span className={`font-bold ${wing.brokenToilets > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {wing.brokenToilets}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">🚿 مراوش متضررة:</span>
                    <span className={`font-bold ${wing.brokenShowers > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {wing.brokenShowers}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAudit(wing.wingId, 1);
                  }}
                  className="w-full py-1.5 bg-slate-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                >
                  <span>استمارة فحص الجناح</span>
                  <span>←</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photo Evidence Gallery */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900">
              الصور التوثيقية لهذا المبنى ({photoEvaluations.length} صورة)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            مختومة بالرقم الفريد والتاريخ
          </span>
        </div>

        {photoEvaluations.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-500 text-xs flex flex-col items-center gap-2">
            <span>لم يتم تسجيل صور توثيقية لهذا المبنى بعد.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {photoEvaluations.map((item) => (
              <div
                key={item.id}
                onClick={() => setActivePhotoModal(item.photoBase64 || null)}
                className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-sm"
              >
                <img
                  src={item.photoBase64}
                  alt={item.id}
                  className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="p-2 bg-white border-t border-slate-100 flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-slate-900 truncate">
                    {item.id}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {item.defects.join('، ') || 'توثيق حالة'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inspection & Defect Timeline */}
      <TimelineViewer
        buildingId={building.id}
        canResolve={isAuthenticated}
        currentUserName="إدارة الإسكان"
      />

      {/* Full Photo Modal */}
      {activePhotoModal && (
        <div
          onClick={() => setActivePhotoModal(null)}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-2xl"
          >
            <img
              src={activePhotoModal}
              alt="صورة مكبرة"
              className="w-full max-h-[75vh] object-contain bg-slate-50"
            />
            <div className="p-3 flex justify-between items-center bg-slate-100 border-t border-slate-200">
              <span className="text-xs text-slate-600">
                صورة توثيقية رسمية بختم التدقيق المعتمد
              </span>
              <button
                onClick={() => setActivePhotoModal(null)}
                className="px-4 py-1.5 bg-slate-200 text-slate-800 text-xs font-bold rounded-lg hover:bg-slate-300"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
