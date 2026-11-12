// ============================================================================
// 🏢 تقييم ومتابعة مرافق مباني الإسكان الطلابي — التطبيق الرئيسي (Light Mode)
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
import { calculateWingHealth } from './utils/healthScore';

export function App() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isAdminUnlocked());
  const [auth, setAuth] = useState<BuildingLeaderAuth | null>(() => getActiveLeaderAuth());
  const [maintenanceAuth, setMaintenanceAuth] = useState<MaintenanceAuth | null>(() =>
    getActiveMaintenanceAuth()
  );
  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlags>(getFeatureFlags());

  const [activeView, setActiveView] = useState<AppViewMode>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('evaluate')) {
        return 'leader_portal';
      }
      const saved = localStorage.getItem('hostels_active_view');
      if (
        saved &&
        [
          'campus',
          'leaders_kpi',
          'building_detail',
          'leader_portal',
          'maintenance_portal',
          'admin_panel',
        ].includes(saved)
      ) {
        if (saved === 'admin_panel' && !isAdminUnlocked()) return 'campus';
        const activeMaint = getActiveMaintenanceAuth();
        if (
          saved === 'maintenance_portal' &&
          !isAdminUnlocked() &&
          (!activeMaint || activeMaint.role === 'viewer')
        ) {
          return activeMaint?.role === 'viewer' ? 'leaders_kpi' : 'campus';
        }
        return saved as AppViewMode;
      }
    } catch {}
    const initialMaint = getActiveMaintenanceAuth();
    if (initialMaint) {
      return initialMaint.role === 'viewer' ? 'leaders_kpi' : 'maintenance_portal';
    }
    if (getActiveLeaderAuth()) return 'leader_portal';
    if (isAdminUnlocked()) return 'admin_panel';
    return 'campus';
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const evalBld = params.get('evaluate')?.toUpperCase();
      if (evalBld && /^B\d{2}$/.test(evalBld)) return evalBld;

      const activeAuth = getActiveLeaderAuth();
      if (activeAuth?.buildingId) return activeAuth.buildingId;
      const saved = localStorage.getItem('hostels_selected_building_id');
      if (saved) return saved;
    } catch {}
    return 'B14';
  });

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

  const handleNavigate = (view: AppViewMode) => {
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
        const leaks = bEvals.filter((e) => e.defects && e.defects.includes('leak')).length;
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
            activeDefectsCount: leaks + criticals + warnings,
          },
        };
      })
    );
  };

  const handleAdminUnlocked = () => {
    setIsAdmin(true);
    setShowLoginModal(false);
    handleNavigate('admin_panel');
  };

  const handleLeaderLogin = (leaderAuth: BuildingLeaderAuth) => {
    setAuth(leaderAuth);
    setShowLoginModal(false);
    handleSelectBuilding(leaderAuth.buildingId);
    handleNavigate('leader_portal');
  };

  const handleMaintenanceLogin = (mAuth: MaintenanceAuth) => {
    setMaintenanceAuth(mAuth);
    setShowLoginModal(false);
    handleNavigate(mAuth.role === 'viewer' ? 'leaders_kpi' : 'maintenance_portal');
  };

  const handleImpersonate = (impersonatedAuth: BuildingLeaderAuth) => {
    setAuth(impersonatedAuth);
    handleSelectBuilding(impersonatedAuth.buildingId);
    handleNavigate('leader_portal');
  };

  const handleExitImpersonation = () => {
    exitImpersonation();
    setAuth(null);
    handleNavigate('admin_panel');
  };

  const handleLockSession = () => {
    lockAdminWorkspace();
    setIsAdmin(false);
    setAuth(null);
    setMaintenanceAuth(null);
    handleNavigate('campus');
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
  const pendingEvalCount = currentBuildingEvals.filter(
    (e) => !e.isDeleted && e.maintenanceTicket?.status === 'pending_evaluation'
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      <Navbar
        activeView={activeView}
        isAdmin={isAdmin}
        auth={auth}
        maintenanceAuth={maintenanceAuth}
        featureFlags={featureFlags}
        pendingEvaluationCount={pendingEvalCount}
        onNavigate={handleNavigate}
        onOpenReportModal={() => setShowReportModal(true)}
        onOpenLogin={handleOpenLogin}
        onExitImpersonation={handleExitImpersonation}
        onLockSession={handleLockSession}
      />

      <main className="flex-1 p-3 sm:p-6 md:p-8">
        {activeView === 'campus' && (
          <CampusOverview
            buildings={buildings}
            allEvaluations={allEvaluations}
            onSelectBuilding={(bId) => {
              handleSelectBuilding(bId);
              handleNavigate('building_detail');
            }}
            onOpenReportModal={() => setShowReportModal(true)}
            onOpenLogin={() => handleOpenLogin('leader')}
            isAuthenticated={isAdmin || !!auth || !!maintenanceAuth}
          />
        )}

        {activeView === 'leaders_kpi' && (
          <LeadersKPIDashboard
            buildings={buildings}
            allEvaluations={allEvaluations}
            isReadOnlyViewer={maintenanceAuth?.role === 'viewer' && !isAdmin}
            viewerName={maintenanceAuth?.technicianName}
            onSelectBuilding={(bId) => {
              handleSelectBuilding(bId);
              handleNavigate('building_detail');
            }}
          />
        )}

        {activeView === 'building_detail' && (
          <BuildingDetail
            building={currentBuilding}
            evaluations={currentBuildingEvals}
            onBack={() => handleNavigate('campus')}
            onOpenAudit={() => {
              if (maintenanceAuth?.role === 'viewer' && !isAdmin && !auth) {
                handleNavigate('leader_portal');
              } else if (isAdmin || auth) {
                handleNavigate('leader_portal');
              } else {
                handleOpenLogin('leader');
              }
            }}
            onOpenReport={() => setShowReportModal(true)}
            isAuthenticated={isAdmin || !!auth}
            onOpenLogin={() => handleOpenLogin('leader')}
          />
        )}

        {activeView === 'leader_portal' && (
          <LeaderPortal
            buildings={buildings}
            activeBuildingId={selectedBuildingId}
            evaluations={allEvaluations}
            inspectorName={
              auth?.leaderName || (isAdmin ? 'المشرف العام' : 'زائر عام (معاينة فقط)')
            }
            onChangeBuilding={handleSelectBuilding}
            onRefreshEvaluations={loadAllEvaluations}
            isReadOnly={!isAdmin && !auth}
            onOpenLogin={() => handleOpenLogin('leader')}
          />
        )}

        {activeView === 'maintenance_portal' && (
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

        {activeView === 'admin_panel' && isAdmin && (
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

      {showReportModal && (
        <OfficialReportModal
          buildings={buildings}
          allEvaluations={allEvaluations}
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
