// ============================================================================
// تفاصيل المبنى والمجسم ثلاثي الأبعاد (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React, { useState } from 'react';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { Building3DViewer } from '../3D/Building3DViewer';
import { WING_NAMES_AR } from '../../config/buildings';
import { summarizeWing, getScoreColor } from '../../utils/healthScore';
import { getBuildingStructure } from '../../utils/buildingStructureStore';
import { fetchFacilityMediaOnDemand } from '../../services/firestoreService';
import { TimelineViewer } from '../Timeline/TimelineViewer';
import { ImageViewerModal } from '../Common/ImageViewerModal';
import {
  ArrowRight,
  ClipboardEdit,
  FileDown,
  Camera,
  Layers,
  Lock,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Eye,
} from 'lucide-react';

interface BuildingDetailProps {
  building: BuildingInfo;
  evaluations: FixtureEvaluation[];
  onBack: () => void;
  onOpenAudit: (wingId?: number, floor?: number) => void;
  onOpenReport: () => void;
  isAuthenticated?: boolean;
  canViewSensitiveDetails?: boolean;
  canOpenReport?: boolean;
  canResolveTimeline?: boolean;
  isViewerOnly?: boolean;
  currentUserName?: string;
  onOpenLogin?: () => void;
}

export const BuildingDetail: React.FC<BuildingDetailProps> = ({
  building,
  evaluations,
  onBack,
  onOpenAudit,
  onOpenReport,
  isAuthenticated = false,
  canViewSensitiveDetails = false,
  canOpenReport = false,
  canResolveTimeline = false,
  isViewerOnly = false,
  currentUserName = 'إدارة الإسكان',
  onOpenLogin,
}) => {
  const [selectedWing, setSelectedWing] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [activePhotoModal, setActivePhotoModal] = useState<string | null>(null);
  const [loadedThumbs, setLoadedThumbs] = useState<Record<string, string>>({});
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);

  const structure = getBuildingStructure(building.id);
  const floorsCount = structure.floorsCount || building.floorsCount || 5;

  const handleSelectSector = (wingId: number, floor: number) => {
    setSelectedWing(wingId);
    setSelectedFloor(floor);
  };

  const photoEvaluations = canViewSensitiveDetails
    ? evaluations.filter(
        (e) =>
          e.hasPhoto ||
          (e.mediaCount && e.mediaCount > 0) ||
          e.photoBase64 ||
          (e.media && e.media.some((m) => m.type === 'image'))
      )
    : [];

  const handleOpenPhotoOnDemand = async (item: FixtureEvaluation) => {
    const existingThumb =
      loadedThumbs[item.id] ||
      item.photoBase64 ||
      item.media?.find((m) => m.type === 'image')?.url;
    if (existingThumb) {
      setActivePhotoModal(existingThumb);
      return;
    }

    setLoadingPhotoId(item.id);
    try {
      const vault = await fetchFacilityMediaOnDemand(item.id);
      const url =
        vault?.photoBase64 ||
        vault?.media?.find((m) => m.type === 'image')?.url ||
        vault?.closurePhotoBase64;
      if (url) {
        setLoadedThumbs((prev) => ({ ...prev, [item.id]: url }));
        setActivePhotoModal(url);
      }
    } finally {
      setLoadingPhotoId(null);
    }
  };

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
              4 أجنحة • {building.floorsCount} أدوار
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {canOpenReport && (
            <button
              onClick={onOpenReport}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm"
            >
              <FileDown className="w-4 h-4 text-blue-600" />
              <span>تقرير المبنى</span>
            </button>
          )}

          {isAuthenticated ? (
            <button
              onClick={() => onOpenAudit(selectedWing || 1, selectedFloor || 1)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm"
            >
              <ClipboardEdit className="w-4 h-4" />
              <span>تسجيل فحص ميداني</span>
            </button>
          ) : isViewerOnly ? (
            <span className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold rounded-xl">
              وضع متابعة المؤشرات (عرض فقط)
            </span>
          ) : (
            onOpenLogin && (
              <button
                onClick={onOpenLogin}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm"
              >
                <Lock className="w-4 h-4 text-blue-200" />
                <span>دخول رائد المبنى للتفتيش</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* 3D Visualizer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>مجسم المبنى (3D)</span>
          </h2>
          <span className="text-xs text-slate-500">
            انقر على أي جناح لمعاينته
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
          <span>الأجنحة:</span>
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

                {/* Comprehensive Wing Stats (Zero Emojis) */}
                <div className="space-y-1.5 text-xs pt-2 border-t border-slate-100 text-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>مرافق سليمة:</span>
                    </span>
                    <span className={`font-bold font-mono ${wing.operationalCount > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {wing.operationalCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>يحتاج صيانة:</span>
                    </span>
                    <span className={`font-bold font-mono ${wing.warningCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {wing.warningCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>مرافق عاطلة:</span>
                    </span>
                    <span className={`font-bold font-mono ${wing.criticalCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {wing.criticalCount}
                    </span>
                  </div>
                </div>

                {isAuthenticated && (
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
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Photo Evidence Gallery & Timeline — Restricted Strictly to Authorized Roles (Never Public!) */}
      {canViewSensitiveDetails ? (
        <>
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
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5 bg-slate-50/50">
                <Camera className="w-6 h-6 text-slate-300 stroke-[1.5]" />
                <span className="font-medium text-slate-500">لا توجد صور توثيقية مسجلة بعد</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {photoEvaluations.map((item) => {
                  const thumbUrl =
                    loadedThumbs[item.id] ||
                    item.photoBase64 ||
                    item.media?.find((m) => m.type === 'image')?.url ||
                    '';
                  const isLoadingThis = loadingPhotoId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenPhotoOnDemand(item)}
                      className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-xs hover:shadow-md transition"
                    >
                      <div className="relative w-full h-28 overflow-hidden bg-slate-100 flex flex-col items-center justify-center gap-1.5">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={item.id}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-slate-600 px-2 text-center">
                            <Eye className="w-5 h-5 text-blue-600" />
                            <span className="text-[10px] font-bold">
                              {isLoadingThis ? 'جاري التحميل...' : 'اضغط لتحميل ومعاينة الصورة'}
                            </span>
                          </div>
                        )}
                        <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-xs text-white p-1 rounded-lg pointer-events-none transition group-hover:bg-blue-600">
                          <Maximize2 className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="p-2 bg-white border-t border-slate-100 flex flex-col">
                        <span className="text-[10px] font-mono font-bold text-slate-900 truncate">
                          {item.id}
                        </span>
                        <span className="text-[9px] text-slate-500 truncate">
                          {item.defects.join('، ') || 'توثيق حالة'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inspection & Defect Timeline */}
          <TimelineViewer
            buildingId={building.id}
            canResolve={canResolveTimeline}
            currentUserName={currentUserName}
          />

          {/* Interactive Full-Screen Image Lightbox with Pinch-to-Zoom */}
          {activePhotoModal && (
            <ImageViewerModal
              src={activePhotoModal}
              title={`توثيق ${building.nameAr}`}
              onClose={() => setActivePhotoModal(null)}
            />
          )}
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center flex flex-col items-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            الصور الميدانية وسجل الفحص التفصيلي محمية ومخصصة للمسؤولين فقط
          </h3>
          <p className="text-xs text-slate-500 max-w-md">
            حفاظاً على الخصوصية وسرية بيانات المباني، لا تُعرض الصور التوثيقية أو تفاصيل الفاحصين وسجل الملاحظات للزوار العامين أو لغير مسؤولي هذا المبنى.
          </p>
        </div>
      )}
    </div>
  );
};
