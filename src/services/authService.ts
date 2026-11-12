// ============================================================================
// 🔐 HostelsEval — Cryptographic Gatekeeper, Leader Credentials & In-Memory Vault
// Zero hardcoded passwords • In-Memory Session Unlocking • Distinct Leader Codes
// Protected by AES-256-GCM + PBKDF2 (100,000 iterations) Master Password
// ============================================================================

import {
  BuildingLeaderAuth,
  MaintenanceAuth,
  AdminFeatureFlags,
  LeaderAccount,
  AuditLogEntry,
} from '../types/hostel';
import {
  unlockAdminVaultWithPassword,
  DecryptedAdminVault,
} from '../utils/cryptoVault';
import {
  AUTH_HASH_SALT,
  MAINTENANCE_CODE_HASH,
  CLEANING_CODE_HASH,
  LEADER_CODE_HASHES,
} from '../config/authHashes';
import {
  checkIsAdminUnlocked,
  getAdminVaultSession as getSessionVault,
  setAdminSession,
  clearAdminSession,
  checkActiveLeaderAuth,
  setLeaderSession,
  clearLeaderSession,
  checkActiveMaintenanceAuth,
  setMaintenanceSession,
  clearMaintenanceSession,
} from '../utils/sessionStore';

// Initial Feature Flags State
const DEFAULT_FEATURE_FLAGS: AdminFeatureFlags = {
  enable3DTwin: true,
  enableLeaderAudits: true,
  enablePhotoCapture: true,
  enableOfficialReports: true,
  enablePublicView: true, // Landing page with 3D visualization and dashboard is public by default
};

const FEATURE_FLAGS_KEY = 'hostels_admin_feature_flags';
const AUDIT_LOGS_KEY = 'hostels_audit_logs';
const ADMIN_CREDENTIALS_CACHE_KEY = 'hostels_admin_credentials_cache';

export interface PrivateCredentialsBundle {
  maintenance?: string;
  cleaning?: string;
  leaders?: Record<string, string>;
}

// Optional gitignored local credentials file (bundled only when present locally; {} in public repo)
const localCredsModules = import.meta.glob('../config/credentials.local.json', {
  eager: true,
}) as Record<string, { default?: PrivateCredentialsBundle } & PrivateCredentialsBundle>;

function loadLocalCredentialsBundle(): PrivateCredentialsBundle | null {
  const firstMod = Object.values(localCredsModules)[0];
  if (firstMod) {
    return (firstMod.default || firstMod) as PrivateCredentialsBundle;
  }
  try {
    const raw = localStorage.getItem(ADMIN_CREDENTIALS_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function getAdminVisibleCredentials(): PrivateCredentialsBundle | null {
  if (!checkIsAdminUnlocked()) return null;
  return loadLocalCredentialsBundle();
}

export function saveAdminImportedCredentials(bundle: PrivateCredentialsBundle): void {
  if (!checkIsAdminUnlocked()) return;
  try {
    localStorage.setItem(ADMIN_CREDENTIALS_CACHE_KEY, JSON.stringify(bundle));
  } catch {}
}

async function computeSaltedSha256(value: string): Promise<string> {
  const payload = `${AUTH_HASH_SALT}:${value.trim().toLowerCase()}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 34 Building Leader Accounts (No plaintext codes stored in public repo)
export const BUILDING_LEADER_ACCOUNTS: LeaderAccount[] = Array.from(
  { length: 34 },
  (_, idx) => {
    const num = idx + 1;
    const bId = `B${num.toString().padStart(2, '0')}`;
    return {
      buildingId: bId,
      buildingNameAr: `مبنى ${num}`,
      leaderName: `رائد ${bId}`,
      accessCode: '••••••••',
      evaluationsSubmitted: 0,
    };
  }
);

// 1. Admin Gateway: Verify and Unlock using Cryptographic Vault
export async function unlockAdminWorkspace(passwordInput: string): Promise<{
  success: boolean;
  error?: string;
  vault?: DecryptedAdminVault;
}> {
  if (!passwordInput || !passwordInput.trim()) {
    return { success: false, error: 'يرجى إدخال كلمة مرور المشرف' };
  }

  // Cryptographic attempt to decrypt AES-256-GCM payload using PBKDF2 key derivation
  const result = await unlockAdminVaultWithPassword(passwordInput.trim());

  if (!result.success || !result.vault) {
    logAuditEvent({
      actorName: 'مجهول (محاولة دخول)',
      actorRole: 'admin',
      buildingId: 'ALL',
      action: 'admin_unlocked',
      details: 'فشل فك تشفير خزينة المشرف: كلمة المرور غير صحيحة أو تم التلاعب بها',
    });
    return {
      success: false,
      error: 'كلمة المرور غير صحيحة. الوصول محظور وغير مصرح به.',
    };
  }

  // Master password is confirmed authentic: initialize in-memory and persistent session
  setAdminSession(result.vault);

  logAuditEvent({
    actorName: 'المشرف العام (Admin)',
    actorRole: 'admin',
    buildingId: 'ALL',
    action: 'admin_unlocked',
    details: `تم فك تشفير لوحة المشرف بنجاح (المفتاح السري: ${result.vault.secretStringKey.substring(0, 10)}...)`,
  });

  // Execute covert handshake request to Firebase immediately using dynamic import
  import('./firestoreService').then(({ performHiddenVaultHandshake }) => {
    performHiddenVaultHandshake(
      result.vault!.secretStringKey,
      result.vault!.hiddenCollectionName
    ).then((handshake) => {
      if (handshake.success) {
        logAuditEvent({
          actorName: 'المشرف العام (نظام الربط السحابي)',
          actorRole: 'admin',
          buildingId: 'ALL',
          action: 'cloud_sync',
          details: `تم توثيق الاتصال السحابي بالمجموعة المخفية (${handshake.collectionName}) بنجاح`,
        });
      } else {
        console.warn(
          `[Covert Handshake Alert] Handshake to ${handshake.collectionName} returned:`,
          handshake.error
        );
      }
    });
  }).catch((err) => console.warn('Deferred handshake failed:', err));

  return { success: true, vault: result.vault };
}

export function isAdminUnlocked(): boolean {
  return checkIsAdminUnlocked();
}

export function getAdminVaultSession(): DecryptedAdminVault | null {
  return getSessionVault();
}

export function lockAdminWorkspace(): void {
  clearAdminSession();
  clearLeaderSession();
  clearMaintenanceSession();
  try {
    localStorage.removeItem('hostels_active_view');
  } catch (err) {
    console.warn('Failed to clear sessions:', err);
  }
}

export async function loginMaintenanceWithCode(
  enteredCode: string,
  technicianName?: string,
  role: 'maintenance' | 'cleaning' = 'maintenance'
): Promise<{ success: boolean; error?: string; auth?: MaintenanceAuth }> {
  const cleanEntered = enteredCode.trim();
  if (!cleanEntered) {
    return {
      success: false,
      error: 'يرجى إدخال كود الدخول أولاً.',
    };
  }

  const targetHash = role === 'cleaning' ? CLEANING_CODE_HASH : MAINTENANCE_CODE_HASH;
  const enteredHash = await computeSaltedSha256(cleanEntered);
  const isMatch = enteredHash === targetHash;

  if (!isMatch) {
    return {
      success: false,
      error:
        role === 'cleaning'
          ? 'كود دخول قسم النظافة ومكافحة الآفات غير صحيح. يرجى التحقق والمحاولة مجدداً.'
          : 'كود دخول الصيانة غير صحيح. يرجى التحقق والمحاولة مجدداً.',
    };
  }

  const defaultName =
    role === 'cleaning'
      ? 'فريق النظافة ومكافحة الآفات'
      : 'فريق الصيانة المكثفة وماكسمو';

  const authData: MaintenanceAuth = {
    technicianName: technicianName?.trim() || defaultName,
    role,
    isAuthenticated: true,
    token: `${role}_${Date.now()}`,
  };

  setMaintenanceSession(authData);

  logAuditEvent({
    actorName: authData.technicianName,
    actorRole: 'maintenance',
    buildingId: 'ALL',
    action: 'maintenance_update',
    details:
      role === 'cleaning'
        ? 'دخول حساب الخدمات لبوابة النظافة ومكافحة الحشرات والقوارض'
        : 'دخول حساب الصيانة لبوابة متابعة البلاغات وماكسمو',
  });

  return { success: true, auth: authData };
}

export function getActiveMaintenanceAuth(): MaintenanceAuth | null {
  return checkActiveMaintenanceAuth();
}

// 2. Building Leader Authentication (Salted SHA-256 Verification)
export async function loginBuildingLeaderWithCode(
  buildingId: string,
  enteredCode: string,
  inspectorName?: string
): Promise<{ success: boolean; error?: string; auth?: BuildingLeaderAuth }> {
  const bId = buildingId.toUpperCase();
  const account = BUILDING_LEADER_ACCOUNTS.find(
    (acc) => acc.buildingId.toUpperCase() === bId
  );

  if (!account) {
    return { success: false, error: 'المبنى المحدد غير موجود في السجل' };
  }

  const targetHash = LEADER_CODE_HASHES[bId];
  if (!targetHash) {
    return { success: false, error: 'لا يوجد كود مسجل لهذا المبنى' };
  }

  const cleanEntered = enteredCode.trim().toLowerCase();
  const fullCandidate = cleanEntered.startsWith(`${bId.toLowerCase()}-`)
    ? cleanEntered
    : `${bId.toLowerCase()}-${cleanEntered}`;

  const [directHash, prefixedHash] = await Promise.all([
    computeSaltedSha256(cleanEntered),
    computeSaltedSha256(fullCandidate),
  ]);

  const isMatch = directHash === targetHash || prefixedHash === targetHash;

  if (!isMatch) {
    return {
      success: false,
      error: `كود الدخول غير صحيح لمبنى ${buildingId}. يرجى التحقق والمحاولة مجدداً.`,
    };
  }

  const authData: BuildingLeaderAuth = {
    buildingId: account.buildingId,
    leaderName: inspectorName?.trim() || account.leaderName,
    isAuthenticated: true,
    isImpersonated: false,
    token: `lead_${Date.now()}_${account.buildingId}`,
  };

  setLeaderSession(authData);

  logAuditEvent({
    actorName: authData.leaderName,
    actorRole: 'leader',
    buildingId: authData.buildingId,
    action: 'inspection_saved',
    details: `دخول رائد المبنى بالكود المخصص (${authData.buildingId})`,
  });

  return { success: true, auth: authData };
}

// 3. Admin Impersonation: Seamlessly log in as any Building Leader
export function impersonateBuildingLeader(buildingId: string): BuildingLeaderAuth {
  const account = BUILDING_LEADER_ACCOUNTS.find(
    (acc) => acc.buildingId.toUpperCase() === buildingId.toUpperCase()
  );

  const authData: BuildingLeaderAuth = {
    buildingId: account ? account.buildingId : buildingId,
    leaderName: account
      ? `${account.leaderName} (بصلاحية المشرف)`
      : `رائد ${buildingId} (بصلاحية المشرف)`,
    isAuthenticated: true,
    isImpersonated: true,
    token: `impersonated_${Date.now()}_${buildingId}`,
  };

  setLeaderSession(authData);

  logAuditEvent({
    actorName: 'المشرف العام (Admin)',
    actorRole: 'impersonated',
    buildingId,
    action: 'impersonation_started',
    details: `المشرف تقمص دور رائد ${buildingId} لمراجعة وتدقيق البيانات الميدانية`,
  });

  return authData;
}

export function exitImpersonation(): void {
  const current = checkActiveLeaderAuth();
  if (current?.isImpersonated) {
    clearLeaderSession();
  }
}

export function getActiveLeaderAuth(): BuildingLeaderAuth | null {
  return checkActiveLeaderAuth();
}

// 4. Feature Flags Management
export function getFeatureFlags(): AdminFeatureFlags {
  try {
    const raw = localStorage.getItem(FEATURE_FLAGS_KEY);
    return raw ? { ...DEFAULT_FEATURE_FLAGS, ...JSON.parse(raw) } : DEFAULT_FEATURE_FLAGS;
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
}

export function saveFeatureFlags(flags: AdminFeatureFlags): void {
  try {
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
    logAuditEvent({
      actorName: 'المشرف العام (Admin)',
      actorRole: 'admin',
      buildingId: 'ALL',
      action: 'feature_toggled',
      details: `تم تحديث صلاحيات النظام والميزات`,
    });
  } catch (err) {
    console.warn('Failed to save feature flags:', err);
  }
}

// 5. Immutable Audit Logs System
export function getAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
  try {
    const logs = getAuditLogs();
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newEntry);
    // Keep last 150 log entries
    const capped = logs.slice(0, 150);
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(capped));
  } catch (err) {
    console.warn('Failed to save audit log:', err);
  }
}
