// ============================================================================
// 🏢 HostelsEval Core Type Definitions (V2)
// Clean architecture: Gatekeeping, Feature Flags, Impersonation, and Audit Logs
// ============================================================================

export type SeverityLevel = 'good' | 'warning' | 'critical';

export type FixtureStatus = 'operational' | 'needs_maintenance' | 'broken';

export type FacilityCategoryCode = 'BTH' | 'KIT' | 'LND' | 'STD' | 'COR' | 'ELV' | string;

export type FixtureTypeCode = 'SNK' | 'SHW' | 'TOI' | 'WHT' | 'EXH' | 'FLR' | 'OTH' | string;

export type ServiceDepartment =
  | 'plumbing'
  | 'carpentry_civil'
  | 'electrical'
  | 'hvac_mechanical'
  | 'cleaning'
  | 'pest_control';

export interface DefectTag {
  id: string;
  labelAr: string;
  labelEn: string;
  category: 'water' | 'hygiene' | 'electrical' | 'mechanical' | 'structural';
  department?: ServiceDepartment;
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

export interface FacilityMediaItem {
  id: string;
  type: 'image' | 'video' | 'pdf';
  url: string; // Base64 data URI
  name?: string;
  capturedAt: string;
  capturedBy?: string;
}

export type FacilityHistoryAction =
  | 'inspection'
  | 'maximo_registered'
  | 'maintenance_closed'
  | 'leader_verified'
  | 'leader_rejected_reopened'
  | 'chat_message';

export interface FacilityHistoryEvent {
  id: string;
  timestamp: string;
  action: FacilityHistoryAction;
  actorName: string;
  actorRole: 'leader' | 'maintenance' | 'cleaning' | 'admin';
  status: FixtureStatus;
  defects?: string[];
  notes?: string;
  media?: FacilityMediaItem[];
  maximoNumber?: string;
  maximoAttachmentUrl?: string;
  maximoAttachmentName?: string;
  evaluationRating?: number;
}

export type MaintenanceTicketStatus =
  | 'open'
  | 'in_progress'
  | 'pending_evaluation'
  | 'verified_closed'
  | 'reopened';

export interface MaintenanceTicketInfo {
  status: MaintenanceTicketStatus;
  department?: ServiceDepartment;
  maximoNumber?: string;
  maximoAttachmentBase64?: string;
  maximoAttachmentName?: string;
  maximoAttachmentType?: 'pdf' | 'image';
  registeredAt?: string;
  registeredBy?: string;
  closedAt?: string;
  closedBy?: string;
  closureNotes?: string;
  closurePhotoBase64?: string;
  reopenedAt?: string;
  reopenedCount?: number;
  lastRejectionReason?: string;
  lastRejectionPhotoBase64?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  serviceRating?: number;
  serviceFeedback?: string;
}

export interface MaintenanceAuth {
  technicianName: string;
  role?: 'maintenance' | 'cleaning' | 'viewer';
  isAuthenticated: boolean;
  token: string;
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
  media?: FacilityMediaItem[];
  history?: FacilityHistoryEvent[];
  maintenanceTicket?: MaintenanceTicketInfo;
  inspectorName?: string;
  inspectorId?: string;
  updatedAt: string;
  isDeleted?: boolean;
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
  media?: FacilityMediaItem[];
  maximoNumber?: string;
  ticketStatus?: MaintenanceTicketStatus;
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
  groundScale?: number; // scale percentage (e.g. 20 to 200, default 75)
  groundOffsetX?: number; // offset X in units (e.g. -50 to 50, default 0)
  groundOffsetZ?: number; // offset Z in units (e.g. -50 to 50, default 0)
  groundRotation?: number; // optional rotation in degrees (0, 90, 180, 270)
  groundOpacity?: number; // optional opacity percentage (30 to 100)
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
  actorRole: 'admin' | 'leader' | 'maintenance' | 'impersonated';
  buildingId: string;
  action:
    | 'inspection_saved'
    | 'photo_uploaded'
    | 'feature_toggled'
    | 'impersonation_started'
    | 'admin_unlocked'
    | 'cloud_sync'
    | 'maintenance_update'
    | 'ticket_evaluated';
  details: string;
}

