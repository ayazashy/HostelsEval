// ============================================================================
// 🏢 HostelsEval — 34 Buildings Campus Registry
// ============================================================================

import { BuildingInfo } from '../types/hostel';

export const TOTAL_CAMPUS_BUILDINGS = 34;

export const DEFAULT_BUILDINGS: BuildingInfo[] = Array.from({ length: TOTAL_CAMPUS_BUILDINGS }, (_, idx) => {
  const num = idx + 1;
  const id = `B${num.toString().padStart(2, '0')}`;
  
  return {
    id,
    number: num,
    nameAr: `مبنى ${num}`,
    floorsCount: 5, // Default 5 floors
    wingsCount: 4,  // Always 4 wings connected in the center
    leaderName: `رائد مبنى ${num}`,
    healthScore: undefined, // Grey uninspected until first evaluation is recorded
    status: 'uninspected',
    stats: {
      totalEvaluations: 0,
      criticalIssues: 0,
      warningIssues: 0,
      waterLeaks: 0,
      activeDefectsCount: 0,
    },
  };
});

export const BUILDINGS_CONFIG = DEFAULT_BUILDINGS;

// Helper to retrieve building by id
export const getBuildingById = (id: string): BuildingInfo | undefined => {
  return DEFAULT_BUILDINGS.find((b) => b.id.toUpperCase() === id.toUpperCase());
};

// Wing Names strictly labeled by numbers 1 to 4
export const WING_NAMES_AR: Record<number, string> = {
  1: 'جناح 1',
  2: 'جناح 2',
  3: 'جناح 3',
  4: 'جناح 4',
};
