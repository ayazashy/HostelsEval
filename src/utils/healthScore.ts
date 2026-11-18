// ============================================================================
// HostelsEval — Health Score & Defect Analytics Engine
// Calculates real-time 0-100 health metrics and dynamic heatmap color mappings
// ============================================================================

import { FixtureEvaluation, CampusStats, BuildingInfo, WingSummary } from '../types/hostel';

export interface ScoreColorDefinition {
  hex: string;
  threeColor: number;
  bgClass: string;
  textClass: string;
  badgeClass: string;
  labelAr: string;
}

export function getScoreColor(score: number | null | undefined): ScoreColorDefinition {
  if (score === null || score === undefined) {
    return {
      hex: '#94a3b8', // Institutional Slate / Grey
      threeColor: 0x94a3b8,
      bgClass: 'bg-slate-100 border-slate-300',
      textClass: 'text-slate-600',
      badgeClass: 'badge-uninspected',
      labelAr: 'غير مفحوص',
    };
  }
  if (score >= 80) {
    return {
      hex: '#16a34a', // Emerald Green (Institutional Light)
      threeColor: 0x16a34a,
      bgClass: 'bg-emerald-50 border-emerald-200',
      textClass: 'text-emerald-700',
      badgeClass: 'badge-good',
      labelAr: 'سليم / ممتاز',
    };
  }
  if (score >= 50) {
    return {
      hex: '#d97706', // Amber (Institutional Light)
      threeColor: 0xd97706,
      bgClass: 'bg-amber-50 border-amber-200',
      textClass: 'text-amber-700',
      badgeClass: 'badge-warning',
      labelAr: 'متوسط / يحتاج صيانة',
    };
  }
  return {
    hex: '#dc2626', // Red (Institutional Light)
    threeColor: 0xdc2626,
    bgClass: 'bg-rose-50 border-rose-200',
    textClass: 'text-rose-700',
    badgeClass: 'badge-critical',
    labelAr: 'حرج / أعطال جسيمة',
  };
}

export function isLeakDefectId(defectId: string): boolean {
  return defectId === 'leak' || defectId.endsWith('_leak');
}

export function evaluationHasLeak(item: FixtureEvaluation): boolean {
  return Array.isArray(item.defects) && item.defects.some(isLeakDefectId);
}

// Calculate Wing Health Score based on its recorded evaluations (returns null if uninspected)
export function calculateWingHealth(evaluations: FixtureEvaluation[]): number | null {
  if (!evaluations || evaluations.length === 0) return null;

  let totalDeduction = 0;

  evaluations.forEach((item) => {
    if (item.status === 'broken') {
      totalDeduction += 30;
    } else if (item.status === 'needs_maintenance') {
      totalDeduction += 12;
    }

    // Extra penalty for active water leaks and bad odors (supports V1 & V3 tags)
    if (evaluationHasLeak(item)) totalDeduction += 10;
    if (item.defects?.some((d) => d === 'bad_odor' || d === 'cln_bad_odor')) {
      totalDeduction += 8;
    }
  });

  const rawScore = 100 - totalDeduction / Math.max(1, evaluations.length * 0.35);
  return Math.max(5, Math.min(100, Math.round(rawScore)));
}

// Aggregator for Campus-wide Dashboard Metrics
export function computeCampusStats(
  buildings: BuildingInfo[],
  allEvaluations: FixtureEvaluation[]
): CampusStats {
  const validIds = new Set(buildings.map((b) => b.id.toUpperCase()));
  const validEvals = allEvaluations.filter(
    (e) => e && !e.isDeleted && validIds.has(e.buildingId?.toUpperCase())
  );
  const auditedBuildingsSet = new Set(validEvals.map((e) => e.buildingId.toUpperCase()));

  let operationalCount = 0;
  let needsMaintenanceCount = 0;
  let brokenOutagesCount = 0;
  let leaksCount = 0;
  let criticalToilets = 0;
  let brokenShowers = 0;

  validEvals.forEach((item) => {
    if (item.status === 'operational') operationalCount += 1;
    else if (item.status === 'needs_maintenance') needsMaintenanceCount += 1;
    else if (item.status === 'broken') brokenOutagesCount += 1;

    if (item.status !== 'operational' && evaluationHasLeak(item)) leaksCount += 1;
    if (item.fixtureTypeCode === 'TOI' && item.status !== 'operational') criticalToilets += 1;
    if (item.fixtureTypeCode === 'SHW' && item.status !== 'operational') brokenShowers += 1;
  });

  const inspectedBuildings = buildings.filter(
    (b) => b.healthScore !== null && b.healthScore !== undefined
  );
  const uninspectedCount = Math.max(0, buildings.length - auditedBuildingsSet.size);

  const averageHealth =
    inspectedBuildings.length > 0
      ? Math.round(
          inspectedBuildings.reduce((acc, b) => acc + (b.healthScore || 0), 0) /
            inspectedBuildings.length
        )
      : 0;

  return {
    totalBuildings: buildings.length,
    auditedBuildings: auditedBuildingsSet.size,
    uninspectedBuildings: uninspectedCount,
    totalFixturesCount: validEvals.length,
    totalOperationalCount: operationalCount,
    totalActiveIssuesCount: needsMaintenanceCount + brokenOutagesCount,
    totalNeedsMaintenance: needsMaintenanceCount,
    totalBrokenOutages: brokenOutagesCount,
    totalLeaksCount: leaksCount,
    totalCriticalToilets: criticalToilets,
    totalBrokenShowers: brokenShowers,
    campusAverageHealth: averageHealth,
  };
}

// Summarize a specific Wing's condition (returns healthScore: null when uninspected)
export function summarizeWing(
  wingId: number,
  wingNameAr: string,
  evaluations: FixtureEvaluation[]
): WingSummary {
  const healthScore = calculateWingHealth(evaluations);

  return {
    wingId,
    wingNameAr,
    healthScore,
    totalFixtures: evaluations.length,
    operationalCount: evaluations.filter((e) => e.status === 'operational').length,
    warningCount: evaluations.filter((e) => e.status === 'needs_maintenance').length,
    criticalCount: evaluations.filter((e) => e.status === 'broken').length,
    activeLeaks: evaluations.filter(
      (e) => e.status !== 'operational' && evaluationHasLeak(e)
    ).length,
    brokenToilets: evaluations.filter(
      (e) => e.fixtureTypeCode === 'TOI' && e.status !== 'operational'
    ).length,
    brokenShowers: evaluations.filter(
      (e) => e.fixtureTypeCode === 'SHW' && e.status !== 'operational'
    ).length,
    coldHeaters: evaluations.filter((e) =>
      e.defects?.some((d) => d === 'cold_heater' || d === 'plm_no_hot_water')
    ).length,
  };
}
