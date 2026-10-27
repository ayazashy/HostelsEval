// ============================================================================
// 📊 HostelsEval — Health Score & Defect Analytics Engine
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

    // Heavy penalty for active water leaks and bad odors
    if (item.defects.includes('leak')) totalDeduction += 10;
    if (item.defects.includes('bad_odor')) totalDeduction += 8;
  });

  const rawScore = 100 - totalDeduction / Math.max(1, evaluations.length * 0.35);
  return Math.max(5, Math.min(100, Math.round(rawScore)));
}

// Aggregator for Campus-wide Dashboard Metrics
export function computeCampusStats(
  buildings: BuildingInfo[],
  allEvaluations: FixtureEvaluation[]
): CampusStats {
  const auditedBuildingsSet = new Set(allEvaluations.map((e) => e.buildingId));
  
  let leaksCount = 0;
  let criticalToilets = 0;
  let brokenShowers = 0;

  allEvaluations.forEach((item) => {
    if (item.defects.includes('leak')) leaksCount += 1;
    if (item.fixtureTypeCode === 'TOI' && item.status === 'broken') criticalToilets += 1;
    if (item.fixtureTypeCode === 'SHW' && item.status === 'broken') brokenShowers += 1;
  });

  const inspectedBuildings = buildings.filter(
    (b) => b.healthScore !== null && b.healthScore !== undefined
  );
  const uninspectedCount = buildings.length - auditedBuildingsSet.size;

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
    totalFixturesCount: allEvaluations.length,
    totalLeaksCount: leaksCount,
    totalCriticalToilets: criticalToilets,
    totalBrokenShowers: brokenShowers,
    campusAverageHealth: averageHealth,
  };
}

// Summarize a specific Wing's condition
export function summarizeWing(
  wingId: number,
  wingNameAr: string,
  evaluations: FixtureEvaluation[]
): WingSummary {
  const healthScore = calculateWingHealth(evaluations) ?? 100;
  
  return {
    wingId,
    wingNameAr,
    healthScore,
    totalFixtures: evaluations.length,
    operationalCount: evaluations.filter((e) => e.status === 'operational').length,
    warningCount: evaluations.filter((e) => e.status === 'needs_maintenance').length,
    criticalCount: evaluations.filter((e) => e.status === 'broken').length,
    activeLeaks: evaluations.filter((e) => e.defects.includes('leak')).length,
    brokenToilets: evaluations.filter((e) => e.fixtureTypeCode === 'TOI' && e.status === 'broken').length,
    brokenShowers: evaluations.filter((e) => e.fixtureTypeCode === 'SHW' && e.status === 'broken').length,
    coldHeaters: evaluations.filter((e) => e.defects.includes('cold_heater')).length,
  };
}
