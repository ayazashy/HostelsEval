// ============================================================================
// 🔥 HostelsEval — Firestore Data Service
// Real-time synchronization + LocalStorage offline resilience + Security Token Gate
// Protected by Cloud Document Secret Token Matching
// ============================================================================

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './dataConnector';
import { FixtureEvaluation, EvaluationHistoryEntry } from '../types/hostel';
import {
  getDecodedSecurityCode,
  getAdminRawSecurityCode,
  FIRESTORE_SECRET_COLLECTION,
  FIRESTORE_SECRET_DOC,
  FIRESTORE_SECRET_FIELD,
} from '../utils/securityGate';

export const EVALUATIONS_COLLECTION = 'evaluations';
export const LOCAL_STORAGE_KEY = 'hostels_eval_local_cache';

export interface CloudSaveResult {
  success: boolean;
  cloudSynced: boolean;
  cloudError?: string;
  code?: string;
}

export interface CloudConnectionTestResult {
  canRead: boolean;
  canWrite: boolean;
  remoteDocsCount: number;
  readError?: string;
  writeError?: string;
  code?: string;
  latencyMs: number;
}

export interface HandshakeResult {
  success: boolean;
  timestamp: string;
  collectionName: string;
  error?: string;
  code?: string;
}

export interface SyncBatchResult {
  total: number;
  synced: number;
  failed: number;
  firstError?: string;
}

// ----------------------------------------------------------------------------
// Local Storage Cache Helpers
// ----------------------------------------------------------------------------
export function getLocalCache(): Record<string, FixtureEvaluation> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const sanitized: Record<string, FixtureEvaluation> = {};
    let hasCorrupted = false;

    for (const [key, val] of Object.entries(parsed)) {
      if (
        key &&
        key !== 'undefined' &&
        key !== 'null' &&
        val &&
        typeof val === 'object' &&
        typeof (val as any).buildingId === 'string' &&
        typeof (val as any).id === 'string'
      ) {
        sanitized[key] = val as FixtureEvaluation;
      } else {
        hasCorrupted = true;
      }
    }

    if (hasCorrupted) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
      } catch {}
    }

    return sanitized;
  } catch {
    return {};
  }
}

export function getAllCachedEvaluations(): FixtureEvaluation[] {
  return Object.values(getLocalCache());
}

export function getLocalCacheCount(): number {
  return Object.keys(getLocalCache()).length;
}

export function saveToLocalCache(evaluation: FixtureEvaluation): void {
  if (!evaluation || !evaluation.id || !evaluation.buildingId) {
    return;
  }
  try {
    const cache = getLocalCache();
    cache[evaluation.id] = evaluation;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

/**
 * Helper to strip any undefined values from an object before sending to Firestore
 * (Firestore SDK throws an error if any field in an object is undefined).
 */
export function stripUndefinedValues<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

// ----------------------------------------------------------------------------
// 1. Save or Update Single Fixture Evaluation (Protected by Secret Token Gate)
// ----------------------------------------------------------------------------
export async function saveEvaluation(evaluation: FixtureEvaluation): Promise<CloudSaveResult> {
  // Check if caller is authorized with decrypted secret code
  const secretCode = getDecodedSecurityCode();

  // If user is a public visitor (no leader PIN, no admin password), BLOCK write immediately:
  if (!secretCode) {
    console.warn('[HostelsEval] Write blocked: Public users have read-only access.');
    return {
      success: false,
      cloudSynced: false,
      cloudError: 'عفواً، لا تملك تصريح كتابة. يجب تسجيل الدخول كـ رائد مبنى أو مشرف لحفظ التقييمات.',
      code: 'permission-denied',
    };
  }

  // Update local cache for instant UI responsiveness
  saveToLocalCache(evaluation);

  // Record timeline scan event
  recordEvaluationHistory({
    id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fixtureId: evaluation.id,
    buildingId: evaluation.buildingId,
    floor: evaluation.floor,
    wingId: evaluation.wingId,
    categoryCode: evaluation.categoryCode,
    fixtureTypeCode: evaluation.fixtureTypeCode,
    fixtureNameAr: evaluation.fixtureTypeCode,
    status: evaluation.status,
    defects: evaluation.defects || [],
    notes: evaluation.notes,
    rating: evaluation.rating,
    photoBase64: evaluation.photoBase64,
    inspectorName: evaluation.inspectorName,
    timestamp: new Date().toISOString(),
    isResolved: evaluation.status === 'operational',
  });

  // Strip all undefined properties (e.g. photoBase64 if not taken) so Firestore accepts the document
  const rawPayload: Record<string, any> = {
    ...evaluation,
    secretCode, // Attaches secret code to satisfy Firestore Rule: request.resource.data.secretCode == get(...).data.s
    updatedAt: new Date().toISOString(),
  };
  const cleanPayload = stripUndefinedValues(rawPayload);

  try {
    const docRef = doc(db, EVALUATIONS_COLLECTION, evaluation.id);
    await setDoc(docRef, cleanPayload, { merge: true });

    // Notify listeners of cloud success
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_cloud_sync_event', {
          detail: { type: 'save_success', id: evaluation.id },
        })
      );
    }

    return { success: true, cloudSynced: true };
  } catch (err: any) {
    const errorMsg = err?.message || 'Firestore write failed';
    const errorCode = err?.code || 'unknown';

    console.warn(`[HostelsEval Firebase] Write failed (${errorCode}):`, errorMsg);

    // Notify listeners of cloud permission or network issue
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_cloud_sync_event', {
          detail: {
            type: 'save_warning',
            id: evaluation.id,
            error: errorMsg,
            code: errorCode,
          },
        })
      );
    }

    return {
      success: true, // Local persistence succeeded
      cloudSynced: false,
      cloudError: errorMsg,
      code: errorCode,
    };
  }
}

// ----------------------------------------------------------------------------
// 2. Real-time Subscription to a Specific Building's Evaluations
// ----------------------------------------------------------------------------
export function subscribeToBuildingEvaluations(
  buildingId: string,
  onUpdate: (evaluations: FixtureEvaluation[]) => void
): () => void {
  if (!buildingId) {
    return () => {};
  }
  const targetId = buildingId.toUpperCase();
  const localCache = Object.values(getLocalCache()).filter(
    (item) => item?.buildingId && item.buildingId.toUpperCase() === targetId
  );
  if (localCache.length > 0) {
    onUpdate(localCache);
  }

  try {
    const q = query(
      collection(db, EVALUATIONS_COLLECTION),
      where('buildingId', '==', targetId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const remoteList: FixtureEvaluation[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as FixtureEvaluation;
          if (data && data.id && data.buildingId) {
            remoteList.push(data);
          }
        });

        // Merge remote with local changes
        const mergedMap = new Map<string, FixtureEvaluation>();
        localCache.forEach((item) => {
          if (item && item.id) mergedMap.set(item.id, item);
        });
        remoteList.forEach((item) => {
          if (item && item.id) {
            mergedMap.set(item.id, item);
            saveToLocalCache(item); // Update local cache with remote ground truth
          }
        });

        onUpdate(Array.from(mergedMap.values()));
      },
      (err) => {
        console.warn('Firestore subscription warning, using local cache:', err);
        onUpdate(localCache);
      }
    );

    return unsubscribe;
  } catch {
    return () => {};
  }
}

// ----------------------------------------------------------------------------
// 3. Fetch All Evaluations for Campus Overview (Public Read Allowed)
// ----------------------------------------------------------------------------
export async function fetchAllEvaluations(): Promise<FixtureEvaluation[]> {
  const localMap = getLocalCache();

  try {
    const querySnapshot = await getDocs(collection(db, EVALUATIONS_COLLECTION));
    const remoteList: FixtureEvaluation[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as FixtureEvaluation;
      if (data && data.id && data.buildingId) {
        remoteList.push(data);
        saveToLocalCache(data); // Sync local cache
      }
    });

    const mergedMap = new Map<string, FixtureEvaluation>();
    Object.values(localMap).forEach((item) => {
      if (item && item.id) mergedMap.set(item.id, item);
    });
    remoteList.forEach((item) => {
      if (item && item.id) mergedMap.set(item.id, item);
    });

    return Array.from(mergedMap.values());
  } catch (err) {
    console.warn('Firestore fetch failed, returning local cache:', err);
    return Object.values(localMap);
  }
}

// ----------------------------------------------------------------------------
// 4. Batch Sync / Push All Local Evaluations to Firebase (With Secret Token)
// ----------------------------------------------------------------------------
export async function syncAllEvaluationsToFirestore(
  evaluations: FixtureEvaluation[]
): Promise<SyncBatchResult> {
  const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
  const itemsToSync =
    evaluations && evaluations.length > 0 ? evaluations : getAllCachedEvaluations();

  let synced = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const item of itemsToSync) {
    try {
      const docRef = doc(db, EVALUATIONS_COLLECTION, item.id);
      const rawPayload: Record<string, any> = {
        ...item,
        updatedAt: new Date().toISOString(),
      };
      if (secretCode) {
        rawPayload.secretCode = secretCode;
      }
      const cleanPayload = stripUndefinedValues(rawPayload);
      await setDoc(docRef, cleanPayload, { merge: true });
      synced++;
    } catch (err: any) {
      failed++;
      if (!firstError) {
        firstError = `${err?.code || 'ERROR'}: ${err?.message || 'Permission denied'}`;
      }
    }
  }

  return {
    total: itemsToSync.length,
    synced,
    failed,
    firstError,
  };
}

// ----------------------------------------------------------------------------
// 5. Initialize or Verify Cloud Secret Document
// ----------------------------------------------------------------------------
export async function initializeCloudSecretDocument(): Promise<{
  success: boolean;
  error?: string;
  code?: string;
}> {
  const rawCode = getAdminRawSecurityCode() || getDecodedSecurityCode();
  if (!rawCode) {
    return {
      success: false,
      error: 'غير مصرح: يجب تسجيل الدخول كمشرف لتهيئة المفتاح السري السحابي',
    };
  }

  try {
    const secRef = doc(db, FIRESTORE_SECRET_COLLECTION, FIRESTORE_SECRET_DOC);
    await setDoc(
      secRef,
      {
        [FIRESTORE_SECRET_FIELD]: rawCode,
        initializedAt: new Date().toISOString(),
        systemScope: 'HOUSING_SYSTEM_VAULT',
      },
      { merge: true }
    );
    return { success: true };
  } catch (err: any) {
    console.warn('[Firestore] Failed to initialize secret document:', err);
    return { success: false, error: err?.message, code: err?.code };
  }
}

// ----------------------------------------------------------------------------
// 6. Covert Hidden Collection & Secret String Key Handshake
// ----------------------------------------------------------------------------
export async function performHiddenVaultHandshake(
  secretKey: string,
  hiddenCollectionName: string = 'internal_vault'
): Promise<HandshakeResult> {
  const timestamp = new Date().toISOString();
  try {
    const handshakeRef = doc(db, hiddenCollectionName, 'admin_vault_handshake');
    const handshakePayload = {
      vaultSecretKey: secretKey,
      authorizedRole: 'super_admin',
      handshakeTimestamp: timestamp,
      clientEngine: 'HostelsEval-SecureEngine-v2.1',
      sessionScope: 'HOUSING_ADMIN_SESSION',
      status: 'AUTHENTICATED_AND_ACTIVE',
    };

    await setDoc(handshakeRef, handshakePayload, { merge: true });

    return {
      success: true,
      timestamp,
      collectionName: hiddenCollectionName,
    };
  } catch (err: any) {
    console.warn('[HostelsEval Vault Handshake] Warning:', err?.code, err?.message);
    return {
      success: false,
      timestamp,
      collectionName: hiddenCollectionName,
      error: err?.message || 'Handshake failed',
      code: err?.code,
    };
  }
}

// ----------------------------------------------------------------------------
// 7. Test Firebase Cloud Connectivity (Probe Read & Write)
// ----------------------------------------------------------------------------
export async function testFirebaseCloudConnection(): Promise<CloudConnectionTestResult> {
  const startTime = Date.now();
  let canRead = false;
  let canWrite = false;
  let remoteDocsCount = 0;
  let readError: string | undefined;
  let writeError: string | undefined;
  let code: string | undefined;

  const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();

  // 1. Test Read (Public Read)
  try {
    const querySnapshot = await getDocs(collection(db, EVALUATIONS_COLLECTION));
    canRead = true;
    remoteDocsCount = querySnapshot.size;
  } catch (err: any) {
    canRead = false;
    readError = err?.message || 'Failed to read evaluations';
    code = err?.code;
  }

  // 2. Test Write Probe (With secret token if authorized)
  try {
    const probeRef = doc(db, EVALUATIONS_COLLECTION, '_connection_test_probe');
    await setDoc(
      probeRef,
      {
        probeType: 'admin_health_check',
        probedAt: new Date().toISOString(),
        client: 'HostelsEval-Admin-Probe',
        secretCode: secretCode || undefined,
      },
      { merge: true }
    );
    canWrite = true;
  } catch (err: any) {
    canWrite = false;
    writeError = err?.message || 'Failed to write probe';
    code = err?.code || code;
  }

  const latencyMs = Date.now() - startTime;

  return {
    canRead,
    canWrite,
    remoteDocsCount,
    readError,
    writeError,
    code,
    latencyMs,
  };
}

// ============================================================================
// 8. Inspection Timeline & Defect Follow-up History
// ============================================================================
export const TIMELINE_STORAGE_KEY = 'hostels_inspection_timeline';

export function getBuildingTimeline(buildingId?: string): EvaluationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(TIMELINE_STORAGE_KEY);
    if (!raw) return [];
    const entries: EvaluationHistoryEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];

    if (buildingId) {
      return entries.filter(
        (e) => e.buildingId.toUpperCase() === buildingId.toUpperCase()
      );
    }
    return entries;
  } catch (err) {
    console.warn('[FirestoreService] Failed to load timeline:', err);
    return [];
  }
}

export function recordEvaluationHistory(entry: EvaluationHistoryEntry): void {
  try {
    const current = getBuildingTimeline();
    // Keep most recent first (up to 500 records)
    const updated = [entry, ...current].slice(0, 500);
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_timeline_updated', {
          detail: { entry, buildingId: entry.buildingId },
        })
      );
    }
  } catch (err) {
    console.warn('[FirestoreService] Failed to record timeline entry:', err);
  }
}

export function resolveTimelineIssue(
  historyId: string,
  resolutionNotes: string,
  resolvedBy: string
): void {
  try {
    const current = getBuildingTimeline();
    const updated = current.map((item) => {
      if (item.id === historyId) {
        return {
          ...item,
          isResolved: true,
          resolutionNotes,
          resolvedBy,
          resolvedAt: new Date().toISOString(),
        };
      }
      return item;
    });
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_timeline_updated', {
          detail: { historyId, isResolved: true },
        })
      );
    }
  } catch (err) {
    console.warn('[FirestoreService] Failed to resolve timeline issue:', err);
  }
}

// ============================================================================
// 9. Reset Building Evaluations (Per-Building Reset)
// ============================================================================
export async function resetBuildingEvaluations(
  buildingId: string
): Promise<{ success: boolean; clearedCount: number; error?: string }> {
  const bId = buildingId.toUpperCase();
  const cache = getLocalCache();
  let clearedCount = 0;
  const remaining: Record<string, FixtureEvaluation> = {};
  const keysToDelete: string[] = [];

  for (const [id, evalItem] of Object.entries(cache)) {
    if (evalItem.buildingId.toUpperCase() === bId) {
      clearedCount += 1;
      keysToDelete.push(id);
    } else {
      remaining[id] = evalItem;
    }
  }

  // Update local cache
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
  } catch (err) {
    console.warn('Failed to update local cache during reset:', err);
  }

  // Also clear timeline history for this building
  try {
    const timeline = getBuildingTimeline();
    const remainingTimeline = timeline.filter((t) => t.buildingId.toUpperCase() !== bId);
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(remainingTimeline));
  } catch (err) {
    console.warn('Failed to clear timeline during reset:', err);
  }

  // Delete from Firestore if authorized
  const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
  if (secretCode && keysToDelete.length > 0) {
    try {
      await Promise.all(
        keysToDelete.map((id) => deleteDoc(doc(db, EVALUATIONS_COLLECTION, id)))
      );
    } catch (err: any) {
      console.warn('[Firestore] Remote delete failed during reset:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hostels_building_reset', {
        detail: { buildingId: bId, clearedCount },
      })
    );
  }

  return { success: true, clearedCount };
}

// ============================================================================
// 10. Data Export (JSON & CSV per Building or All)
// ============================================================================
export function exportBuildingDataAsJSON(buildingId?: string): string {
  const allEvaluations = getAllCachedEvaluations();
  const filteredEvals = buildingId
    ? allEvaluations.filter((e) => e.buildingId.toUpperCase() === buildingId.toUpperCase())
    : allEvaluations;

  const timeline = getBuildingTimeline(buildingId);

  const exportPayload = {
    exportDate: new Date().toISOString(),
    buildingId: buildingId ? buildingId.toUpperCase() : 'ALL_BUILDINGS',
    totalEvaluations: filteredEvals.length,
    evaluations: filteredEvals,
    timelineHistory: timeline,
  };

  return JSON.stringify(exportPayload, null, 2);
}

export function exportBuildingDataAsCSV(buildingId?: string): string {
  const allEvaluations = getAllCachedEvaluations();
  const filteredEvals = buildingId
    ? allEvaluations.filter((e) => e.buildingId.toUpperCase() === buildingId.toUpperCase())
    : allEvaluations;

  const headers = [
    'معرف المرفق (Fixture ID)',
    'المبنى (Building)',
    'الدور (Floor)',
    'الجناح/البرج (Wing/Tower)',
    'التصنيف (Category)',
    'نوع المرفق (Type)',
    'الحالة (Status)',
    'الأعطال المرصودة (Defects)',
    'الملاحظات (Notes)',
    'اسم الفاحص (Inspector)',
    'تاريخ التقييم (Updated At)',
  ];

  const rows = filteredEvals.map((e) => [
    `"${e.id}"`,
    `"${e.buildingId}"`,
    `"${e.floor}"`,
    `"${e.wingId}"`,
    `"${e.categoryCode}"`,
    `"${e.fixtureTypeCode}"`,
    `"${e.status === 'operational' ? 'سليم' : e.status === 'needs_maintenance' ? 'يحتاج صيانة' : 'عاطل'}"`,
    `"${(e.defects || []).join(' - ')}"`,
    `"${(e.notes || '').replace(/"/g, '""')}"`,
    `"${e.inspectorName || 'غير محدد'}"`,
    `"${e.updatedAt}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

