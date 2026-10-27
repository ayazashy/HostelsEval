// ============================================================================
// 🗺️ محرر مواقع المباني على خريطة جوجل ثلاثية الأبعاد (Campus 3D Map Editor)
// يتيح للمشرف إدراج صورة الأقمار الصناعية (Google Maps) وضبط إحداثيات كل مبنى
// مع معاينة ثلاثية الأبعاد 3D حية وفورية متزامنة في كافة التبويبات والشاشات
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { BUILDINGS_CONFIG } from '../../config/buildings';
import {
  getCampusMapConfig,
  saveCampusMapConfig,
  optimizeGroundImage,
} from '../../utils/buildingStructureStore';
import { CampusMapConfig } from '../../types/hostel';
import { Campus3DViewer } from '../3D/Campus3DViewer';
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
  Box,
  Layers,
  Sparkles,
  Loader2,
} from 'lucide-react';

export const CampusMapEditor: React.FC = () => {
  const [config, setConfig] = useState<CampusMapConfig>(() => getCampusMapConfig());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('B14');
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDraggingPin, setIsDraggingPin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state if IndexedDB loads or another tab updates
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e?.detail) {
        setConfig(e.detail);
      } else {
        setConfig(getCampusMapConfig());
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('hostels_campus_map_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'CAMPUS_MAP_UPDATED' && event.data.config) {
            setConfig(event.data.config);
          }
        };
      }
    } catch {}

    window.addEventListener('hostels_campus_map_updated', handleUpdate);
    return () => {
      bc?.close();
      window.removeEventListener('hostels_campus_map_updated', handleUpdate);
    };
  }, []);

  const selectedBuildingPos = config.buildingPositions[selectedBuildingId] || { x: 0, z: 0 };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOptimizing(true);
    try {
      // Optimize image safely without crossOrigin issues
      const optimizedBase64 = await optimizeGroundImage(file);
      const updatedConfig: CampusMapConfig = {
        ...config,
        groundImageUrl: optimizedBase64,
      };
      setConfig(updatedConfig);
      // Immediately save to IndexedDB, LocalStorage, and broadcast to all open tabs
      saveCampusMapConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('[CampusMapEditor] Failed to optimize image:', err);
      alert('حدث خطأ أثناء معالجة الصورة، يرجى اختيار ملف صورة صالح.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleClearImage = () => {
    if (confirm('هل أنت متأكد من إزالة صورة المخطط؟')) {
      const updatedConfig: CampusMapConfig = {
        ...config,
        groundImageUrl: undefined,
      };
      setConfig(updatedConfig);
      saveCampusMapConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handlePositionChange = (axis: 'x' | 'z', value: number) => {
    const rounded = Math.round(value * 10) / 10;
    setConfig((prev) => ({
      ...prev,
      buildingPositions: {
        ...prev.buildingPositions,
        [selectedBuildingId]: {
          ...selectedBuildingPos,
          [axis]: rounded,
        },
      },
    }));
    setSaveSuccess(false);
  };

  // Convert click or drag coordinates on 2D canvas to 3D units (-85 to +85)
  const updateBuildingFrom2DEvent = (clientX: number, clientY: number, containerRect: DOMRect, buildingId: string) => {
    const clickX = clientX - containerRect.left;
    const clickY = clientY - containerRect.top;

    // Convert (0..width, 0..height) to (-85..+85)
    const normalizedX = (clickX / containerRect.width) * 170 - 85;
    const normalizedZ = (clickY / containerRect.height) * 170 - 85;

    const roundedX = Math.round(Math.max(-85, Math.min(85, normalizedX)) * 10) / 10;
    const roundedZ = Math.round(Math.max(-85, Math.min(85, normalizedZ)) * 10) / 10;

    setConfig((prev) => ({
      ...prev,
      buildingPositions: {
        ...prev.buildingPositions,
        [buildingId]: {
          x: roundedX,
          z: roundedZ,
        },
      },
    }));
    setSaveSuccess(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingPin) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updateBuildingFrom2DEvent(e.clientX, e.clientY, rect, selectedBuildingId);
  };

  const handlePointerDownPin = (bId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedBuildingId(bId);
    setIsDraggingPin(true);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMoveCanvas = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPin) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updateBuildingFrom2DEvent(e.clientX, e.clientY, rect, selectedBuildingId);
  };

  const handlePointerUpCanvas = () => {
    if (isDraggingPin) {
      setIsDraggingPin(false);
    }
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

      const updatedConfig: CampusMapConfig = {
        ...config,
        buildingPositions: defaultPositions,
      };
      setConfig(updatedConfig);
      saveCampusMapConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleSave = () => {
    saveCampusMapConfig(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-6">
      {/* Top Header & Save Actions */}
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
              إدراج صورة المخطط أو الأقمار الصناعية وضبط الإحداثيات الحقيقية لكل مبنى في الحرم الجامعي مع مزامنة فورية في جميع الشاشات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-4 h-4" />
              تم حفظ المخطط وتحديث المجسم ثلاثي الأبعاد بنجاح
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
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative">
            {isOptimizing ? (
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            ) : config.groundImageUrl ? (
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
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>صورة أرضية الحرم الجامعي (Google Maps / صورة جوية بدقة عالية)</span>
              {config.groundImageUrl && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-300">
                  مفعلة في المجسم 3D 🟢
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {config.groundImageUrl
                ? 'تم حفظ صورة المخطط كأرضية مخصصة للمجسم ثلاثي الأبعاد لجميع المباني ويتم مزامنتها تلقائياً مع كافة التبويبات'
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
            disabled={isOptimizing}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-white border border-slate-300 hover:border-blue-500 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                <span>جارِ معالجة وضغط الصورة...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>{config.groundImageUrl ? 'تغيير الصورة' : 'رفع صورة من الجهاز'}</span>
              </>
            )}
          </button>

          {config.groundImageUrl && (
            <button
              onClick={handleClearImage}
              className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition"
              title="إزالة صورة الخلفية"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Editor Controls: View Mode Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              viewMode === '3d'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>المجسم ثلاثي الأبعاد 3D (معاينة حية ومباشرة)</span>
          </button>

          <button
            onClick={() => setViewMode('2d')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              viewMode === '2d'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>مخطط الإسقاط الثنائي 2D (نقر وسحب لتحديد المواقع)</span>
          </button>
        </div>

        <span className="text-xs text-slate-500">
          المبنى المحدد حالياً: <strong className="text-blue-700">{selectedBuildingId}</strong>
        </span>
      </div>

      {/* Interactive Canvas & Coordinate Controls Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Canvas Area (2 Columns) */}
        <div className="lg:col-span-2 flex flex-col gap-2">
          {viewMode === '3d' ? (
            /* Live 3D View with live highlight of selected building */
            <div className="relative w-full rounded-2xl overflow-hidden border border-slate-300 shadow-md">
              <Campus3DViewer
                buildings={BUILDINGS_CONFIG}
                allEvaluations={[]}
                onSelectBuilding={(bId) => setSelectedBuildingId(bId)}
                overrideMapConfig={config}
                selectedBuildingId={selectedBuildingId}
              />
            </div>
          ) : (
            /* 2D Interactive Drag & Drop Map */
            <div
              onClick={handleCanvasClick}
              onPointerMove={handlePointerMoveCanvas}
              onPointerUp={handlePointerUpCanvas}
              className="relative w-full h-[520px] bg-slate-200 rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner cursor-crosshair group select-none touch-none"
              style={{
                backgroundImage: config.groundImageUrl ? `url(${config.groundImageUrl})` : undefined,
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
              }}
            >
              {/* Grid overlay lines */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000015_1px,transparent_1px),linear-gradient(to_bottom,#00000015_1px,transparent_1px)] bg-[size:30px_30px]" />

              {/* Center Origin Mark */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border-2 border-dashed border-blue-500 rounded-full pointer-events-none opacity-50" />

              {/* Render 34 Building Architectural Pins */}
              {BUILDINGS_CONFIG.map((b) => {
                const pos = config.buildingPositions[b.id] || { x: 0, z: 0 };
                const isSelected = b.id === selectedBuildingId;

                // Convert (-85..85) to (0%..100%)
                const leftPercent = ((pos.x + 85) / 170) * 100;
                const topPercent = ((pos.z + 85) / 170) * 100;

                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => handlePointerDownPin(b.id, e)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-shadow select-none ${
                      isSelected ? 'z-30 scale-110' : 'z-10 hover:scale-105'
                    }`}
                    style={{
                      left: `${Math.max(3, Math.min(97, leftPercent))}%`,
                      top: `${Math.max(3, Math.min(97, topPercent))}%`,
                    }}
                    title={`${b.nameAr} (${b.id}) - انقر أو اسحب لنقل المبنى`}
                  >
                    <div
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-md border flex items-center gap-1.5 transition ${
                        isSelected
                          ? 'bg-blue-600 border-blue-400 text-white ring-4 ring-blue-300 ring-opacity-60 shadow-lg'
                          : 'bg-white/95 backdrop-blur-sm border-slate-300 text-slate-800 hover:border-blue-400'
                      }`}
                    >
                      <Layers className="w-3 h-3 text-blue-400" />
                      <span className="font-mono">{b.id}</span>
                      <span className="text-[10px] opacity-80">({b.number})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>
              {viewMode === '3d'
                ? '💡 يتم تمييز المبنى المحدد حالياً برفع مجسمه قليلاً في المعاينة 3D.'
                : '💡 انقر أو اسحب أي مبنى لوضعه مباشرة فوق موقعه الحقيقي في الخريطة الجوية.'}
            </span>
            <span className="font-mono font-bold text-slate-700">
              {selectedBuildingId}: X={selectedBuildingPos.x}, Z={selectedBuildingPos.z}
            </span>
          </div>
        </div>

        {/* Selected Building Coordinates Control Panel */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-4">
            <div className="border-b border-slate-200 pb-3">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                المبنى المطلوب تحريكه وضبط موقعه:
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

            {/* Quick Directional Movement Buttons */}
            <div className="flex flex-col gap-1.5 pt-2">
              <span className="text-[11px] font-bold text-slate-600">أزرار التحريك الدقيق:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePositionChange('x', selectedBuildingPos.x - 2)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  ← يسار (-2)
                </button>
                <button
                  onClick={() => handlePositionChange('x', selectedBuildingPos.x + 2)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  يمين (+2) →
                </button>
                <button
                  onClick={() => handlePositionChange('z', selectedBuildingPos.z - 2)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  ↑ للأعلى (-2)
                </button>
                <button
                  onClick={() => handlePositionChange('z', selectedBuildingPos.z + 2)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  للأسفل (+2) ↓
                </button>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              أي تعديل على إحداثيات المبنى يتم حفظه في التخزين الدائم (IndexedDB) ويتم بثه فوراً لجميع التبويبات والشاشات الأخرى دون الحاجة لإعادة تحميل الصفحة.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
