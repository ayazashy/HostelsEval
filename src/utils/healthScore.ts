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

export function getScoreColor(score: number): ScoreColorDefinition {
  if (score >= 80) {
    return {
      hex: '#10b981', // Emerald
      threeColor: 0x10b981,
      bgClass: 'bg-emerald-500/10 border-emerald-500/30',
      textClass: 'text-emerald-400',
      badgeClass: 'badge-good',
      labelAr: 'ممتاز / سليم',
    };
  }
  if (score >= 50) {
    return {
      hex: '#f59e0b', // Amber
      threeColor: 0xf59e0b,
      bgClass: 'bg-amber-500/10 border-amber-500/30',
      textClass: 'text-amber-400',
      badgeClass: 'badge-warning',
      labelAr: 'متوسط / يحتاج صيانة',
    };
  }
  return {
    hex: '#ef4444', // Red / Rose
    threeColor: 0xef4444,
    bgClass: 'bg-red-500/10 border-red-500/30',
    textClass: 'text-red-400',
    badgeClass: 'badge-critical',
    labelAr: 'حرج / أعطال جسيمة',
  };
}

// Calculate Wing Health Score based on its recorded evaluations
export function calculateWingHealth(evaluations: FixtureEvaluation[]): number {
  if (evaluations.length === 0) return 100;

  let totalDeduction = 0;

  evaluations.forEach((item) => {
    if (item.status === 'broken') {
      totalDeduction += 30;
    } else if (item.status === 'needs_maintenance') {
      totalDeduction += 12;
    }

    // Heavy penalty for active water leaks and cold heaters
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

  const averageHealth =
    buildings.length > 0
      ? Math.round(buildings.reduce((acc, b) => acc + (b.healthScore || 100), 0) / buildings.length)
      : 100;

  return {
    totalBuildings: buildings.length,
    auditedBuildings: auditedBuildingsSet.size,
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
  const healthScore = calculateWingHealth(evaluations);
  
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
