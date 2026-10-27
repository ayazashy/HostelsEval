// ============================================================================
// 🗺️ محرر مواقع المباني وخريطة الحرم ثلاثية وثنائية الأبعاد (Campus 3D & 2D Editor)
// يتيح للمشرف إدراج صورة الأقمار الصناعية وضبط مقياس حجم الصورة (Scale)
// وتحديد مواقع جميع المباني الـ 34 بالسحب والإفلات المباشر (2D Drag & Drop)
// مع المزامنة السحابية المباشرة في Firebase لجميع الزوار وإمكانية إعادة الضبط
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { BUILDINGS_CONFIG } from '../../config/buildings';
import {
  getCampusMapConfig,
  saveCampusMapConfig,
  resetCampusMapConfig,
  optimizeGroundImage,
  getImageSizeKb,
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
  Cloud,
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
} from 'lucide-react';

export const CampusMapEditor: React.FC = () => {
  const [config, setConfig] = useState<CampusMapConfig>(() => getCampusMapConfig());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('B14');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [cloudStatusMsg, setCloudStatusMsg] = useState<string | null>(null);

  // Drag and drop state for 2D Canvas
  const [draggingBuildingId, setDraggingBuildingId] = useState<string | null>(null);
  const container2DRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state if IndexedDB loads, Firebase syncs, or another tab updates
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

  // Window-level PointerMove & PointerUp for 100% reliable 2D drag and drop
  useEffect(() => {
    if (!draggingBuildingId) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const container = container2DRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Coordinate mapping: map container (0..width, 0..height) to 3D units (-65..+65)
      const normX = (clickX / rect.width) * 130 - 65;
      const normZ = (clickY / rect.height) * 130 - 65;

      const clampedX = Math.round(Math.max(-65, Math.min(65, normX)) * 10) / 10;
      const clampedZ = Math.round(Math.max(-65, Math.min(65, normZ)) * 10) / 10;

      setConfig((prev) => ({
        ...prev,
        buildingPositions: {
          ...prev.buildingPositions,
          [draggingBuildingId]: {
            x: clampedX,
            z: clampedZ,
          },
        },
      }));
    };

    const handleWindowPointerUp = () => {
      setDraggingBuildingId(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [draggingBuildingId]);

  const selectedBuildingPos = config.buildingPositions[selectedBuildingId] || { x: 0, z: 0 };
  const groundScale = config.groundScale !== undefined ? config.groundScale : 100;
  const groundOffsetX = config.groundOffsetX || 0;
  const groundOffsetZ = config.groundOffsetZ || 0;
  const imageSizeKb = getImageSizeKb(config.groundImageUrl);

  // Handle Image Upload & Compression
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOptimizing(true);
    try {
      // Compress to max 1000px and JPEG 0.78 (~90KB - 160KB)
      const optimizedBase64 = await optimizeGroundImage(file);
      const updatedConfig: CampusMapConfig = {
        ...config,
        groundImageUrl: optimizedBase64,
      };
      setConfig(updatedConfig);
      // Save locally + broadcast
      saveCampusMapConfig(updatedConfig, false);
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
      saveCampusMapConfig(updatedConfig, false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // Change building position via sliders
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

  // Change ground image scale
  const handleScaleChange = (scale: number) => {
    const clamped = Math.max(30, Math.min(300, Math.round(scale)));
    setConfig((prev) => ({
      ...prev,
      groundScale: clamped,
    }));
    setSaveSuccess(false);
  };

  // Change ground image offsets
  const handleOffsetChange = (axis: 'groundOffsetX' | 'groundOffsetZ', value: number) => {
    const rounded = Math.round(value * 10) / 10;
    setConfig((prev) => ({
      ...prev,
      [axis]: rounded,
    }));
    setSaveSuccess(false);
  };

  // Click on 2D map to place the selected building
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingBuildingId) return;
    const container = container2DRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = (clickX / rect.width) * 130 - 65;
    const normZ = (clickY / rect.height) * 130 - 65;
    const clampedX = Math.round(Math.max(-65, Math.min(65, normX)) * 10) / 10;
    const clampedZ = Math.round(Math.max(-65, Math.min(65, normZ)) * 10) / 10;

    setConfig((prev) => ({
      ...prev,
      buildingPositions: {
        ...prev.buildingPositions,
        [selectedBuildingId]: {
          x: clampedX,
          z: clampedZ,
        },
      },
    }));
    setSaveSuccess(false);
  };

  // Reset to auto-grid
  const handleResetToGrid = () => {
    if (confirm('هل تريد إعادة تعيين مواقع المباني الـ 34 إلى التوزيع الشبكي الافتراضي المنظم؟')) {
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
      saveCampusMapConfig(updatedConfig, false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // Complete Reset (Local + Cloud Firebase)
  const handleResetAllToDefault = async () => {
    if (
      confirm(
        'تحذير: هل أنت متأكد من إعادة ضبط خريطة الحرم بالكامل؟\nسيتم إزالة الصورة المخصصة وإعادة جميع المباني للشبكة الافتراضية وحفظ ذلك في Firebase لجميع الزوار.'
      )
    ) {
      setIsSavingCloud(true);
      const res = resetCampusMapConfig(true);
      setConfig(res);
      setIsSavingCloud(false);
      setCloudStatusMsg('تمت إعادة الضبط الافتراضي للخريطة سحابياً في Firebase ومحلياً بنجاح ✓');
      setTimeout(() => setCloudStatusMsg(null), 4000);
    }
  };

  // Save & Publish to Firebase Cloud (Public Visualization)
  const handleSaveAndPublish = async () => {
    setIsSavingCloud(true);
    setCloudStatusMsg(null);
    try {
      saveCampusMapConfig(config, true);
      setSaveSuccess(true);
      setCloudStatusMsg('تم نشر وحفظ المخطط المعماري سحابياً في Firebase لجميع الزوار بنجاح ✓');
      setTimeout(() => {
        setSaveSuccess(false);
        setCloudStatusMsg(null);
      }, 4500);
    } catch (err: any) {
      setCloudStatusMsg(`خطأ أثناء الحفظ السحابي: ${err?.message || 'تعذر الاتصال'}`);
    } finally {
      setIsSavingCloud(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-6">
      {/* 1. Header & Primary Cloud Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 shadow-sm">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                محرر خريطة الحرم وإحداثيات المباني (Google Maps / 3D & 2D)
              </h3>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-bold">
                إعدادات عامة للجميع
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              إدراج صورة المخطط أو الأقمار الصناعية، ضبط مقياس الصورة (Scale)، ونقل المباني بالسحب والإفلات المباشر
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetToGrid}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="إعادة توزيع المباني الـ 34 شبكياً"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>توزيع شبكي</span>
          </button>

          <button
            onClick={handleResetAllToDefault}
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="إلغاء الخريطة المخصصة وإعادة ضبط النظام الافتراضي"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة ضبط الخريطة</span>
          </button>

          <button
            disabled={isSavingCloud}
            onClick={handleSaveAndPublish}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {isSavingCloud ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جارِ النشر السحابي...</span>
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5 text-sky-200" />
                <span>حفظ ونشر المخطط للجميع (Firebase)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cloud & Save Status Notification */}
      {cloudStatusMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{cloudStatusMsg}</span>
        </div>
      )}

      {/* 2. Image Upload & Ground Scale Controls */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                <span>صورة أرضية الحرم الجامعي (Google Maps / لقطة جوية)</span>
                {config.groundImageUrl && (
                  <>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-300">
                      مفعلة 🟢
                    </span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-mono font-bold px-2 py-0.5 rounded-md">
                      {imageSizeKb} KB (مضغوطة وخفيفة)
                    </span>
                  </>
                )}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {config.groundImageUrl
                  ? 'تم ضغط وتصغير الصورة تلقائياً لسرعة التحميل، وتطبيقها كأرضية للمجسم 3D والخريطة 2D'
                  : 'لم يتم إدراج صورة بعد. قم برفع لقطة شاشة من Google Maps للمباني الـ 34'}
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
                  <span>جارِ تصغير وضغط الصورة...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>{config.groundImageUrl ? 'استبدال الصورة' : 'رفع صورة من الجهاز'}</span>
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

        {/* 3. Scale & Offset Sliders (مقياس حجم صورة الخريطة لتناسب حجم المباني) */}
        {config.groundImageUrl && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Ground Image Scale Slider */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col gap-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-800 flex items-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>مقياس حجم الصورة (Scale):</span>
                </span>
                <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  %{groundScale}
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="260"
                step="2"
                value={groundScale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <button
                  onClick={() => handleScaleChange(groundScale - 10)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-bold"
                >
                  تصغير -10%
                </button>
                <button
                  onClick={() => handleScaleChange(100)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-bold"
                >
                  100% افتراضي
                </button>
                <button
                  onClick={() => handleScaleChange(groundScale + 10)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-bold"
                >
                  تكبير +10%
                </button>
              </div>
            </div>

            {/* Ground Image Offset X Slider */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col gap-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-800">إزاحة الصورة أفقياً (Offset X):</span>
                <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {groundOffsetX}
                </span>
              </div>
              <input
                type="range"
                min="-40"
                max="40"
                step="0.5"
                value={groundOffsetX}
                onChange={(e) => handleOffsetChange('groundOffsetX', parseFloat(e.target.value))}
                className="w-full accent-slate-700 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>يسار</span>
                <button
                  onClick={() => handleOffsetChange('groundOffsetX', 0)}
                  className="hover:text-blue-600 underline"
                >
                  توسيط
                </button>
                <span>يمين</span>
              </div>
            </div>

            {/* Ground Image Offset Z Slider */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col gap-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-800">إزاحة الصورة رأسياً (Offset Z):</span>
                <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {groundOffsetZ}
                </span>
              </div>
              <input
                type="range"
                min="-40"
                max="40"
                step="0.5"
                value={groundOffsetZ}
                onChange={(e) => handleOffsetChange('groundOffsetZ', parseFloat(e.target.value))}
                className="w-full accent-slate-700 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>أعلى</span>
                <button
                  onClick={() => handleOffsetChange('groundOffsetZ', 0)}
                  className="hover:text-blue-600 underline"
                >
                  توسيط
                </button>
                <span>أسفل</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Editor View Mode Switcher (2D Drag & Drop vs 3D Live Scene) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('2d')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              viewMode === '2d'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>محرر الإسقاط الثنائي 2D (نقر وسحب دبابيس المباني)</span>
          </button>

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
        </div>

        <div className="text-xs text-slate-600">
          المبنى المحدد: <strong className="text-blue-700 font-mono text-sm">{selectedBuildingId}</strong>
        </div>
      </div>

      {/* 5. Main Canvas & Fine-Tuning Coordinate Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Visual Canvas */}
        <div className="lg:col-span-2 flex flex-col gap-2">
          {viewMode === '2d' ? (
            /* 2D Interactive Map with Direct Pointer Drag & Drop */
            <div
              ref={container2DRef}
              onClick={handleCanvasClick}
              className="relative w-full h-[540px] bg-slate-200 rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner select-none cursor-crosshair touch-none"
              style={{
                backgroundImage: config.groundImageUrl ? `url(${config.groundImageUrl})` : undefined,
                backgroundSize: `${groundScale}% ${groundScale}%`,
                backgroundPosition: `${50 + groundOffsetX}% ${50 + groundOffsetZ}%`,
                backgroundRepeat: 'no-repeat',
              }}
            >
              {/* Grid overlay lines (pointer-events-none to prevent intercepting clicks) */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000015_1px,transparent_1px),linear-gradient(to_bottom,#00000015_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none" />

              {/* Center Origin Mark */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 border-2 border-dashed border-blue-500 rounded-full pointer-events-none opacity-40" />

              {/* Render 34 Building Pins */}
              {BUILDINGS_CONFIG.map((b) => {
                const pos = config.buildingPositions[b.id] || { x: 0, z: 0 };
                const isSelected = b.id === selectedBuildingId;
                const isBeingDragged = b.id === draggingBuildingId;

                // Map -65..+65 coordinate space to 0%..100%
                const leftPercent = ((pos.x + 65) / 130) * 100;
                const topPercent = ((pos.z + 65) / 130) * 100;

                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedBuildingId(b.id);
                      setDraggingBuildingId(b.id);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-transform ${
                      isSelected ? 'z-30 scale-110' : 'z-10 hover:scale-105'
                    }`}
                    style={{
                      left: `${Math.max(2, Math.min(98, leftPercent))}%`,
                      top: `${Math.max(2, Math.min(98, topPercent))}%`,
                    }}
                    title={`${b.nameAr} (${b.id}) - انقر أو اسحب لنقل المبنى`}
                  >
                    <div
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold shadow-md border flex items-center gap-1.5 transition ${
                        isSelected
                          ? 'bg-blue-600 border-2 border-white text-white ring-4 ring-blue-300 ring-opacity-70 shadow-xl'
                          : 'bg-white/95 backdrop-blur-sm border-slate-300 text-slate-800 hover:border-blue-400'
                      }`}
                    >
                      <Layers className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-blue-500'}`} />
                      <span className="font-mono">{b.id}</span>
                      <span className="text-[10px] opacity-80">({b.number})</span>
                    </div>

                    {/* Floating coordinate pill on selected pin */}
                    {isSelected && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-slate-900/90 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">
                        {pos.x}, {pos.z}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* 3D Live View with Scalable Ground & Highlighted Selection */
            <div className="relative w-full rounded-2xl overflow-hidden border border-slate-300 shadow-md">
              <Campus3DViewer
                buildings={BUILDINGS_CONFIG}
                allEvaluations={[]}
                onSelectBuilding={(bId) => setSelectedBuildingId(bId)}
                overrideMapConfig={config}
                selectedBuildingId={selectedBuildingId}
              />
            </div>
          )}

          {/* Guide Tips */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-1">
            <span>
              {viewMode === '2d'
                ? '💡 انقر واسحب أي دبوس مبنى لوضعه مباشرة فوق موقعه الحقيقي بالصورة الجوية، أو انقر على الخريطة لوضع المبنى المحدد.'
                : '💡 المعاينة 3D الحية تتأثر فوراً بمقياس حجم الصورة (Scale) وإحداثيات كل مبنى دون إعادة تحميل.'}
            </span>
            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
              X={selectedBuildingPos.x}, Z={selectedBuildingPos.z}
            </span>
          </div>
        </div>

        {/* Right Column: Selected Building Fine-Tuning Controls */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-4">
            <div className="border-b border-slate-200 pb-3">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                المبنى المحدد للتحريك والضبط الدقيق:
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

            {/* Sliders for X and Z Coordinates */}
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
                  min="-65"
                  max="65"
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
                  min="-65"
                  max="65"
                  step="0.5"
                  value={selectedBuildingPos.z}
                  onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Directional Nudge Buttons */}
            <div className="flex flex-col gap-1.5 pt-2">
              <span className="text-[11px] font-bold text-slate-600">أزرار الإزاحة الدقيقة:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePositionChange('x', selectedBuildingPos.x - 1)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  ← يسار (-1)
                </button>
                <button
                  onClick={() => handlePositionChange('x', selectedBuildingPos.x + 1)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  يمين (+1) →
                </button>
                <button
                  onClick={() => handlePositionChange('z', selectedBuildingPos.z - 1)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  ↑ للأعلى (-1)
                </button>
                <button
                  onClick={() => handlePositionChange('z', selectedBuildingPos.z + 1)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm flex items-center justify-center gap-1"
                >
                  للأسفل (+1) ↓
                </button>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              عند الضغط على <strong>حفظ ونشر المخطط</strong>، يتم حفظ الإعدادات سحابياً في Firebase وتظهر نفس الخريطة لجميع المستخدمين والزوار على الفور.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
