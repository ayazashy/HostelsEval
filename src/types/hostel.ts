// ============================================================================
// 🏢 HostelsEval Core Type Definitions (V2)
// Clean architecture: Gatekeeping, Feature Flags, Impersonation, and Audit Logs
// ============================================================================

export type SeverityLevel = 'good' | 'warning' | 'critical';

export type FixtureStatus = 'operational' | 'needs_maintenance' | 'broken';

export type FacilityCategoryCode = 'BTH' | 'KIT' | 'LND' | 'STD' | 'COR' | 'ELV' | string;

export type FixtureTypeCode = 'SNK' | 'SHW' | 'TOI' | 'WHT' | 'EXH' | 'FLR' | 'OTH' | string;

export interface DefectTag {
  id: string;
  labelAr: string;
  labelEn: string;
  category: 'water' | 'hygiene' | 'electrical' | 'mechanical' | 'structural';
  severity: SeverityLevel;
  iconName: string;
}

export interface FixtureTemplate {
  typeCode: FixtureTypeCode;
  nameAr: string;
  nameEn: string;
  count: number;
  iconName: string;
  defaultDefectTags: string[];
}

export interface FacilityCategoryConfig {
  id: string;
  code: FacilityCategoryCode;
  nameAr: string;
  nameEn: string;
  iconName: string;
  descriptionAr: string;
  wingTemplates: Record<number, FixtureTemplate[]>;
}

export interface FixtureEvaluation {
  id: string; // e.g. B14-W2-F3-BTH-SNK-01
  buildingId: string; // e.g. 'B14'
  wingId: number; // 1 | 2 | 3 | 4
  floor: number; // 1..5
  categoryCode: FacilityCategoryCode;
  fixtureTypeCode: FixtureTypeCode;
  fixtureIndex: number;
  status: FixtureStatus;
  defects: string[];
  notes?: string;
  rating: number;
  photoBase64?: string;
  hasPhoto: boolean;
  inspectorName?: string;
  inspectorId?: string;
  updatedAt: string;
}

export type BuildingStatus = 'uninspected' | 'good' | 'warning' | 'critical';

export interface EvaluationHistoryEntry {
  id: string; // unique scan ID e.g. scan_${Date.now()}_${random}
  fixtureId: string;
  buildingId: string;
  floor: number;
  wingId: number; // Tower 1..4
  categoryCode: string;
  fixtureTypeCode: string;
  fixtureNameAr: string;
  status: FixtureStatus;
  previousStatus?: FixtureStatus;
  defects: string[];
  notes?: string;
  rating: number;
  photoBase64?: string;
  inspectorName?: string;
  timestamp: string; // ISO string
  isResolved?: boolean;
  resolutionNotes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface BuildingStructure {
  buildingId: string;
  floorsCount: number;
  // floorNumber (1..floorsCount) -> array of active tower numbers (e.g. [1, 2, 3, 4] or for 5th floor [1, 2])
  floorTowers: Record<number, number[]>;
  updatedAt?: string;
}

export interface CampusMapConfig {
  groundImageUrl?: string;
  groundScale?: number;
  buildingPositions: Record<
    string,
    {
      x: number;
      z: number;
      rotation?: number;
    }
  >;
  updatedAt?: string;
}

export interface WingSummary {
  wingId: number;
  wingNameAr: string;
  healthScore: number;
  totalFixtures: number;
  operationalCount: number;
  warningCount: number;
  criticalCount: number;
  activeLeaks: number;
  brokenToilets: number;
  brokenShowers: number;
  coldHeaters: number;
}

export interface BuildingInfo {
  id: string; // 'B01' to 'B34'
  number: number;
  nameAr: string;
  floorsCount: number;
  wingsCount: number;
  leaderName?: string;
  healthScore?: number | null; // null or undefined when uninspected
  status?: BuildingStatus;
  lastInspectionDate?: string;
  structure?: BuildingStructure;
  stats: {
    totalEvaluations: number;
    criticalIssues: number;
    warningIssues: number;
    waterLeaks: number;
    activeDefectsCount: number;
  };
}

export interface CampusStats {
  totalBuildings: number;
  auditedBuildings: number;
  uninspectedBuildings: number;
  totalFixturesCount: number;
  totalLeaksCount: number;
  totalCriticalToilets: number;
  totalBrokenShowers: number;
  campusAverageHealth: number;
}

export interface BuildingLeaderAuth {
  buildingId: string;
  leaderName: string;
  isAuthenticated: boolean;
  isImpersonated?: boolean;
  token?: string;
}

// ----------------------------------------------------------------------------
// Admin & Security V2 Additions
// ----------------------------------------------------------------------------

export interface AdminFeatureFlags {
  enable3DTwin: boolean;
  enableLeaderAudits: boolean;
  enablePhotoCapture: boolean;
  enableOfficialReports: boolean;
  enablePublicView: boolean;
}

export interface LeaderAccount {
  buildingId: string;
  buildingNameAr: string;
  leaderName: string;
  accessCode: string; // Unique per building (e.g. B14-8842)
  lastActiveAt?: string;
  evaluationsSubmitted: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  actorName: string;
  actorRole: 'admin' | 'leader' | 'impersonated';
  buildingId: string;
  action:
    | 'inspection_saved'
    | 'photo_uploaded'
    | 'feature_toggled'
    | 'impersonation_started'
    | 'admin_unlocked'
    | 'cloud_sync';
  details: string;
}

