// ============================================================================
// تقييم ومتابعة مرافق مباني الإسكان الطلابي — التطبيق الرئيسي (Light Mode)
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  BuildingInfo,
  FixtureEvaluation,
  BuildingLeaderAuth,
  MaintenanceAuth,
  AdminFeatureFlags,
} from './types/hostel';
import { DEFAULT_BUILDINGS } from './config/buildings';
import { Navbar, AppViewMode } from './components/Common/Navbar';
import { CampusOverview } from './components/Dashboard/CampusOverview';
import { BuildingDetail } from './components/Dashboard/BuildingDetail';
import { LeadersKPIDashboard } from './components/Dashboard/LeadersKPIDashboard';
import { LeaderPortal } from './components/Inspector/LeaderPortal';
import { MaintenancePortal } from './components/Maintenance/MaintenancePortal';
import { OfficialReportModal } from './components/Reports/OfficialReportModal';
import { AdminGateway } from './components/Admin/AdminGateway';
import { AdminPanel } from './components/Admin/AdminPanel';
import {
  isAdminUnlocked,
  lockAdminWorkspace,
  getActiveLeaderAuth,
  getActiveMaintenanceAuth,
  exitImpersonation,
  getFeatureFlags,
  saveFeatureFlags,
} from './services/authService';
import {
  fetchAllEvaluations,
  subscribeToBuildingEvaluations,
} from './services/firestoreService';
import { calculateWingHealth, evaluationHasLeak } from './utils/healthScore';

function isViewAuthorized(
  view: AppViewMode,
  isAdmin: boolean,
  auth: BuildingLeaderAuth | null,
  maintenanceAuth: MaintenanceAuth | null
): boolean {
  switch (view) {
    case 'campus':
    case 'building_detail':
      return true;
    case 'leaders_kpi':
      return isAdmin || maintenanceAuth?.role === 'viewer';
    case 'leader_portal':
      return isAdmin || !!auth;
    case 'maintenance_portal':
      return isAdmin || (!!maintenanceAuth && maintenanceAuth.role !== 'viewer');
    case 'admin_panel':
      return isAdmin;
    default:
      return false;
  }
}

export function App() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isAdminUnlocked());
  const [auth, setAuth] = useState<BuildingLeaderAuth | null>(() => getActiveLeaderAuth());
  const [maintenanceAuth, setMaintenanceAuth] = useState<MaintenanceAuth | null>(() =>
    getActiveMaintenanceAuth()
  );
  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlags>(getFeatureFlags());

  const [activeView, setActiveView] = useState<AppViewMode>(() => {
    const adminNow = isAdminUnlocked();
    const leaderNow = getActiveLeaderAuth();
    const maintNow = getActiveMaintenanceAuth();
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('evaluate') && (adminNow || leaderNow)) {
        return 'leader_portal';
      }
      const saved = localStorage.getItem('hostels_active_view') as AppViewMode | null;
      if (
        saved &&
        [
          'campus',
          'leaders_kpi',
          'building_detail',
          'leader_portal',
          'maintenance_portal',
          'admin_panel',
        ].includes(saved) &&
        isViewAuthorized(saved, adminNow, leaderNow, maintNow)
      ) {
        return saved;
      }
    } catch {}
    if (maintNow) {
      return maintNow.role === 'viewer' ? 'leaders_kpi' : 'maintenance_portal';
    }
    if (leaderNow) return 'leader_portal';
    if (adminNow) return 'admin_panel';
    return 'campus';
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(() => {
    try {
      const adminNow = isAdminUnlocked();
      const activeAuth = getActiveLeaderAuth();
      if (activeAuth?.buildingId && !adminNow) {
        return activeAuth.buildingId;
      }

      const params = new URLSearchParams(window.location.search);
      const evalBld = params.get('evaluate')?.toUpperCase();
      if (evalBld && /^B\d{2}$/.test(evalBld)) return evalBld;

      if (activeAuth?.buildingId) return activeAuth.buildingId;
      const saved = localStorage.getItem('hostels_selected_building_id');
      if (saved) return saved;
    } catch {}
    return 'B14';
  });

  const [auditTarget, setAuditTarget] = useState<{ wingId?: number; floor?: number }>({});

  const [buildings, setBuildings] = useState<BuildingInfo[]>(DEFAULT_BUILDINGS);
  const [allEvaluations, setAllEvaluations] = useState<FixtureEvaluation[]>([]);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return !!params.get('evaluate') && !isAdminUnlocked() && !getActiveLeaderAuth();
    } catch {
      return false;
    }
  });
  const [loginInitialMode, setLoginInitialMode] = useState<'leader' | 'maintenance' | 'admin'>(
    'leader'
  );

  const handleNavigate = (view: AppViewMode, forceAuthorized = false) => {
    if (!forceAuthorized && !isViewAuthorized(view, isAdmin, auth, maintenanceAuth)) {
      const fallbackView: AppViewMode =
        maintenanceAuth?.role === 'viewer' ? 'leaders_kpi' : 'campus';
      setActiveView(fallbackView);
      try {
        localStorage.setItem('hostels_active_view', fallbackView);
      } catch {}
      return;
    }
    setActiveView(view);
    try {
      localStorage.setItem('hostels_active_view', view);
    } catch {}
  };

  const handleSelectBuilding = (bId: string) => {
    setSelectedBuildingId(bId);
    try {
      localStorage.setItem('hostels_selected_building_id', bId);
    } catch {}
  };

  useEffect(() => {
    loadAllEvaluations();

    const handleResetEvent = (e: any) => {
      const bId = e?.detail?.buildingId;
      if (bId) {
        setAllEvaluations((prev) => {
          const filtered = prev.filter(
            (item) => item?.buildingId && item.buildingId.toUpperCase() !== bId.toUpperCase()
          );
          updateBuildingsStats(filtered);
          return filtered;
        });
      }
      loadAllEvaluations();
    };

    window.addEventListener('hostels_building_reset', handleResetEvent);
    return () => {
      window.removeEventListener('hostels_building_reset', handleResetEvent);
    };
  }, []);

  const loadAllEvaluations = async () => {
    const evals = await fetchAllEvaluations();
    const cleanEvals = evals.filter((e) => !e.isDeleted);
    setAllEvaluations(cleanEvals);
    updateBuildingsStats(cleanEvals);
  };

  useEffect(() => {
    if (!selectedBuildingId) return;
    const unsubscribe = subscribeToBuildingEvaluations(
      selectedBuildingId,
      (buildingEvals) => {
        setAllEvaluations((prev) => {
          const others = prev.filter(
            (e) => e?.buildingId && e.buildingId !== selectedBuildingId && !e.isDeleted
          );
          const combined = [...others, ...buildingEvals.filter((e) => !e.isDeleted)];
          updateBuildingsStats(combined);
          return combined;
        });
      }
    );

    return () => unsubscribe();
  }, [selectedBuildingId]);

  const updateBuildingsStats = (evals: FixtureEvaluation[]) => {
    setBuildings((prev) =>
      prev.map((b) => {
        const bEvals = evals.filter((e) => e?.buildingId === b.id && !e.isDeleted);
        const health = calculateWingHealth(bEvals);
        const leaks = bEvals.filter((e) => e.status !== 'operational' && evaluationHasLeak(e)).length;
        const criticals = bEvals.filter((e) => e.status === 'broken').length;
        const warnings = bEvals.filter((e) => e.status === 'needs_maintenance').length;

        return {
          ...b,
          healthScore: health,
          status:
            health === null
              ? 'uninspected'
              : health >= 80
              ? 'good'
              : health >= 50
              ? 'warning'
              : 'critical',
          stats: {
            totalEvaluations: bEvals.length,
            criticalIssues: criticals,
            warningIssues: warnings,
            waterLeaks: leaks,
            activeDefectsCount: criticals + warnings,
          },
        };
      })
    );
  };

  const handleAdminUnlocked = () => {
    setIsAdmin(true);
    setAuth(null);
    setMaintenanceAuth(null);
    setShowLoginModal(false);
    handleNavigate('admin_panel', true);
  };

  const handleLeaderLogin = (leaderAuth: BuildingLeaderAuth) => {
    setIsAdmin(false);
    setAuth(leaderAuth);
    setMaintenanceAuth(null);
    setShowLoginModal(false);
    handleSelectBuilding(leaderAuth.buildingId);
    handleNavigate('leader_portal', true);
  };

  const handleMaintenanceLogin = (mAuth: MaintenanceAuth) => {
    setIsAdmin(false);
    setAuth(null);
    setMaintenanceAuth(mAuth);
    setShowLoginModal(false);
    handleNavigate(mAuth.role === 'viewer' ? 'leaders_kpi' : 'maintenance_portal', true);
  };

  const handleImpersonate = (impersonatedAuth: BuildingLeaderAuth) => {
    setAuth(impersonatedAuth);
    setMaintenanceAuth(null);
    handleSelectBuilding(impersonatedAuth.buildingId);
    handleNavigate('leader_portal', true);
  };

  const handleExitImpersonation = () => {
    exitImpersonation();
    setAuth(null);
    handleNavigate('admin_panel', true);
  };

  const handleLockSession = () => {
    lockAdminWorkspace();
    setIsAdmin(false);
    setAuth(null);
    setMaintenanceAuth(null);
    setShowReportModal(false);
    handleNavigate('campus', true);
  };

  const handleUpdateFeatureFlags = (newFlags: AdminFeatureFlags) => {
    setFeatureFlags(newFlags);
    saveFeatureFlags(newFlags);
  };

  const handleOpenLogin = (mode: 'leader' | 'maintenance' | 'admin' = 'leader') => {
    setLoginInitialMode(mode);
    setShowLoginModal(true);
  };

  const isLocked = !isAdmin && !auth && !maintenanceAuth && !featureFlags.enablePublicView;

  if (isLocked) {
    return (
      <AdminGateway
        onAdminUnlocked={handleAdminUnlocked}
        onLeaderLogin={handleLeaderLogin}
        onMaintenanceLogin={handleMaintenanceLogin}
        initialMode={loginInitialMode}
        initialBuildingId={selectedBuildingId}
      />
    );
  }

  const currentBuilding = buildings.find((b) => b.id === selectedBuildingId) || buildings[0];
  const currentBuildingEvals = allEvaluations.filter((e) => e.buildingId === selectedBuildingId);

  const isViewerRole = maintenanceAuth?.role === 'viewer' && !isAdmin;
  const isOwnLeaderBuilding =
    !!auth && auth.buildingId.toUpperCase() === currentBuilding.id.toUpperCase();
  const canEditCurrentBuilding = isAdmin || isOwnLeaderBuilding;
  const canViewSensitiveDetails = isAdmin || isViewerRole || isOwnLeaderBuilding;
  const canOpenOfficialReport =
    featureFlags.enableOfficialReports && (isAdmin || isViewerRole || !!auth);

  const pendingEvalCount =
    isAdmin || auth
      ? allEvaluations.filter(
          (e) =>
            !e.isDeleted &&
            e.buildingId === (auth?.buildingId || selectedBuildingId) &&
            e.maintenanceTicket?.status === 'pending_evaluation'
        ).length
      : 0;

  // Enforce activeView validity synchronously so unauthorized screens can NEVER render
  const effectiveView: AppViewMode = isViewAuthorized(
    activeView,
    isAdmin,
    auth,
    maintenanceAuth
  )
    ? activeView
    : isViewerRole
    ? 'leaders_kpi'
    : 'campus';

  const leaderPortalBuildingId =
    !isAdmin && auth ? auth.buildingId : selectedBuildingId;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      <Navbar
        activeView={effectiveView}
        isAdmin={isAdmin}
        auth={auth}
        maintenanceAuth={maintenanceAuth}
        featureFlags={featureFlags}
        pendingEvaluationCount={pendingEvalCount}
        onNavigate={handleNavigate}
        onOpenReportModal={() => {
          if (canOpenOfficialReport) setShowReportModal(true);
        }}
        onOpenLogin={handleOpenLogin}
        onExitImpersonation={handleExitImpersonation}
        onLockSession={handleLockSession}
      />

      <main className="flex-1 p-3 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-8">
        {effectiveView === 'campus' && (
          <CampusOverview
            buildings={buildings}
            allEvaluations={allEvaluations}
            onSelectBuilding={(bId) => {
              handleSelectBuilding(bId);
              handleNavigate('building_detail');
            }}
            onOpenReportModal={() => {
              if (canOpenOfficialReport) setShowReportModal(true);
            }}
            onOpenLogin={() => handleOpenLogin('leader')}
            isAuthenticated={isAdmin || !!auth || !!maintenanceAuth}
            canOpenReport={canOpenOfficialReport}
          />
        )}

        {effectiveView === 'leaders_kpi' && (isAdmin || isViewerRole) && (
          <LeadersKPIDashboard
            buildings={buildings}
            allEvaluations={allEvaluations}
            isReadOnlyViewer={isViewerRole}
            viewerName={maintenanceAuth?.technicianName}
            onSelectBuilding={(bId) => {
              handleSelectBuilding(bId);
              handleNavigate('building_detail');
            }}
          />
        )}

        {effectiveView === 'building_detail' && (
          <BuildingDetail
            building={currentBuilding}
            evaluations={currentBuildingEvals}
            onBack={() => handleNavigate('campus')}
            onOpenAudit={(wingId, floor) => {
              if (canEditCurrentBuilding) {
                setAuditTarget({ wingId, floor });
                handleNavigate('leader_portal');
              } else if (!isViewerRole) {
                handleOpenLogin('leader');
              }
            }}
            onOpenReport={() => {
              if (canOpenOfficialReport) setShowReportModal(true);
            }}
            isAuthenticated={canEditCurrentBuilding}
            canViewSensitiveDetails={canViewSensitiveDetails}
            canOpenReport={canOpenOfficialReport && (isAdmin || isViewerRole || isOwnLeaderBuilding)}
            canResolveTimeline={canEditCurrentBuilding}
            isViewerOnly={isViewerRole}
            currentUserName={
              auth?.leaderName ||
              (isAdmin ? 'المشرف العام' : maintenanceAuth?.technicianName || 'إدارة الإسكان')
            }
            onOpenLogin={!isViewerRole ? () => handleOpenLogin('leader') : undefined}
          />
        )}

        {effectiveView === 'leader_portal' && (isAdmin || !!auth) && (
          <LeaderPortal
            buildings={buildings}
            activeBuildingId={leaderPortalBuildingId}
            evaluations={allEvaluations}
            inspectorName={auth?.leaderName || 'المشرف العام'}
            isAdmin={isAdmin}
            initialWingId={auditTarget.wingId}
            initialFloor={auditTarget.floor}
            onChangeBuilding={(bId) => {
              if (isAdmin) handleSelectBuilding(bId);
            }}
            onRefreshEvaluations={loadAllEvaluations}
            isReadOnly={false}
            onOpenLogin={() => handleOpenLogin('leader')}
          />
        )}

        {effectiveView === 'maintenance_portal' &&
          (isAdmin || (!!maintenanceAuth && maintenanceAuth.role !== 'viewer')) && (
            <MaintenancePortal
              buildings={buildings}
              allEvaluations={allEvaluations}
              technicianName={
                maintenanceAuth?.technicianName ||
                (isAdmin ? 'المشرف العام (إدارة الصيانة والخدمات)' : 'فريق الصيانة')
              }
              portalRole={maintenanceAuth?.role === 'cleaning' ? 'cleaning' : 'maintenance'}
              isAdmin={isAdmin}
              onRefreshEvaluations={loadAllEvaluations}
            />
          )}

        {effectiveView === 'admin_panel' && isAdmin && (
          <AdminPanel
            featureFlags={featureFlags}
            onUpdateFeatureFlags={handleUpdateFeatureFlags}
            onImpersonateLeader={handleImpersonate}
            onBackToDashboard={() => handleNavigate('campus')}
            allEvaluations={allEvaluations}
            onRefreshEvaluations={loadAllEvaluations}
          />
        )}
      </main>

      {showReportModal && canOpenOfficialReport && (
        <OfficialReportModal
          buildings={buildings}
          allEvaluations={allEvaluations}
          scopedBuildingId={!isAdmin && auth ? auth.buildingId : undefined}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {showLoginModal && (
        <AdminGateway
          onAdminUnlocked={handleAdminUnlocked}
          onLeaderLogin={handleLeaderLogin}
          onMaintenanceLogin={handleMaintenanceLogin}
          initialMode={loginInitialMode}
          initialBuildingId={selectedBuildingId}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}

export default App;
