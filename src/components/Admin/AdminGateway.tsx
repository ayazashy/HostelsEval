// ============================================================================
// 🔒 تقييم ومتابعة مرافق مباني الإسكان الطلابي — بوابة الدخول (Light Mode)
// ============================================================================

import React, { useState } from 'react';
import { unlockAdminWorkspace, loginBuildingLeaderWithCode } from '../../services/authService';
import { BuildingLeaderAuth } from '../../types/hostel';
import { Lock, KeyRound, ArrowLeft, ShieldCheck, X } from 'lucide-react';

interface AdminGatewayProps {
  onAdminUnlocked: () => void;
  onLeaderLogin: (auth: BuildingLeaderAuth) => void;
  onClose?: () => void;
}

export const AdminGateway: React.FC<AdminGatewayProps> = ({
  onAdminUnlocked,
  onLeaderLogin,
  onClose,
}) => {
  const [mode, setMode] = useState<'admin' | 'leader'>('admin');

  // Admin states
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Leader states
  const [buildingId, setBuildingId] = useState('B14');
  const [leaderCode, setLeaderCode] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [leaderError, setLeaderError] = useState<string | null>(null);

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

  const handleLeaderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLeaderError(null);

    const res = loginBuildingLeaderWithCode(buildingId, leaderCode, inspectorName);
    if (res.success && res.auth) {
      onLeaderLogin(res.auth);
    } else {
      setLeaderError(res.error || 'كود الدخول غير صحيح');
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
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6 relative">
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
            src="/housing-logo.png"
            alt="شعار إدارة الإسكان الطلابي - جامعة الملك سعود"
            className="housing-brand-logo-card mb-2"
            style={{ height: '44px', width: 'auto', maxWidth: '140px', objectFit: 'contain' }}
          />
          <h1 className="text-lg font-bold text-slate-900 leading-snug">
            تقييم ومتابعة مرافق مباني الإسكان الطلابي
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            جامعة الملك سعود • عمادة شؤون الطلاب • 34 مبنى سكني
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMode('admin')}
            className={`py-2 rounded-lg transition ${
              mode === 'admin'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            بوابة المشرف
          </button>
          <button
            type="button"
            onClick={() => setMode('leader')}
            className={`py-2 rounded-lg transition ${
              mode === 'leader'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            دخول رائد المبنى
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
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isLoading ? 'جاري التحقق...' : 'دخول المشرف'}</span>
            </button>
          </form>
        )}

        {/* 2. Leader Form */}
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
