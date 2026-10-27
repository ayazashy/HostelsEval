// ============================================================================
// 🏢 تقييم ومتابعة مرافق مباني الإسكان الطلابي — التطبيق الرئيسي (Light Mode)
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  BuildingInfo,
  FixtureEvaluation,
  BuildingLeaderAuth,
  AdminFeatureFlags,
} from './types/hostel';
import { DEFAULT_BUILDINGS } from './config/buildings';
import { Navbar } from './components/Common/Navbar';
import { CampusOverview } from './components/Dashboard/CampusOverview';
import { BuildingDetail } from './components/Dashboard/BuildingDetail';
import { LeaderPortal } from './components/Inspector/LeaderPortal';
import { OfficialReportModal } from './components/Reports/OfficialReportModal';
import { AdminGateway } from './components/Admin/AdminGateway';
import { AdminPanel } from './components/Admin/AdminPanel';
import {
  isAdminUnlocked,
  lockAdminWorkspace,
  getActiveLeaderAuth,
  exitImpersonation,
  getFeatureFlags,
  saveFeatureFlags,
} from './services/authService';
import {
  fetchAllEvaluations,
  subscribeToBuildingEvaluations,
  saveEvaluation,
  saveToLocalCache,
} from './services/firestoreService';
import { calculateWingHealth } from './utils/healthScore';
import { ErrorBoundary } from './components/Common/ErrorBoundary';

export function App() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isAdminUnlocked());
  const [auth, setAuth] = useState<BuildingLeaderAuth | null>(() => getActiveLeaderAuth());
  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlags>(getFeatureFlags());

  const [activeView, setActiveView] = useState<'campus' | 'building_detail' | 'leader_portal' | 'admin_panel'>(() => {
    try {
      const saved = localStorage.getItem('hostels_active_view');
      if (saved && ['campus', 'building_detail', 'leader_portal', 'admin_panel'].includes(saved)) {
        if (saved === 'admin_panel' && !isAdminUnlocked()) return 'campus';
        return saved as any;
      }
    } catch {}
    if (getActiveLeaderAuth()) return 'leader_portal';
    if (isAdminUnlocked()) return 'admin_panel';
    return 'campus';
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(() => {
    try {
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
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  const handleNavigate = (view: 'campus' | 'building_detail' | 'leader_portal' | 'admin_panel') => {
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
  }, []);

  const loadAllEvaluations = async () => {
    const evals = await fetchAllEvaluations();
    if (evals.length === 0) {
      seedInitialEvaluations();
    } else {
      setAllEvaluations(evals);
      updateBuildingsStats(evals);
    }
  };

  const seedInitialEvaluations = async () => {
    const samples: FixtureEvaluation[] = [
      {
        id: 'B14-W2-F3-BTH-SNK-01',
        buildingId: 'B14',
        wingId: 2,
        floor: 3,
        categoryCode: 'BTH',
        fixtureTypeCode: 'SNK',
        fixtureIndex: 1,
        status: 'broken',
        defects: ['leak', 'rust', 'detached'],
        notes: 'الحنفية مخلوعة وتسرب مياه باستمرار أسفل المغسلة',
        rating: 1,
        hasPhoto: false,
        inspectorName: 'سليمان - رائد مبنى 14',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'B14-W2-F3-BTH-TOI-01',
        buildingId: 'B14',
        wingId: 2,
        floor: 3,
        categoryCode: 'BTH',
        fixtureTypeCode: 'TOI',
        fixtureIndex: 1,
        status: 'broken',
        defects: ['leak', 'bad_odor'],
        notes: 'تسريب مستمر من السيفون ورائحة كريهة',
        rating: 1,
        hasPhoto: false,
        inspectorName: 'سليمان - رائد مبنى 14',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'B03-W4-F1-BTH-TOI-02',
        buildingId: 'B03',
        wingId: 4,
        floor: 1,
        categoryCode: 'BTH',
        fixtureTypeCode: 'TOI',
        fixtureIndex: 2,
        status: 'broken',
        defects: ['broken', 'clogged'],
        notes: 'المرحاض مسدود وخارج الخدمة تماماً',
        rating: 1,
        hasPhoto: false,
        inspectorName: 'رائد مبنى 3',
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const item of samples) {
      saveToLocalCache(item);
    }
    setAllEvaluations(samples);
    updateBuildingsStats(samples);

    if (isAdminUnlocked() || getActiveLeaderAuth()) {
      for (const item of samples) {
        await saveEvaluation(item);
      }
    }
  };

  useEffect(() => {
    if (!selectedBuildingId) return;
    const unsubscribe = subscribeToBuildingEvaluations(
      selectedBuildingId,
      (buildingEvals) => {
        setAllEvaluations((prev) => {
          const others = prev.filter((e) => e?.buildingId && e.buildingId !== selectedBuildingId);
          const combined = [...others, ...buildingEvals];
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
        const bEvals = evals.filter((e) => e?.buildingId === b.id);
        const health = calculateWingHealth(bEvals);
        const leaks = bEvals.filter((e) => e.defects && e.defects.includes('leak')).length;
        const criticals = bEvals.filter((e) => e.status === 'broken').length;
        const warnings = bEvals.filter((e) => e.status === 'needs_maintenance').length;

        return {
          ...b,
          healthScore: health,
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
    handleNavigate('campus');
  };

  const handleUpdateFeatureFlags = (newFlags: AdminFeatureFlags) => {
    setFeatureFlags(newFlags);
    saveFeatureFlags(newFlags);
  };

  const isLocked = !isAdmin && !auth && !featureFlags.enablePublicView;

  if (isLocked) {
    return (
      <AdminGateway
        onAdminUnlocked={handleAdminUnlocked}
        onLeaderLogin={handleLeaderLogin}
      />
    );
  }

  const currentBuilding = buildings.find((b) => b.id === selectedBuildingId) || buildings[0];
  const currentBuildingEvals = allEvaluations.filter((e) => e.buildingId === selectedBuildingId);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      <Navbar
        activeView={activeView}
        isAdmin={isAdmin}
        auth={auth}
        featureFlags={featureFlags}
        onNavigate={handleNavigate}
        onOpenReportModal={() => setShowReportModal(true)}
        onOpenLogin={() => setShowLoginModal(true)}
        onExitImpersonation={handleExitImpersonation}
        onLockSession={handleLockSession}
      />

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {activeView === 'campus' && (
          <CampusOverview
            buildings={buildings}
            allEvaluations={allEvaluations}
            onSelectBuilding={(bId) => {
              handleSelectBuilding(bId);
              handleNavigate('building_detail');
            }}
            onOpenReportModal={() => setShowReportModal(true)}
            onOpenLogin={() => setShowLoginModal(true)}
            isAuthenticated={isAdmin || !!auth}
          />
        )}

        {activeView === 'building_detail' && (
          <BuildingDetail
            building={currentBuilding}
            evaluations={currentBuildingEvals}
            onBack={() => handleNavigate('campus')}
            onOpenAudit={() => {
              if (isAdmin || auth) {
                handleNavigate('leader_portal');
              } else {
                setShowLoginModal(true);
              }
            }}
            onOpenReport={() => setShowReportModal(true)}
            isAuthenticated={isAdmin || !!auth}
            onOpenLogin={() => setShowLoginModal(true)}
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
            onOpenLogin={() => setShowLoginModal(true)}
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
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}

export default App;
