// ============================================================================
// 🔒 تقييم ومتابعة مرافق مباني الإسكان الطلابي — بوابة الدخول (Light Mode)
// ============================================================================

import React, { useState } from 'react';
import {
  unlockAdminWorkspace,
  loginBuildingLeaderWithCode,
  loginMaintenanceWithCode,
} from '../../services/authService';
import { BuildingLeaderAuth, MaintenanceAuth } from '../../types/hostel';
import { Lock, KeyRound, ArrowLeft, ShieldCheck, Wrench, X } from 'lucide-react';

interface AdminGatewayProps {
  onAdminUnlocked: () => void;
  onLeaderLogin: (auth: BuildingLeaderAuth) => void;
  onMaintenanceLogin?: (auth: MaintenanceAuth) => void;
  onClose?: () => void;
  initialMode?: 'leader' | 'maintenance' | 'admin';
  initialBuildingId?: string;
}

export const AdminGateway: React.FC<AdminGatewayProps> = ({
  onAdminUnlocked,
  onLeaderLogin,
  onMaintenanceLogin,
  onClose,
  initialMode = 'leader',
  initialBuildingId = 'B14',
}) => {
  const [mode, setMode] = useState<'leader' | 'maintenance' | 'admin'>(initialMode);

  // Admin states
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Leader states
  const [buildingId, setBuildingId] = useState(initialBuildingId);
  const [leaderCode, setLeaderCode] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [leaderError, setLeaderError] = useState<string | null>(null);

  // Maintenance / Cleaning Services / Read-Only KPI Viewer states
  const [staffTrack, setStaffTrack] = useState<'maintenance' | 'cleaning' | 'viewer'>(
    'maintenance'
  );
  const [technicianName, setTechnicianName] = useState('');
  const [maintenanceCode, setMaintenanceCode] = useState('');
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setIsLoading(true);

    try {
      const res = await unlockAdminWorkspace(adminPassword);
      if (res.success) {
        onAdminUnlocked();
      } else {
        setAdminError(res.error || 'كلمة المرور غير صحيحة');
      }
    } catch {
      setAdminError('فشل التحقق من التشفير');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaderError(null);

    const res = await loginBuildingLeaderWithCode(buildingId, leaderCode, inspectorName);
    if (res.success && res.auth) {
      onLeaderLogin(res.auth);
    } else {
      setLeaderError(res.error || 'كود الدخول غير صحيح');
    }
  };

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMaintenanceError(null);

    const res = await loginMaintenanceWithCode(maintenanceCode, technicianName, staffTrack);
    if (res.success && res.auth) {
      if (onMaintenanceLogin) {
        onMaintenanceLogin(res.auth);
      }
    } else {
      setMaintenanceError(res.error || 'كود الدخول غير صحيح');
    }
  };

  return (
    <div
      className={
        onClose
          ? 'fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex flex-col justify-center items-center p-4 overflow-y-auto'
          : 'min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4'
      }
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-2xl flex flex-col gap-5 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="text-center pb-3 border-b border-slate-100 flex flex-col items-center">
          <img
            src="./housing-logo.png"
            alt="شعار إدارة الإسكان الطلابي - جامعة الملك سعود"
            className="housing-brand-logo-card mb-2"
            style={{ height: '44px', width: 'auto', maxWidth: '140px', objectFit: 'contain' }}
          />
          <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
            برنامج الصيانة المكثفة ومتابعة المرافق والخدمات
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إسكان الطلاب بجامعة الملك سعود • 34 مبنى سكني
          </p>
        </div>

        {/* Mode Switcher (3 Roles) */}
        <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold gap-1">
          <button
            type="button"
            onClick={() => setMode('leader')}
            className={`py-2 px-1 rounded-lg transition ${
              mode === 'leader'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            رائد المبنى
          </button>
          <button
            type="button"
            onClick={() => setMode('maintenance')}
            className={`py-2 px-1 rounded-lg transition ${
              mode === 'maintenance'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الخدمات والمؤشرات
          </button>
          <button
            type="button"
            onClick={() => setMode('admin')}
            className={`py-2 px-1 rounded-lg transition ${
              mode === 'admin'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            المشرف العام
          </button>
        </div>

        {/* 1. Admin Form */}
        {mode === 'admin' && (
          <form onSubmit={handleAdminUnlock} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-700 font-bold">
                كلمة مرور المشرف:
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور..."
                  required
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pr-9 pl-4 py-2.5 placeholder-slate-400 focus:bg-white text-sm"
                />
              </div>
            </div>

            {adminError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {adminError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isLoading ? 'جاري التحقق...' : 'دخول المشرف'}</span>
            </button>
          </form>
        )}

        {/* 2. Maintenance, Cleaning & Pest Control, OR KPI Read-Only Viewer Form */}
        {mode === 'maintenance' && (
          <form onSubmit={handleMaintenanceSubmit} className="flex flex-col gap-4 text-xs">
            {/* Sub-selector: Maintenance vs Cleaning/Pest Control vs KPI Viewer */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 font-bold text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setStaffTrack('maintenance');
                  setMaintenanceError(null);
                }}
                className={`py-2 px-1.5 rounded-lg transition ${
                  staffTrack === 'maintenance'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                الصيانة (4 أقسام)
              </button>
              <button
                type="button"
                onClick={() => {
                  setStaffTrack('cleaning');
                  setMaintenanceError(null);
                }}
                className={`py-2 px-1.5 rounded-lg transition ${
                  staffTrack === 'cleaning'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                النظافة والآفات
              </button>
              <button
                type="button"
                onClick={() => {
                  setStaffTrack('viewer');
                  setMaintenanceError(null);
                }}
                className={`py-2 px-1.5 rounded-lg transition ${
                  staffTrack === 'viewer'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                متابعة المؤشرات (KPI)
              </button>
            </div>

            <div
              className={`rounded-xl p-3 text-[11px] leading-relaxed border ${
                staffTrack === 'cleaning'
                  ? 'bg-sky-50 border-sky-200 text-sky-900'
                  : staffTrack === 'viewer'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {staffTrack === 'cleaning' ? (
                <>
                  <strong>بوابة الخدمات (النظافة ومكافحة الحشرات والقوارض):</strong> تعرض فقط بلاغات النظافة والآفات مستقلة عن الصيانة، مع إرفاق صورة المعالجة لاعتماد رائد المبنى.
                </>
              ) : staffTrack === 'viewer' ? (
                <>
                  <strong>حساب متابعة الأداء والمؤشرات (عرض فقط بدون صلاحيات تعديل):</strong> يتيح استعراض لوحة المعلومات ومؤشرات أداء رواد المباني (KPI) ونسب إتمام المسح الشامل للمباني الـ 34 دون إمكانية تعديل أي بيانات في النظام.
                </>
              ) : (
                <>
                  <strong>بوابة الصيانة المكثفة وماكسمو (4 أقسام):</strong> تشمل السباكة، النجارة والمدني، الكهرباء، والتكييف والمصاعد، مع إرفاق صورة الإصلاح ورقم ماكسمو.
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-700 font-bold">
                {staffTrack === 'cleaning'
                  ? 'اسم مشرف / فني النظافة ومكافحة الآفات:'
                  : staffTrack === 'viewer'
                  ? 'اسم مسؤول المتابعة / المراقب (اختياري):'
                  : 'اسم فني / مسؤول الصيانة:'}
              </label>
              <input
                type="text"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder={
                  staffTrack === 'cleaning'
                    ? 'مثال: مشرف النظافة / فريق مكافحة الآفات...'
                    : staffTrack === 'viewer'
                    ? 'مثال: إدارة الإسكان / متابع مؤشرات الأداء...'
                    : 'مثال: م. خالد / فني السباكة والكهرباء...'
                }
                required={staffTrack !== 'viewer'}
                className="bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 placeholder-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-700 font-bold">
                {staffTrack === 'cleaning'
                  ? 'كود دخول النظافة والخدمات:'
                  : staffTrack === 'viewer'
                  ? 'كود دخول متابعة الأداء والمؤشرات (عرض فقط):'
                  : 'كود دخول الصيانة:'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={maintenanceCode}
                  onChange={(e) => setMaintenanceCode(e.target.value)}
                  placeholder={
                    staffTrack === 'cleaning'
                      ? 'أدخل كود دخول النظافة المعتمد من المشرف...'
                      : staffTrack === 'viewer'
                      ? 'أدخل كود متابعة المؤشرات (VW-...)...'
                      : 'أدخل كود دخول الصيانة المعتمد من المشرف...'
                  }
                  required
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pr-9 pl-4 py-2.5 placeholder-slate-400 font-mono"
                />
              </div>
            </div>

            {maintenanceError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {maintenanceError}
              </div>
            )}

            <button
              type="submit"
              className={`w-full py-2.5 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm ${
                staffTrack === 'cleaning'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : staffTrack === 'viewer'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>
                {staffTrack === 'cleaning'
                  ? 'دخول بوابة النظافة ومكافحة الآفات'
                  : staffTrack === 'viewer'
                  ? 'دخول لوحة مؤشرات الأداء والمتابعة (عرض فقط)'
                  : 'دخول بوابة الصيانة المكثفة'}
              </span>
            </button>
          </form>
        )}

        {/* 3. Leader Form */}
        {mode === 'leader' && (
          <form onSubmit={handleLeaderSubmit} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-700 font-bold">المبنى السكني:</label>
              <select
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 font-bold"
              >
                {Array.from({ length: 34 }, (_, i) => {
                  const num = i + 1;
                  const b = `B${num.toString().padStart(2, '0')}`;
                  return (
                    <option key={b} value={b}>
                      مبنى {num} ({b})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-700 font-bold">اسم رائد المبنى:</label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="اسمك المعتمد..."
                className="bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 placeholder-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-700 font-bold">كود الدخول المخصص لهذا المبنى:</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={leaderCode}
                  onChange={(e) => setLeaderCode(e.target.value)}
                  placeholder="أدخل كود الدخول المعتمد لمبناك..."
                  required
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pr-9 pl-4 py-2.5 placeholder-slate-400 font-mono"
                />
              </div>
            </div>

            {leaderError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {leaderError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              <span>دخول استمارة الفحص الميداني</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
