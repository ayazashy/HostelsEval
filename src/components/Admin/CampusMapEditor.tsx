// ============================================================================
// 🗺️ محرر مواقع المباني على خريطة جوجل ثلاثية الأبعاد (Campus 3D Map Editor)
// يتيح للمشرف إدراج صورة الأقمار الصناعية (Google Maps) وضبط إحداثيات كل مبنى
// ============================================================================

import React, { useState, useRef } from 'react';
import { BUILDINGS_CONFIG } from '../../config/buildings';
import {
  getCampusMapConfig,
  saveCampusMapConfig,
} from '../../utils/buildingStructureStore';
import { CampusMapConfig } from '../../types/hostel';
import {
  Map,
  Upload,
  Image as ImageIcon,
  Save,
  RotateCcw,
  Check,
  Move,
  Trash2,
  Sliders,
  AlertCircle,
  Eye,
} from 'lucide-react';

export const CampusMapEditor: React.FC = () => {
  const [config, setConfig] = useState<CampusMapConfig>(() => getCampusMapConfig());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('B14');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedBuildingPos = config.buildingPositions[selectedBuildingId] || { x: 0, z: 0 };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target?.result as string;
      setConfig({
        ...config,
        groundImageUrl: base64,
      });
      setSaveSuccess(false);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    if (confirm('هل أنت متأكد من إزالة صورة المخطط؟')) {
      setConfig({
        ...config,
        groundImageUrl: undefined,
      });
      setSaveSuccess(false);
    }
  };

  const handlePositionChange = (axis: 'x' | 'z', value: number) => {
    setConfig({
      ...config,
      buildingPositions: {
        ...config.buildingPositions,
        [selectedBuildingId]: {
          ...selectedBuildingPos,
          [axis]: value,
        },
      },
    });
    setSaveSuccess(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click (0..rect.width, 0..rect.height) to 3D coords (-90 to +90)
    const normalizedX = (clickX / rect.width) * 180 - 90;
    const normalizedZ = (clickY / rect.height) * 180 - 90;

    const roundedX = Math.round(normalizedX * 10) / 10;
    const roundedZ = Math.round(normalizedZ * 10) / 10;

    setConfig({
      ...config,
      buildingPositions: {
        ...config.buildingPositions,
        [selectedBuildingId]: {
          x: roundedX,
          z: roundedZ,
        },
      },
    });
    setSaveSuccess(false);
  };

  const handleResetToGrid = () => {
    if (confirm('هل تريد إعادة تعيين مواقع جميع المباني الـ 34 إلى التوزيع الشبكي الافتراضي؟')) {
      const defaultPositions: Record<string, { x: number; z: number }> = {};
      const cols = 6;
      const spacingX = 17;
      const spacingZ = 17;
      const offsetX = ((cols - 1) * spacingX) / 2;
      const rows = Math.ceil(BUILDINGS_CONFIG.length / cols);
      const offsetZ = ((rows - 1) * spacingZ) / 2;

      BUILDINGS_CONFIG.forEach((b, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        defaultPositions[b.id] = {
          x: col * spacingX - offsetX,
          z: row * spacingZ - offsetZ,
        };
      });

      setConfig({
        ...config,
        buildingPositions: defaultPositions,
      });
      setSaveSuccess(false);
    }
  };

  const handleSave = () => {
    saveCampusMapConfig(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              تحديد مواقع المباني وخريطة الحرم (Google Maps / 3D Layout)
            </h3>
            <p className="text-xs text-slate-500">
              إدراج صورة المخطط أو الأقمار الصناعية وضبط الإحداثيات الحقيقية لكل مبنى في الحرم الجامعي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-4 h-4" />
              تم حفظ المخطط بنجاح
            </span>
          )}

          <button
            onClick={handleResetToGrid}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="توزيع شبكي تلقائي"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>توزيع شبكي</span>
          </button>

          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>حفظ المخطط المعماري</span>
          </button>
        </div>
      </div>

      {/* Image Upload Row */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
            {config.groundImageUrl ? (
              <img
                src={config.groundImageUrl}
                alt="خريطة الحرم"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">
              صورة أرضية الحرم الجامعي (Google Maps / صورة جوية)
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {config.groundImageUrl
                ? 'تم رفع صورة خلفية مخصصة للأرضية في المجسم ثلاثي الأبعاد'
                : 'لم يتم تعيين صورة خلفية (يتم استخدام شبكة تخطيطية رمادية افتراضية)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-white border border-slate-300 hover:border-blue-400 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>{config.groundImageUrl ? 'تغيير الصورة' : 'رفع صورة من الجهاز'}</span>
          </button>

          {config.groundImageUrl && (
            <button
              onClick={handleClearImage}
              className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition"
              title="إزالة صورة الخلفية"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Map Canvas & Coordinate Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive 2D Map Canvas (2 Columns) */}
        <div className="lg:col-span-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Move className="w-4 h-4 text-blue-600" />
              <span>مخطط الحرم التفاعلي (انقر على الخريطة لتحديد موقع المبنى المحدد):</span>
            </span>
            <span className="text-[11px] text-slate-500">
              المبنى النشط: <strong className="text-blue-700">{selectedBuildingId}</strong>
            </span>
          </div>

          <div
            onClick={handleCanvasClick}
            className="relative w-full h-[450px] bg-slate-200 rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner cursor-crosshair group select-none"
            style={{
              backgroundImage: config.groundImageUrl ? `url(${config.groundImageUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Grid overlay lines */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000010_1px,transparent_1px),linear-gradient(to_bottom,#00000010_1px,transparent_1px)] bg-[size:30px_30px]" />

            {/* Center Origin Mark */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-dashed border-slate-400 rounded-full pointer-events-none opacity-40" />

            {/* Render 34 Building Pins */}
            {BUILDINGS_CONFIG.map((b) => {
              const pos = config.buildingPositions[b.id] || { x: 0, z: 0 };
              const isSelected = b.id === selectedBuildingId;

              // Convert (-90..90) to (0%..100%)
              const leftPercent = ((pos.x + 90) / 180) * 100;
              const topPercent = ((pos.z + 90) / 180) * 100;

              return (
                <div
                  key={b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBuildingId(b.id);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-100 cursor-pointer ${
                    isSelected ? 'z-30 scale-125' : 'z-10 hover:scale-110'
                  }`}
                  style={{
                    left: `${Math.max(2, Math.min(98, leftPercent))}%`,
                    top: `${Math.max(2, Math.min(98, topPercent))}%`,
                  }}
                  title={`${b.nameAr} (${b.id})`}
                >
                  <div
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono shadow-md border flex items-center gap-1 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-400 text-white ring-2 ring-blue-300 animate-pulse'
                        : 'bg-white border-slate-300 text-slate-800 hover:border-blue-400'
                    }`}
                  >
                    <span>{b.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Building Coordinates Control Panel */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-4">
            <div className="border-b border-slate-200 pb-3">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                المبنى المطلوب تحريكه:
              </label>
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3 py-2 cursor-pointer shadow-sm focus:outline-none focus:border-blue-500"
              >
                {BUILDINGS_CONFIG.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr} ({b.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Slider Controls for X and Z */}
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-slate-700">المحور الأفقي (X):</span>
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {selectedBuildingPos.x}
                  </span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="0.5"
                  value={selectedBuildingPos.x}
                  onChange={(e) => handlePositionChange('x', parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-slate-700">المحور الرأسي (Z):</span>
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {selectedBuildingPos.z}
                  </span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="0.5"
                  value={selectedBuildingPos.z}
                  onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Quick Adjustment Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => handlePositionChange('x', selectedBuildingPos.x - 2)}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                ← تحريك يسار
              </button>
              <button
                onClick={() => handlePositionChange('x', selectedBuildingPos.x + 2)}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                تحريك يمين →
              </button>
              <button
                onClick={() => handlePositionChange('z', selectedBuildingPos.z - 2)}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                ↑ تحريك للأعلى
              </button>
              <button
                onClick={() => handlePositionChange('z', selectedBuildingPos.z + 2)}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                تحريك للأسفل ↓
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              يمكنك النقر مباشرة على أي موقع داخل المخطط لنقل المبنى {selectedBuildingId} فوراً إلى النقطة المنقورة.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
