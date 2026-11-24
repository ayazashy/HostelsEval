// ============================================================================
// شريط التنقل المتجاوب للجوال وسطح المكتب (Mobile-First Navbar + Bottom Bar)
// ============================================================================

import React from 'react';
import {
  BuildingLeaderAuth,
  MaintenanceAuth,
  AdminFeatureFlags,
} from '../../types/hostel';
import {
  Sliders,
  LogOut,
  AlertCircle,
  Lock,
  LogIn,
  Wrench,
  Building2,
  ClipboardCheck,
  FileText,
  BarChart3,
  Eye,
} from 'lucide-react';

export type AppViewMode =
  | 'campus'
  | 'leaders_kpi'
  | 'leader_portal'
  | 'maintenance_portal'
  | 'building_detail'
  | 'admin_panel';

interface NavbarProps {
  activeView: AppViewMode;
  isAdmin: boolean;
  auth: BuildingLeaderAuth | null;
  maintenanceAuth: MaintenanceAuth | null;
  featureFlags: AdminFeatureFlags;
  pendingEvaluationCount?: number;
  onNavigate: (view: AppViewMode) => void;
  onOpenReportModal: () => void;
  onOpenLogin?: (mode?: 'leader' | 'maintenance' | 'admin') => void;
  onExitImpersonation: () => void;
  onLockSession: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  isAdmin,
  auth,
  maintenanceAuth,
  featureFlags,
  pendingEvaluationCount = 0,
  onNavigate,
  onOpenReportModal,
  onOpenLogin,
  onExitImpersonation,
  onLockSession,
}) => {
  const isViewerOnly = maintenanceAuth?.role === 'viewer' && !isAdmin;
  const isTechStaff = !!maintenanceAuth && maintenanceAuth.role !== 'viewer' && !isAdmin;
  const isLeaderStaff = !!auth && !isAdmin;
  const isPublicGuest = !isAdmin && !auth && !maintenanceAuth;

  const canViewKPI = isAdmin || isViewerOnly;
  const showLeaderTab = isAdmin || isLeaderStaff || isPublicGuest;
  const showMaintenanceTab = isAdmin || isTechStaff || isPublicGuest;
  const canOpenOfficialReport =
    featureFlags.enableOfficialReports && (isAdmin || isViewerOnly || isLeaderStaff);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs print:hidden">
        {/* 1. Impersonation Banner */}
        {auth?.isImpersonated && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="leading-snug">
                تقمص دور <strong>رائد {auth.buildingId}</strong> ({auth.leaderName})
              </span>
            </div>
            <button
              onClick={onExitImpersonation}
              className="px-2.5 py-1 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition shrink-0"
            >
              إنهاء التقمص
            </button>
          </div>
        )}

        {/* 2. Main Top Bar */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
          {/* Logo & Title */}
          <div
            onClick={() => onNavigate('campus')}
            className="cursor-pointer flex items-center gap-2 text-right min-w-0 flex-1"
          >
            <img
              src="./housing-logo.png"
              alt="شعار إدارة الإسكان الطلابي"
              className="housing-brand-logo-nav shrink-0"
              style={{ height: '30px', width: 'auto', maxWidth: '105px', objectFit: 'contain' }}
            />
            <div className="min-w-0">
              <h1 className="text-[11px] sm:text-sm md:text-base font-bold text-slate-900 tracking-tight leading-snug">
                برنامج الصيانة المكثفة ومتابعة مرافق الإسكان
              </h1>
              <p className="text-[10px] text-slate-500 hidden sm:block leading-snug">
                جامعة الملك سعود • عمادة شؤون الطلاب
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs (Hidden on small phones, shown in bottom bar on mobile) */}
          <nav className="hidden md:flex items-center gap-1.5 text-xs">
            <button
              onClick={() => onNavigate('campus')}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                activeView === 'campus' || activeView === 'building_detail'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>مجمع المباني (34)</span>
            </button>

            {canViewKPI && (
              <button
                onClick={() => onNavigate('leaders_kpi')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                  activeView === 'leaders_kpi'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>مؤشرات أداء الرواد (KPI)</span>
              </button>
            )}

            {showLeaderTab && (
              <button
                onClick={() => {
                  if (isAdmin || auth) {
                    onNavigate('leader_portal');
                  } else {
                    onOpenLogin?.('leader');
                  }
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 relative ${
                  activeView === 'leader_portal'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>فحص رائد المبنى</span>
                {pendingEvaluationCount > 0 && (isAdmin || auth) && (
                  <span className="px-1.5 py-0.2 bg-purple-600 text-white text-[10px] rounded-full animate-pulse">
                    {pendingEvaluationCount}
                  </span>
                )}
              </button>
            )}

            {showMaintenanceTab && (
              <button
                onClick={() => {
                  if (isAdmin || (maintenanceAuth && maintenanceAuth.role !== 'viewer')) {
                    onNavigate('maintenance_portal');
                  } else {
                    onOpenLogin?.('maintenance');
                  }
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                  activeView === 'maintenance_portal'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>
                  {maintenanceAuth?.role === 'cleaning'
                    ? 'بوابة النظافة والآفات'
                    : 'بوابة الصيانة والخدمات'}
                </span>
              </button>
            )}

            {canOpenOfficialReport && (
              <button
                onClick={onOpenReportModal}
                className="px-3 py-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold transition flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isLeaderStaff ? 'تقرير مبناك' : 'التقرير الرسمي'}</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => onNavigate('admin_panel')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                  activeView === 'admin_panel'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>المشرف</span>
              </button>
            )}
          </nav>

          {/* Session / Login Control */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            {auth ? (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-xl">
                <span className="text-blue-900 font-bold text-[11px] leading-snug">
                  {auth.leaderName} ({auth.buildingId})
                </span>
                <button
                  onClick={onLockSession}
                  className="text-slate-500 hover:text-rose-600 p-0.5 shrink-0"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : maintenanceAuth ? (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${
                  maintenanceAuth.role === 'viewer'
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                {maintenanceAuth.role === 'viewer' ? (
                  <Eye className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                ) : (
                  <Wrench className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                )}
                <span
                  className={`font-bold text-[11px] leading-snug ${
                    maintenanceAuth.role === 'viewer' ? 'text-indigo-900' : 'text-emerald-900'
                  }`}
                >
                  {maintenanceAuth.technicianName}
                </span>
                <button
                  onClick={onLockSession}
                  className="text-slate-500 hover:text-rose-600 p-0.5 shrink-0"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : isAdmin ? (
              <button
                onClick={onLockSession}
                className="flex items-center gap-1 text-slate-700 hover:text-rose-600 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl font-bold transition"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>خروج المشرف</span>
              </button>
            ) : (
              <button
                onClick={() => onOpenLogin?.('leader')}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>تسجيل الدخول</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 3. Mobile Bottom Navigation Bar (Thumb-Friendly for Phone Users - Full Uncut Labels) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-300 px-1 py-1.5 flex items-stretch justify-around gap-1 print:hidden"
        style={{
          boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.08)',
          paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          onClick={() => onNavigate('campus')}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition ${
            activeView === 'campus' || activeView === 'building_detail'
              ? 'text-blue-600 bg-blue-50/80'
              : 'text-slate-500'
          }`}
        >
          <Building2 className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="leading-tight text-center">المباني</span>
        </button>

        {canViewKPI && (
          <button
            type="button"
            onClick={() => onNavigate('leaders_kpi')}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition ${
              activeView === 'leaders_kpi'
                ? 'text-indigo-700 bg-indigo-50/80'
                : 'text-slate-500'
            }`}
          >
            <BarChart3 className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="leading-tight text-center">المؤشرات</span>
          </button>
        )}

        {showLeaderTab && (
          <button
            type="button"
            onClick={() => {
              if (isAdmin || auth) {
                onNavigate('leader_portal');
              } else {
                onOpenLogin?.('leader');
              }
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition ${
              activeView === 'leader_portal'
                ? 'text-blue-600 bg-blue-50/80'
                : 'text-slate-500'
            }`}
          >
            <span className="relative inline-flex items-center justify-center mb-0.5">
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              {pendingEvaluationCount > 0 && (isAdmin || auth) && (
                <span className="absolute -top-1.5 -left-2.5 w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] flex items-center justify-center">
                  {pendingEvaluationCount}
                </span>
              )}
            </span>
            <span className="leading-tight text-center">رائد المبنى</span>
          </button>
        )}

        {showMaintenanceTab && (
          <button
            type="button"
            onClick={() => {
              if (isAdmin || (maintenanceAuth && maintenanceAuth.role !== 'viewer')) {
                onNavigate('maintenance_portal');
              } else {
                onOpenLogin?.('maintenance');
              }
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition ${
              activeView === 'maintenance_portal'
                ? 'text-emerald-700 bg-emerald-50/80'
                : 'text-slate-500'
            }`}
          >
            <Wrench className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="leading-tight text-center">
              {maintenanceAuth?.role === 'cleaning' ? 'النظافة' : 'الصيانة'}
            </span>
          </button>
        )}

        {isAdmin ? (
          <button
            type="button"
            onClick={() => onNavigate('admin_panel')}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition ${
              activeView === 'admin_panel'
                ? 'text-slate-900 bg-slate-100'
                : 'text-slate-500'
            }`}
          >
            <Sliders className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="leading-tight text-center">المشرف</span>
          </button>
        ) : canOpenOfficialReport ? (
          <button
            type="button"
            onClick={onOpenReportModal}
            className="flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold text-slate-500"
          >
            <FileText className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="leading-tight text-center">التقرير</span>
          </button>
        ) : isPublicGuest ? (
          <button
            type="button"
            onClick={() => onOpenLogin?.('leader')}
            className="flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold text-blue-600"
          >
            <LogIn className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="leading-tight text-center">دخول</span>
          </button>
        ) : null}
      </nav>
    </>
  );
};
