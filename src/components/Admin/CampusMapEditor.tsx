// ============================================================================
// 🗺️ محرر مواقع المباني ومخطط الحرم (2D & 3D Campus Masterplan Editor)
// محرر خرائط متكامل فائق السلاسة والدقة لتحديد مواقع المباني الـ 34
// وضبط صورة المخطط/الأقمار الصناعية للأبعاد الثنائية والثلاثية
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { ImageViewerModal } from '../Common/ImageViewerModal';
import {
  Map,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Check,
  Trash2,
  Box,
  Sparkles,
  Loader2,
  Cloud,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Crosshair,
  Sliders,
  CheckCircle2,
  ArrowRight,
  ArrowLeft as ArrowLeftIcon,
  Maximize2,
} from 'lucide-react';

export const CampusMapEditor: React.FC = () => {
  // 1. Core State with automatic sanitation of old runaway scale (e.g. from previous tests where user had 184%)
  const [config, setConfig] = useState<CampusMapConfig>(() => {
    const initial = getCampusMapConfig();
    if (initial.groundScale && initial.groundScale > 110) {
      const fixed = { ...initial, groundScale: 70 };
      saveCampusMapConfig(fixed, false);
      return fixed;
    }
    return initial;
  });
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('B14');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [cloudStatusMsg, setCloudStatusMsg] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 2. Image adjustments drawer toggle & preview modal
  const [showImageDrawer, setShowImageDrawer] = useState(false);
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);

  // 3. Auto-advance to next building on tap placement
  const [autoAdvance, setAutoAdvance] = useState(true);

  // 4. Interactive visual feedback (ripple/beacon on canvas click)
  const [tapBeacon, setTapBeacon] = useState<{ xPct: number; yPct: number; id: number } | null>(null);

  // 5. Drag-and-drop state & refs for 100% reliable tracking
  const [draggingBuildingId, setDraggingBuildingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragStateRef = useRef<{
    buildingId: string;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
  } | null>(null);

  // Safe parameters with calibrated defaults (groundScale capped at 100% max for neat framing)
  const rawScale = config.groundScale !== undefined ? config.groundScale : 70;
  const groundScale = rawScale > 110 ? 70 : Math.max(25, rawScale);
  const groundOffsetX = config.groundOffsetX || 0;
  const groundOffsetZ = config.groundOffsetZ || 0;
  const groundRotation = config.groundRotation || 0;
  const groundOpacity = config.groundOpacity !== undefined ? config.groundOpacity : 85;
  const selectedBuildingPos = config.buildingPositions[selectedBuildingId] || { x: 0, z: 0 };
  const imageSizeKb = getImageSizeKb(config.groundImageUrl);

  // Sync state if another tab updates or cloud loads
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

  // Convert client pointer coordinates to 3D isometric units [-65..+65]
  const calculateWorldCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const boundedX = Math.max(rect.left, Math.min(rect.right, clientX));
    const boundedY = Math.max(rect.top, Math.min(rect.bottom, clientY));

    const pctX = (boundedX - rect.left) / rect.width;
    const pctZ = (boundedY - rect.top) / rect.height;

    // Coordinate mapping: 0%..100% -> -65..+65
    const worldX = pctX * 130 - 65;
    const worldZ = pctZ * 130 - 65;

    // Clamp cleanly to keep pins safely within campus boundaries
    const clampedX = Math.round(Math.max(-58, Math.min(58, worldX)) * 10) / 10;
    const clampedZ = Math.round(Math.max(-58, Math.min(58, worldZ)) * 10) / 10;

    return { x: clampedX, z: clampedZ, pctX, pctZ };
  }, []);

  // --------------------------------------------------------------------------
  // Method A: Bulletproof Window-Level Drag & Drop
  // --------------------------------------------------------------------------
  const handlePinPointerDown = (e: React.PointerEvent<HTMLDivElement>, bId: string) => {
    e.preventDefault();
    e.stopPropagation();

    dragStateRef.current = {
      buildingId: bId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      hasMoved: false,
    };

    setSelectedBuildingId(bId);
    setDraggingBuildingId(bId);

    const onGlobalPointerMove = (moveEv: PointerEvent) => {
      if (!dragStateRef.current) return;
      moveEv.preventDefault();

      const dist = Math.hypot(
        moveEv.clientX - dragStateRef.current.startClientX,
        moveEv.clientY - dragStateRef.current.startClientY
      );
      if (dist > 3) {
        dragStateRef.current.hasMoved = true;
      }

      const coords = calculateWorldCoords(moveEv.clientX, moveEv.clientY);
      if (!coords) return;

      setConfig((prev) => ({
        ...prev,
        buildingPositions: {
          ...prev.buildingPositions,
          [dragStateRef.current!.buildingId]: {
            x: coords.x,
            z: coords.z,
          },
        },
      }));
      setHasUnsavedChanges(true);
    };

    const onGlobalPointerUp = () => {
      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);

      if (dragStateRef.current && !dragStateRef.current.hasMoved) {
        // Simple tap / selection
        setSelectedBuildingId(dragStateRef.current.buildingId);
      }

      dragStateRef.current = null;
      setDraggingBuildingId(null);
    };

    window.addEventListener('pointermove', onGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
  };

  // --------------------------------------------------------------------------
  // Method B: Zero-Friction "Click Canvas to Place"
  // --------------------------------------------------------------------------
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If a pin drag is active, do nothing here
    if (dragStateRef.current) return;

    const coords = calculateWorldCoords(e.clientX, e.clientY);
    if (!coords) return;

    // Trigger visual beacon animation at clicked position
    setTapBeacon({
      xPct: coords.pctX * 100,
      yPct: coords.pctZ * 100,
      id: Date.now(),
    });

    // Move current selected building to tap spot
    setConfig((prev) => ({
      ...prev,
      buildingPositions: {
        ...prev.buildingPositions,
        [selectedBuildingId]: {
          x: coords.x,
          z: coords.z,
        },
      },
    }));
    setHasUnsavedChanges(true);

    // Optional Auto-Advance to next building for lightning-fast placement
    if (autoAdvance) {
      const currentIndex = BUILDINGS_CONFIG.findIndex((b) => b.id === selectedBuildingId);
      if (currentIndex !== -1 && currentIndex < BUILDINGS_CONFIG.length - 1) {
        const nextBuilding = BUILDINGS_CONFIG[currentIndex + 1];
        setSelectedBuildingId(nextBuilding.id);
      }
    }
  };

  // --------------------------------------------------------------------------
  // Image Upload, Sizing & Calibration Controls
  // --------------------------------------------------------------------------
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOptimizing(true);
    try {
      const optimizedBase64 = await optimizeGroundImage(file);
      const updatedConfig: CampusMapConfig = {
        ...config,
        groundImageUrl: optimizedBase64,
        groundScale: 70, // Optimal calibrated scale that comfortably fits canvas
        groundOffsetX: 0,
        groundOffsetZ: 0,
        groundRotation: 0,
        groundOpacity: 85,
      };
      setConfig(updatedConfig);
      saveCampusMapConfig(updatedConfig, false);
      setHasUnsavedChanges(false);
      setShowImageDrawer(true);
      setCloudStatusMsg('تم رفع ومعالجة صورة المخطط بنجاح ✓');
      setTimeout(() => setCloudStatusMsg(null), 3500);
    } catch (err) {
      console.error('[CampusMapEditor] Image optimization error:', err);
      alert('حدث خطأ أثناء معالجة الصورة. يرجى اختيار ملف صورة صالح.');
    } finally {
      setIsOptimizing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearImage = () => {
    if (confirm('هل أنت متأكد من رغبتك في حذف صورة المخطط؟')) {
      const updatedConfig: CampusMapConfig = {
        ...config,
        groundImageUrl: undefined,
      };
      setConfig(updatedConfig);
      saveCampusMapConfig(updatedConfig, false);
      setHasUnsavedChanges(false);
      setShowImageDrawer(false);
      setCloudStatusMsg('تمت إزالة صورة المخطط ✓');
      setTimeout(() => setCloudStatusMsg(null), 3000);
    }
  };

  // Preset: Perfectly fit the ground image to the campus cluster
  const handleFitImage = () => {
    setConfig((prev) => ({
      ...prev,
      groundScale: 70,
      groundOffsetX: 0,
      groundOffsetZ: 0,
    }));
    setHasUnsavedChanges(true);
  };

  // Preset: Reset buildings to organized 6x6 grid
  const handleResetToGrid = () => {
    if (confirm('هل تريد إعادة تعيين مواقع المباني الـ 34 إلى التوزيع الشبكي الافتراضي؟')) {
      const defaultPositions: Record<string, { x: number; z: number }> = {};
      const cols = 6;
      const spacingX = 18;
      const spacingZ = 18;
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
      setHasUnsavedChanges(false);
      setCloudStatusMsg('تمت استعادة التوزيع الشبكي الافتراضي ✓');
      setTimeout(() => setCloudStatusMsg(null), 3000);
    }
  };

  // Full reset (local + cloud)
  const handleResetAll = async () => {
    if (confirm('تحذير: هل أنت متأكد من إعادة ضبط خريطة الحرم بالكامل؟')) {
      setIsSavingCloud(true);
      const reset = resetCampusMapConfig(true);
      setConfig(reset);
      setIsSavingCloud(false);
      setHasUnsavedChanges(false);
      setShowImageDrawer(false);
      setCloudStatusMsg('تمت إعادة الضبط الافتراضي للخريطة سحابياً ومحلياً ✓');
      setTimeout(() => setCloudStatusMsg(null), 4000);
    }
  };

  // Save & publish to Firebase Cloud
  const handleSaveAndPublish = async () => {
    setIsSavingCloud(true);
    setCloudStatusMsg(null);
    try {
      saveCampusMapConfig(config, true);
      setHasUnsavedChanges(false);
      setCloudStatusMsg('تم حفظ ونشر المخطط بنجاح لجميع المستخدمين ✓');
      setTimeout(() => setCloudStatusMsg(null), 4000);
    } catch (err: any) {
      setCloudStatusMsg(`خطأ أثناء الحفظ السحابي: ${err?.message || 'تعذر الاتصال'}`);
    } finally {
      setIsSavingCloud(false);
    }
  };

  // Selected building navigation
  const selectedBuildingObj =
    BUILDINGS_CONFIG.find((b) => b.id === selectedBuildingId) || BUILDINGS_CONFIG[0];
  const selectedIndex = BUILDINGS_CONFIG.findIndex((b) => b.id === selectedBuildingId);

  const handlePrevBuilding = () => {
    const prevIdx = selectedIndex > 0 ? selectedIndex - 1 : BUILDINGS_CONFIG.length - 1;
    setSelectedBuildingId(BUILDINGS_CONFIG[prevIdx].id);
  };

  const handleNextBuilding = () => {
    const nextIdx = selectedIndex < BUILDINGS_CONFIG.length - 1 ? selectedIndex + 1 : 0;
    setSelectedBuildingId(BUILDINGS_CONFIG[nextIdx].id);
  };

  // Fine-tuning position change
  const handlePositionStep = (axis: 'x' | 'z', delta: number) => {
    const currentVal = selectedBuildingPos[axis];
    const newVal = Math.round(Math.max(-58, Math.min(58, currentVal + delta)) * 10) / 10;
    setConfig((prev) => ({
      ...prev,
      buildingPositions: {
        ...prev.buildingPositions,
        [selectedBuildingId]: {
          ...selectedBuildingPos,
          [axis]: newVal,
        },
      },
    }));
    setHasUnsavedChanges(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col gap-5">
      {/* 1. Header & Primary Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900">
                محرر مواقع المباني ومخطط الحرم
              </h3>
              <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
                34 مبنى
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              اسحب الأرقام مباشرة، أو انقر على الخريطة لتحديد موقع المبنى المحدد فوراً
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetToGrid}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="توزيع شبكي منظم لجميع المباني"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>توزيع شبكي</span>
          </button>

          <button
            onClick={handleResetAll}
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="إعادة ضبط المخطط بالكامل"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة ضبط</span>
          </button>

          <button
            disabled={isSavingCloud}
            onClick={handleSaveAndPublish}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${
              hasUnsavedChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {isSavingCloud ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جارِ النشر...</span>
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5" />
                <span>حفظ ونشر المخطط</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Toast Alert */}
      {cloudStatusMsg && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{cloudStatusMsg}</span>
        </div>
      )}

      {/* 2. Sleek Controls Bar: Mode Switcher & Image Tool Dropdown */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('2d')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              viewMode === '2d'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>محرر السحب 2D</span>
          </button>

          <button
            onClick={() => setViewMode('3d')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              viewMode === '3d'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>معاينة 3D الحية</span>
          </button>
        </div>

        {/* Compact Image Manager Trigger */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
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
            className="px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                <span>معالجة...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>{config.groundImageUrl ? 'تغيير صورة المخطط' : 'رفع صورة المخطط'}</span>
              </>
            )}
          </button>

          {config.groundImageUrl && (
            <>
              {/* Ground Image Clickable Thumbnail */}
              <div
                onClick={() => setShowImagePreviewModal(true)}
                className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-300 hover:border-blue-500 cursor-pointer shrink-0 shadow-xs group"
                title="معاينة المخطط ملء الشاشة"
              >
                <img
                  src={config.groundImageUrl}
                  alt="معاينة المخطط"
                  className="w-full h-full object-cover group-hover:scale-110 transition"
                />
                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white pointer-events-none">
                  <Maximize2 className="w-3.5 h-3.5" />
                </div>
              </div>

              <button
                onClick={() => setShowImageDrawer(!showImageDrawer)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                  showImageDrawer
                    ? 'bg-blue-50 border-blue-400 text-blue-700'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>ضبط أبعاد الصورة</span>
                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">
                  %{groundScale}
                </span>
              </button>

              <button
                onClick={handleClearImage}
                className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition"
                title="إزالة الصورة"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Auto-advance toggle */}
          <button
            onClick={() => setAutoAdvance(!autoAdvance)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              autoAdvance
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
            title="عند النقر على الخريطة لوضع المبنى، يتم الانتقال للمبنى التالي تلقائياً"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>انتقال تسلسلي: {autoAdvance ? 'مفعل' : 'معطل'}</span>
          </button>
        </div>
      </div>

      {/* 3. Collapsible Image Adjustment Drawer (Strictly Bounded & Compact) */}
      {config.groundImageUrl && showImageDrawer && (
        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex flex-col gap-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-slate-200">
                لوحة ضبط صورة المخطط الخلفية (المقاس والإزاحة والشفافية)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">({imageSizeKb} KB)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImagePreviewModal(true)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-slate-700 shadow-xs"
                title="معاينة المخطط ملء الشاشة مع التكبير"
              >
                <Maximize2 className="w-3 h-3" />
                <span>معاينة مكبرة</span>
              </button>

              <button
                onClick={handleFitImage}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
              >
                <Crosshair className="w-3 h-3" />
                <span>ملاءمة مثالية (Fit 70%)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Scale Slider */}
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col gap-2">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-300">حجم الصورة (Scale):</span>
                <span className="font-mono text-blue-400 font-bold">%{groundScale}</span>
              </div>
              <input
                type="range"
                min="25"
                max="105"
                step="1"
                value={groundScale}
                onChange={(e) => {
                  setConfig((prev) => ({ ...prev, groundScale: parseFloat(e.target.value) }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundScale: 50 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded"
                >
                  صغير 50%
                </button>
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundScale: 70 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-blue-300"
                >
                  متوازن 70%
                </button>
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundScale: 90 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded"
                >
                  كبير 90%
                </button>
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col gap-2">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-300">شفافية الصورة:</span>
                <span className="font-mono text-emerald-400 font-bold">%{groundOpacity}</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                step="5"
                value={groundOpacity}
                onChange={(e) => {
                  setConfig((prev) => ({ ...prev, groundOpacity: parseFloat(e.target.value) }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>خافتة</span>
                <span>واضحة جداً</span>
              </div>
            </div>

            {/* Rotation Control */}
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col gap-2">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-300">تدوير المخطط:</span>
                <span className="font-mono text-purple-400 font-bold">{groundRotation}°</span>
              </div>
              <div className="grid grid-cols-4 gap-1 pt-1">
                {[0, 90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    onClick={() => {
                      setConfig((prev) => ({ ...prev, groundRotation: deg }));
                      setHasUnsavedChanges(true);
                    }}
                    className={`py-1 rounded font-mono font-bold text-xs transition ${
                      groundRotation === deg
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            {/* Pan & Offset Controls */}
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-300">تحريك المخطط (Pan):</span>
                <span className="font-mono text-slate-400 text-[10px]">
                  X={groundOffsetX}, Z={groundOffsetZ}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div />
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundOffsetZ: groundOffsetZ - 2 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center text-white"
                  title="أعلى"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <div />
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundOffsetX: groundOffsetX - 2 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center text-white"
                  title="يمين"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundOffsetX: 0, groundOffsetZ: 0 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="p-1 bg-slate-600 hover:bg-slate-500 rounded text-[10px] font-bold text-white"
                  title="توسيط"
                >
                  توسيط
                </button>
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundOffsetX: groundOffsetX + 2 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center text-white"
                  title="يسار"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div />
                <button
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, groundOffsetZ: groundOffsetZ + 2 }));
                    setHasUnsavedChanges(true);
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center text-white"
                  title="أسفل"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <div />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Quick Building Selector Ribbon (34 Buildings with Large Bold Numbers) */}
      <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">المبنى المحدد حالياً:</span>
            <span className="font-black font-mono text-sm text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200">
              {selectedBuildingObj.number} ({selectedBuildingObj.nameAr})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevBuilding}
              className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition flex items-center gap-1 shadow-xs"
              title="المبنى السابق"
            >
              <ArrowRight className="w-3 h-3" />
              <span>السابق</span>
            </button>
            <button
              onClick={handleNextBuilding}
              className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 transition flex items-center gap-1 shadow-xs"
              title="المبنى التالي"
            >
              <span>التالي</span>
              <ArrowLeftIcon className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {BUILDINGS_CONFIG.map((b) => {
            const isSelected = b.id === selectedBuildingId;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBuildingId(b.id)}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-xs sm:text-sm font-black font-mono shrink-0 transition flex items-center justify-center border-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                    : 'bg-white hover:bg-blue-50 text-slate-800 border-slate-200 hover:border-blue-400'
                }`}
                title={`${b.nameAr} (${b.id})`}
              >
                {b.number}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Main Canvas & Coordinate Adjuster Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Visual Map Viewport (2D Canvas OR 3D Live Scene) */}
        <div className="lg:col-span-8 flex flex-col gap-2">
          {viewMode === '2d' ? (
            <div
              className="w-full flex flex-col items-center justify-center p-3 sm:p-5 relative"
              style={{
                backgroundColor: '#070d19',
                borderRadius: '1.5rem',
                border: '2px solid #1e293b',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
                minHeight: '560px',
              }}
            >
              {/* Top Canvas Micro Toolbar */}
              <div className="w-full flex items-center justify-between text-[11px] text-slate-400 px-2 pb-3 font-mono">
                <span className="flex items-center gap-1.5 text-slate-300 font-bold">
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      display: 'inline-block',
                    }}
                  />
                  محرر الخريطة التفاعلي (130x130 م²)
                </span>
                <span
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    color: '#e2e8f0',
                    fontWeight: 700,
                  }}
                >
                  المبنى النشط: {selectedBuildingObj.number} | X={selectedBuildingPos.x}, Z=
                  {selectedBuildingPos.z}
                </span>
              </div>

              {/* 2D Calibrated Canvas (EXPLICIT DIMENSIONS GUARANTEED NEVER 0PX) */}
              <div
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  height: '520px',
                  minHeight: '380px',
                  aspectRatio: '1 / 1',
                  backgroundColor: '#0a101f',
                  position: 'relative',
                  borderRadius: '1rem',
                  overflow: 'hidden',
                  border: '2px solid #334155',
                  boxShadow: 'inset 0 2px 8px 0 rgba(0, 0, 0, 0.4)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'none',
                  cursor: 'crosshair',
                }}
              >
                {/* A. Ground Satellite / Campus Blueprint Image Layer (Strictly Centered & Sized to 70%) */}
                {config.groundImageUrl && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${50 + (groundOffsetX / 130) * 100}%`,
                      top: `${50 + (groundOffsetZ / 130) * 100}%`,
                      width: `${groundScale}%`,
                      height: `${groundScale}%`,
                      transform: `translate(-50%, -50%) rotate(${groundRotation}deg)`,
                      opacity: groundOpacity / 100,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 75ms ease, width 150ms ease, height 150ms ease',
                    }}
                  >
                    <img
                      src={config.groundImageUrl}
                      alt="مخطط الحرم"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        borderRadius: '12px',
                        border: '1px solid rgba(148, 163, 184, 0.3)',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                      }}
                    />
                  </div>
                )}

                {/* B. Precision Blueprint Grid Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.12) 1px, transparent 1px)',
                    backgroundSize: '26px 26px',
                    pointerEvents: 'none',
                  }}
                />

                {/* C. Campus Boundary & Center Crosshair */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '16px',
                    borderRadius: '12px',
                    border: '1px dashed rgba(100, 116, 139, 0.3)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '24px',
                    height: '24px',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#3b82f6',
                    }}
                  />
                </div>

                {/* D. Interactive Tap Beacon Animation */}
                {tapBeacon && (
                  <div
                    key={tapBeacon.id}
                    style={{
                      position: 'absolute',
                      left: `${tapBeacon.xPct}%`,
                      top: `${tapBeacon.yPct}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none',
                      zIndex: 45,
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: '2px solid #60a5fa',
                        backgroundColor: 'rgba(59, 130, 246, 0.25)',
                      }}
                    />
                  </div>
                )}

                {/* E. 34 Draggable Building Pins with Prominent Bold Numbers */}
                {BUILDINGS_CONFIG.map((b) => {
                  const pos = config.buildingPositions[b.id] || { x: 0, z: 0 };
                  const isSelected = b.id === selectedBuildingId;
                  const isDragging = b.id === draggingBuildingId;

                  // Normalize coordinates [-65..+65] to [0%..100%]
                  const leftPct = ((pos.x + 65) / 130) * 100;
                  const topPct = ((pos.z + 65) / 130) * 100;

                  return (
                    <div
                      key={b.id}
                      onPointerDown={(e) => handlePinPointerDown(e, b.id)}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: isDragging ? 50 : isSelected ? 40 : 20,
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        touchAction: 'none',
                      }}
                      title={`${b.nameAr} (${b.id})`}
                    >
                      {/* Bold Number Badge */}
                      <div
                        style={{
                          width: isSelected || isDragging ? '42px' : '36px',
                          height: isSelected || isDragging ? '42px' : '36px',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 900,
                          fontSize: isSelected || isDragging ? '14px' : '12px',
                          backgroundColor: isDragging
                            ? '#10b981'
                            : isSelected
                            ? '#2563eb'
                            : 'rgba(15, 23, 42, 0.95)',
                          color: '#ffffff',
                          border: isSelected || isDragging ? '2px solid #ffffff' : '1.5px solid #64748b',
                          boxShadow: isSelected || isDragging
                            ? '0 0 0 4px rgba(59, 130, 246, 0.5), 0 10px 20px -3px rgba(0, 0, 0, 0.4)'
                            : '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                          transform: isDragging ? 'scale(1.2)' : isSelected ? 'scale(1.1)' : 'scale(1)',
                          transition: 'all 150ms ease',
                        }}
                      >
                        {b.number}
                      </div>

                      {/* Coordinate Tooltip for Selected Pin */}
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '100%',
                            transform: 'translateX(-50%)',
                            marginTop: '6px',
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            color: '#ffffff',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            border: '1px solid #475569',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                          }}
                        >
                          {b.id} ({pos.x}, {pos.z})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Instructions banner */}
              <div className="w-full flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 px-2 pt-3 gap-2">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    <strong>طريقتان للتحريك:</strong> اسحب الرقم مباشرة، أو اختر الرقم ثم انقر على موقعه في الخريطة.
                  </span>
                </span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-xl font-bold">
                  انقر على أي مبنى لتحديده
                </span>
              </div>
            </div>
          ) : (
            /* 3D Live Scene Mode */
            <div
              style={{
                width: '100%',
                height: '540px',
                minHeight: '480px',
                borderRadius: '1.5rem',
                overflow: 'hidden',
                border: '2px solid #e2e8f0',
                position: 'relative',
              }}
            >
              <Campus3DViewer
                buildings={BUILDINGS_CONFIG}
                allEvaluations={[]}
                onSelectBuilding={(bId) => setSelectedBuildingId(bId)}
                overrideMapConfig={config}
                selectedBuildingId={selectedBuildingId}
              />
            </div>
          )}
        </div>

        {/* Selected Building Precision Fine-Tuning Column */}
        <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col gap-5 shadow-xs">
          <div className="border-b border-slate-200 pb-3">
            <span className="text-xs font-bold text-slate-500 block mb-1">
              التحكم الدقيق في المبنى:
            </span>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-mono font-black text-sm flex items-center justify-center shrink-0 shadow-sm">
                {selectedBuildingObj.number}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 leading-tight">
                  {selectedBuildingObj.nameAr}
                </h4>
                <p className="text-xs text-slate-500 font-mono">{selectedBuildingObj.id}</p>
              </div>
            </div>
          </div>

          {/* Coordinate Sliders */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-bold text-slate-700">المحور الأفقي (X):</span>
                <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200">
                  {selectedBuildingPos.x}
                </span>
              </div>
              <input
                type="range"
                min="-58"
                max="58"
                step="0.5"
                value={selectedBuildingPos.x}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    buildingPositions: {
                      ...prev.buildingPositions,
                      [selectedBuildingId]: { ...selectedBuildingPos, x: val },
                    },
                  }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>-58 (يمين)</span>
                <span>0</span>
                <span>+58 (يسار)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-bold text-slate-700">المحور الرأسي (Z):</span>
                <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200">
                  {selectedBuildingPos.z}
                </span>
              </div>
              <input
                type="range"
                min="-58"
                max="58"
                step="0.5"
                value={selectedBuildingPos.z}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    buildingPositions: {
                      ...prev.buildingPositions,
                      [selectedBuildingId]: { ...selectedBuildingPos, z: val },
                    },
                  }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>-58 (أعلى)</span>
                <span>0</span>
                <span>+58 (أسفل)</span>
              </div>
            </div>
          </div>

          {/* Precision D-Pad Buttons */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
            <span className="text-xs font-bold text-slate-700">أزرار الإزاحة الدقيقة (خطوة ±1):</span>
            <div className="grid grid-cols-3 gap-2">
              <div />
              <button
                onClick={() => handlePositionStep('z', -1)}
                className="p-2.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center justify-center shadow-xs transition active:scale-95"
                title="تحريك لأعلى"
              >
                <ChevronUp className="w-4 h-4 text-blue-600" />
              </button>
              <div />

              <button
                onClick={() => handlePositionStep('x', -1)}
                className="p-2.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center justify-center shadow-xs transition active:scale-95"
                title="تحريك لليمين"
              >
                <ChevronRight className="w-4 h-4 text-blue-600" />
              </button>
              <button
                onClick={() => {
                  setConfig((prev) => ({
                    ...prev,
                    buildingPositions: {
                      ...prev.buildingPositions,
                      [selectedBuildingId]: { x: 0, z: 0 },
                    },
                  }));
                  setHasUnsavedChanges(true);
                }}
                className="p-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-[11px] font-bold text-slate-700 transition"
                title="توسيط المبنى"
              >
                توسيط
              </button>
              <button
                onClick={() => handlePositionStep('x', 1)}
                className="p-2.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center justify-center shadow-xs transition active:scale-95"
                title="تحريك لليسار"
              >
                <ChevronLeft className="w-4 h-4 text-blue-600" />
              </button>

              <div />
              <button
                onClick={() => handlePositionStep('z', 1)}
                className="p-2.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center justify-center shadow-xs transition active:scale-95"
                title="تحريك لأسفل"
              >
                <ChevronDown className="w-4 h-4 text-blue-600" />
              </button>
              <div />
            </div>
          </div>

          {/* Quick tips & save reminder */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex flex-col gap-2 mt-auto text-xs text-blue-900">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                اضغط على <strong>حفظ ونشر المخطط</strong> في الأعلى لنشر التعديلات سحابياً فوراً لجميع الزوار.
              </p>
            </div>
            {hasUnsavedChanges && (
              <button
                disabled={isSavingCloud}
                onClick={handleSaveAndPublish}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-1.5 shadow-sm mt-1"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>نشر التعديلات الآن</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showImagePreviewModal && config.groundImageUrl && (
        <ImageViewerModal
          src={config.groundImageUrl}
          title="مخطط الحرم الجامعي"
          onClose={() => setShowImagePreviewModal(false)}
        />
      )}
    </div>
  );
};
