// ============================================================================
// 🧭 شريط التنقل الرئيسي (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React from 'react';
import { BuildingLeaderAuth, AdminFeatureFlags } from '../../types/hostel';
import {
  Sliders,
  LogOut,
  AlertCircle,
  Lock,
  LogIn,
} from 'lucide-react';

interface NavbarProps {
  activeView: 'campus' | 'leader_portal' | 'building_detail' | 'admin_panel';
  isAdmin: boolean;
  auth: BuildingLeaderAuth | null;
  featureFlags: AdminFeatureFlags;
  onNavigate: (view: 'campus' | 'leader_portal' | 'admin_panel') => void;
  onOpenReportModal: () => void;
  onOpenLogin?: () => void;
  onExitImpersonation: () => void;
  onLockSession: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  isAdmin,
  auth,
  featureFlags,
  onNavigate,
  onOpenReportModal,
  onOpenLogin,
  onExitImpersonation,
  onLockSession,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm print:hidden">
      {/* 1. Impersonation Banner */}
      {auth?.isImpersonated && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>
              أنت الآن بوضع <strong>تقمص دور رائد {auth.buildingId}</strong> ({auth.leaderName})
            </span>
          </div>
          <button
            onClick={onExitImpersonation}
            className="px-3 py-1 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition"
          >
            إنهاء التقمص والعودة للمشرف
          </button>
        </div>
      )}

      {/* 2. Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Exact Official Title + Housing Logo */}
        <div
          onClick={() => onNavigate('campus')}
          className="cursor-pointer flex items-center gap-3 text-right"
        >
          <img
            src="./housing-logo.png"
            alt="شعار إدارة الإسكان الطلابي - جامعة الملك سعود"
            className="housing-brand-logo-nav"
            style={{ height: '36px', width: 'auto', maxWidth: '130px', objectFit: 'contain' }}
          />
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
              تقييم ومتابعة مرافق مباني الإسكان الطلابي
            </h1>
            <p className="text-[11px] text-slate-500">
              جامعة الملك سعود • عمادة شؤون الطلاب
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => onNavigate('campus')}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              activeView === 'campus' || activeView === 'building_detail'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            نظرة عامة ومجسم 3D
          </button>

          {(featureFlags.enableLeaderAudits || isAdmin || auth) && (
            <button
              onClick={() => {
                if (isAdmin || auth) {
                  onNavigate('leader_portal');
                } else {
                  onOpenLogin?.();
                }
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeView === 'leader_portal'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title={!isAdmin && !auth ? 'تسجيل الدخول كـ رائد مبنى مطلوب لتعبئة الفحص الميداني' : ''}
            >
              {!isAdmin && !auth && <Lock className="w-3.5 h-3.5 text-slate-400" />}
              <span>استمارة الفحص الميداني</span>
            </button>
          )}

          {featureFlags.enableOfficialReports && (
            <button
              onClick={onOpenReportModal}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold transition"
            >
              التقرير الرسمي
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => onNavigate('admin_panel')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeView === 'admin_panel'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>لوحة المشرف</span>
            </button>
          )}
        </nav>

        {/* Right Side Session */}
        <div className="flex items-center gap-2 text-xs">
          {auth ? (
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
              <span className="text-slate-800 font-bold">{auth.leaderName}</span>
              <button
                onClick={onLockSession}
                className="text-slate-500 hover:text-rose-600 mr-1"
                title="تسجيل الخروج"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : isAdmin ? (
            <button
              onClick={onLockSession}
              className="flex items-center gap-1.5 text-slate-600 hover:text-rose-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition"
              title="قفل لوحة التحكم"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>قفل النظام</span>
            </button>
          ) : onOpenLogin ? (
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>دخول المشرف / الرواد</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};
