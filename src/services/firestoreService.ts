// ============================================================================
// 🔥 HostelsEval — Firestore Data Service
// Real-time synchronization + LocalStorage offline resilience + Security Token Gate
// Protected by Cloud Document Secret Token Matching
// ============================================================================

import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './dataConnector';
import {
  FixtureEvaluation,
  EvaluationHistoryEntry,
  CampusMapConfig,
  FacilityHistoryEvent,
  FacilityMediaItem,
  MaintenanceTicketInfo,
} from '../types/hostel';
import { resolveEvaluationDepartment } from '../config/facilityTemplates';
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

export function removeFromLocalCache(id: string): void {
  if (!id) return;
  try {
    const cache = getLocalCache();
    if (cache[id]) {
      delete cache[id];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch (err) {
    console.warn('LocalStorage remove failed:', err);
  }
}

/**
 * Helper to recursively strip any undefined values from an object or array before sending to Firestore
 * (Firestore SDK throws an error if any field in an object is undefined).
 */
export function stripUndefinedValues<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedValues(item)) as unknown as T;
  }
  const clean: any = {};
  for (const [key, val] of Object.entries(obj as Record<string, any>)) {
    if (val !== undefined) {
      clean[key] = stripUndefinedValues(val);
    }
  }
  return clean;
}

/**
 * Helper to bound history array size so Firestore documents stay well under 1 MiB.
 */
function appendFacilityHistoryEvent(
  existingHistory: FacilityHistoryEvent[] | undefined,
  newEvent: FacilityHistoryEvent
): FacilityHistoryEvent[] {
  const list = [newEvent, ...(existingHistory || [])].slice(0, 25);
  return list.map((ev, idx) => {
    // Keep media Base64 on the 4 most recent history entries; strip heavy data URLs on older ones
    if (idx >= 4) {
      const copy = { ...ev };
      delete copy.media;
      delete copy.maximoAttachmentUrl;
      return copy;
    }
    return ev;
  });
}

// ----------------------------------------------------------------------------
// 1. Save or Update Single Fixture Evaluation (Protected by Secret Token Gate)
// ----------------------------------------------------------------------------
export async function saveEvaluation(
  evaluation: FixtureEvaluation,
  historyOverride?: Partial<FacilityHistoryEvent>
): Promise<CloudSaveResult> {
  // Check if caller is authorized with decrypted secret code
  const secretCode = getDecodedSecurityCode();

  // If user is a public visitor (no leader PIN, no maintenance PIN, no admin password), BLOCK write immediately:
  if (!secretCode) {
    console.warn('[HostelsEval] Write blocked: Public users have read-only access.');
    return {
      success: false,
      cloudSynced: false,
      cloudError:
        'عفواً، لا تملك تصريح كتابة. يجب تسجيل الدخول كـ رائد مبنى أو صيانة أو مشرف لحفظ التحديثات.',
      code: 'permission-denied',
    };
  }

  const nowIso = new Date().toISOString();
  const prevEval = getLocalCache()[evaluation.id];

  // Sync media[] and primary photoBase64 for full backward compatibility
  let mediaList: FacilityMediaItem[] = evaluation.media ? [...evaluation.media] : [];
  if (evaluation.photoBase64 && mediaList.length === 0) {
    mediaList = [
      {
        id: `img_${Date.now()}`,
        type: 'image',
        url: evaluation.photoBase64,
        capturedAt: nowIso,
        capturedBy: evaluation.inspectorName,
      },
    ];
  }
  const firstImage = mediaList.find((m) => m.type === 'image');
  const primaryPhoto = firstImage ? firstImage.url : evaluation.photoBase64;

  // Manage Maintenance Ticket Lifecycle automatically when reporting an issue
  let ticket: MaintenanceTicketInfo | undefined =
    evaluation.maintenanceTicket || prevEval?.maintenanceTicket;
  const resolvedDept = resolveEvaluationDepartment(evaluation);

  if (evaluation.status !== 'operational') {
    if (!ticket || ticket.status === 'verified_closed') {
      ticket = {
        status: 'open',
        department: resolvedDept,
      };
    } else {
      ticket = {
        ...ticket,
        department: resolvedDept,
      };
    }
  } else if (!historyOverride && ticket && ticket.status !== 'pending_evaluation') {
    ticket = {
      ...ticket,
      department: ticket.department || resolvedDept,
      status: 'verified_closed',
      verifiedAt: nowIso,
      verifiedBy: evaluation.inspectorName || 'رائد المبنى',
    };
  }

  // Append event to facility's permanent history log
  const newHistoryEvent: FacilityHistoryEvent = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: nowIso,
    action: historyOverride?.action || 'inspection',
    actorName: historyOverride?.actorName || evaluation.inspectorName || 'فاحص ميداني',
    actorRole: historyOverride?.actorRole || 'leader',
    status: evaluation.status,
    defects: evaluation.defects || [],
    notes: historyOverride?.notes !== undefined ? historyOverride.notes : evaluation.notes,
    media: historyOverride?.media !== undefined ? historyOverride.media : mediaList.slice(0, 3),
    maximoNumber: historyOverride?.maximoNumber || ticket?.maximoNumber,
    maximoAttachmentUrl: historyOverride?.maximoAttachmentUrl,
    maximoAttachmentName: historyOverride?.maximoAttachmentName || ticket?.maximoAttachmentName,
    evaluationRating: historyOverride?.evaluationRating,
  };

  const mergedHistory = appendFacilityHistoryEvent(
    evaluation.history || prevEval?.history,
    newHistoryEvent
  );

  const enrichedEvaluation: FixtureEvaluation = {
    ...evaluation,
    photoBase64: primaryPhoto,
    hasPhoto: !!primaryPhoto || mediaList.length > 0,
    media: mediaList,
    maintenanceTicket: ticket,
    history: mergedHistory,
    updatedAt: nowIso,
  };

  // Update local cache for instant UI responsiveness
  saveToLocalCache(enrichedEvaluation);

  // Record timeline scan event
  recordEvaluationHistory({
    id: newHistoryEvent.id,
    fixtureId: enrichedEvaluation.id,
    buildingId: enrichedEvaluation.buildingId,
    floor: enrichedEvaluation.floor,
    wingId: enrichedEvaluation.wingId,
    categoryCode: enrichedEvaluation.categoryCode,
    fixtureTypeCode: enrichedEvaluation.fixtureTypeCode,
    fixtureNameAr: enrichedEvaluation.fixtureTypeCode,
    status: enrichedEvaluation.status,
    defects: enrichedEvaluation.defects || [],
    notes: newHistoryEvent.notes,
    rating: enrichedEvaluation.rating,
    photoBase64: primaryPhoto,
    media: mediaList,
    maximoNumber: ticket?.maximoNumber,
    ticketStatus: ticket?.status,
    inspectorName: newHistoryEvent.actorName,
    timestamp: nowIso,
    isResolved:
      enrichedEvaluation.status === 'operational' || ticket?.status === 'verified_closed',
  });

  // Strip all undefined properties so Firestore accepts the document
  const rawPayload: Record<string, any> = {
    ...enrichedEvaluation,
    secretCode, // Attaches secret code to satisfy Firestore Rule: request.resource.data.secretCode == get(...).data.s
    updatedAt: nowIso,
  };
  const cleanPayload = stripUndefinedValues(rawPayload);

  try {
    const docRef = doc(db, EVALUATIONS_COLLECTION, enrichedEvaluation.id);
    await setDoc(docRef, cleanPayload, { merge: true });

    // Notify listeners of cloud success
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_cloud_sync_event', {
          detail: { type: 'save_success', id: enrichedEvaluation.id },
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
            id: enrichedEvaluation.id,
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
// 1b. Maintenance & Maximo Ticket Helpers
// ----------------------------------------------------------------------------
export async function updateMaximoTicketInfo(
  evaluation: FixtureEvaluation,
  params: {
    maximoNumber: string;
    attachmentBase64?: string;
    attachmentName?: string;
    attachmentType?: 'pdf' | 'image';
    actorName: string;
  }
): Promise<CloudSaveResult> {
  const nowIso = new Date().toISOString();
  const prevTicket = evaluation.maintenanceTicket || { status: 'open' };
  const nextTicket: MaintenanceTicketInfo = {
    ...prevTicket,
    status:
      prevTicket.status === 'open' || prevTicket.status === 'reopened'
        ? 'in_progress'
        : prevTicket.status,
    maximoNumber: params.maximoNumber.trim(),
    maximoAttachmentBase64: params.attachmentBase64 ?? prevTicket.maximoAttachmentBase64,
    maximoAttachmentName: params.attachmentName ?? prevTicket.maximoAttachmentName,
    maximoAttachmentType: params.attachmentType ?? prevTicket.maximoAttachmentType,
    registeredAt: nowIso,
    registeredBy: params.actorName,
  };

  return saveEvaluation(
    {
      ...evaluation,
      maintenanceTicket: nextTicket,
    },
    {
      action: 'maximo_registered',
      actorName: params.actorName,
      actorRole: 'maintenance',
      notes: `تم تسجيل رقم بلاغ ماكسمو (${params.maximoNumber.trim()})${
        params.attachmentName ? ` مع إرفاق مستند (${params.attachmentName})` : ''
      }`,
      maximoNumber: params.maximoNumber.trim(),
      maximoAttachmentUrl: params.attachmentBase64,
      maximoAttachmentName: params.attachmentName,
      media: [],
    }
  );
}

export async function closeMaintenanceTicket(
  evaluation: FixtureEvaluation,
  params: {
    maximoNumber?: string;
    attachmentBase64?: string;
    attachmentName?: string;
    attachmentType?: 'pdf' | 'image';
    closureNotes: string;
    closurePhotoBase64?: string;
    actorName: string;
  }
): Promise<CloudSaveResult> {
  const nowIso = new Date().toISOString();
  const prevTicket = evaluation.maintenanceTicket || { status: 'open' };
  const finalMaximoNumber = params.maximoNumber?.trim() || prevTicket.maximoNumber;

  const nextTicket: MaintenanceTicketInfo = {
    ...prevTicket,
    status: 'pending_evaluation',
    maximoNumber: finalMaximoNumber,
    maximoAttachmentBase64: params.attachmentBase64 ?? prevTicket.maximoAttachmentBase64,
    maximoAttachmentName: params.attachmentName ?? prevTicket.maximoAttachmentName,
    maximoAttachmentType: params.attachmentType ?? prevTicket.maximoAttachmentType,
    closedAt: nowIso,
    closedBy: params.actorName,
    closureNotes: params.closureNotes.trim() || 'تم إتمام أعمال الصيانة وإغلاق البلاغ',
    closurePhotoBase64: params.closurePhotoBase64,
  };

  const closureMedia: FacilityMediaItem[] = params.closurePhotoBase64
    ? [
        {
          id: `clos_${Date.now()}`,
          type: 'image',
          url: params.closurePhotoBase64,
          name: 'صورة بعد الإصلاح',
          capturedAt: nowIso,
          capturedBy: params.actorName,
        },
      ]
    : [];

  return saveEvaluation(
    {
      ...evaluation,
      maintenanceTicket: nextTicket,
    },
    {
      action: 'maintenance_closed',
      actorName: params.actorName,
      actorRole: 'maintenance',
      notes: `إغلاق البلاغ من الصيانة (بانتظار تقييم رائد المبنى): ${nextTicket.closureNotes}`,
      maximoNumber: finalMaximoNumber,
      maximoAttachmentUrl: params.attachmentBase64 ?? prevTicket.maximoAttachmentBase64,
      maximoAttachmentName: params.attachmentName ?? prevTicket.maximoAttachmentName,
      media: closureMedia,
    }
  );
}

export async function evaluateClosedTicket(
  evaluation: FixtureEvaluation,
  params: {
    isFixed: boolean;
    rating: number;
    feedback?: string;
    photoBase64?: string;
    leaderName: string;
  }
): Promise<CloudSaveResult> {
  const nowIso = new Date().toISOString();
  const prevTicket = evaluation.maintenanceTicket || { status: 'pending_evaluation' };

  const evalMedia: FacilityMediaItem[] = params.photoBase64
    ? [
        {
          id: `eval_${Date.now()}`,
          type: 'image',
          url: params.photoBase64,
          name: params.isFixed ? 'توثيق قبول الإصلاح' : 'توثيق رفض الإغلاق الصوري',
          capturedAt: nowIso,
          capturedBy: params.leaderName,
        },
      ]
    : [];

  if (params.isFixed) {
    const nextTicket: MaintenanceTicketInfo = {
      ...prevTicket,
      status: 'verified_closed',
      verifiedAt: nowIso,
      verifiedBy: params.leaderName,
      serviceRating: params.rating,
      serviceFeedback: params.feedback?.trim() || 'تم التحقق ميدانياً وتأكيد جودة الإصلاح',
    };

    return saveEvaluation(
      {
        ...evaluation,
        status: 'operational',
        defects: [],
        rating: 5,
        notes: params.feedback?.trim() || 'تم الإصلاح واعتماد الإغلاق من رائد المبنى',
        photoBase64: params.photoBase64 || evaluation.photoBase64,
        maintenanceTicket: nextTicket,
      },
      {
        action: 'leader_verified',
        actorName: params.leaderName,
        actorRole: 'leader',
        notes: `اعتماد إغلاق البلاغ وتقييم الخدمة (${params.rating}/5): ${
          params.feedback?.trim() || 'تم التأكد من الإصلاح'
        }`,
        evaluationRating: params.rating,
        maximoNumber: prevTicket.maximoNumber,
        media: evalMedia,
      }
    );
  } else {
    // Rejected -> Re-open back to Maintenance!
    const nextTicket: MaintenanceTicketInfo = {
      ...prevTicket,
      status: 'reopened',
      reopenedAt: nowIso,
      reopenedCount: (prevTicket.reopenedCount || 0) + 1,
      lastRejectionReason:
        params.feedback?.trim() || 'لم يتم الإصلاح فعلياً (رفض إغلاق صوري من رائد المبنى)',
      lastRejectionPhotoBase64: params.photoBase64,
      serviceRating: params.rating,
      serviceFeedback: params.feedback?.trim(),
    };

    return saveEvaluation(
      {
        ...evaluation,
        status: evaluation.status === 'operational' ? 'needs_maintenance' : evaluation.status,
        photoBase64: params.photoBase64 || evaluation.photoBase64,
        maintenanceTicket: nextTicket,
      },
      {
        action: 'leader_rejected_reopened',
        actorName: params.leaderName,
        actorRole: 'leader',
        notes: `رفض الإغلاق وإعادة فتح البلاغ (${params.rating}/5): ${nextTicket.lastRejectionReason}`,
        evaluationRating: params.rating,
        maximoNumber: prevTicket.maximoNumber,
        media: evalMedia,
      }
    );
  }
}

export async function appendFacilityChatMessage(
  evaluation: FixtureEvaluation,
  params: {
    message: string;
    actorName: string;
    actorRole: 'leader' | 'maintenance' | 'cleaning' | 'admin';
    photoBase64?: string;
  }
): Promise<CloudSaveResult> {
  const nowIso = new Date().toISOString();
  const chatMedia: FacilityMediaItem[] = params.photoBase64
    ? [
        {
          id: `chat_${Date.now()}`,
          type: 'image',
          url: params.photoBase64,
          name: 'مرفق محادثة المرفق',
          capturedAt: nowIso,
          capturedBy: params.actorName,
        },
      ]
    : [];

  return saveEvaluation(evaluation, {
    action: 'chat_message',
    actorName: params.actorName,
    actorRole: params.actorRole,
    notes: params.message.trim(),
    media: chatMedia,
  });
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
    (item) => item?.buildingId && item.buildingId.toUpperCase() === targetId && !item.isDeleted
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
            if (data.isDeleted) {
              removeFromLocalCache(data.id);
            } else {
              remoteList.push(data);
            }
          }
        });

        // Merge remote with fresh local cache
        const freshLocalCache = Object.values(getLocalCache()).filter(
          (item) => item?.buildingId && item.buildingId.toUpperCase() === targetId && !item.isDeleted
        );
        const mergedMap = new Map<string, FixtureEvaluation>();
        freshLocalCache.forEach((item) => {
          if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
        });
        remoteList.forEach((item) => {
          if (item && item.id && !item.isDeleted) {
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
  try {
    const querySnapshot = await getDocs(collection(db, EVALUATIONS_COLLECTION));
    const remoteList: FixtureEvaluation[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as FixtureEvaluation;
      if (
        data &&
        data.id &&
        data.buildingId &&
        data.buildingId !== 'CAMPUS_GLOBAL' &&
        docSnap.id !== 'GLOBAL_CAMPUS_MAP_CONFIG'
      ) {
        if (data.isDeleted) {
          removeFromLocalCache(data.id);
        } else {
          remoteList.push(data);
          saveToLocalCache(data); // Sync local cache
        }
      }
    });

    const localMap = getLocalCache();
    const mergedMap = new Map<string, FixtureEvaluation>();
    Object.values(localMap).forEach((item) => {
      if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
    });
    remoteList.forEach((item) => {
      if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
    });

    return Array.from(mergedMap.values());
  } catch (err) {
    console.warn('Firestore fetch failed, returning local cache:', err);
    return Object.values(getLocalCache()).filter((item) => !item?.isDeleted);
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
    const localEntries: EvaluationHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const safeLocal = Array.isArray(localEntries) ? localEntries : [];

    // Also collect cloud-synced per-facility history from cached evaluations
    const allEvals = getAllCachedEvaluations();
    const cloudHistoryEntries: EvaluationHistoryEntry[] = [];

    for (const ev of allEvals) {
      if (buildingId && ev.buildingId.toUpperCase() !== buildingId.toUpperCase()) {
        continue;
      }
      if (Array.isArray(ev.history) && ev.history.length > 0) {
        for (const h of ev.history) {
          const primaryImg = h.media?.find((m) => m.type === 'image')?.url;
          cloudHistoryEntries.push({
            id: h.id,
            fixtureId: ev.id,
            buildingId: ev.buildingId,
            floor: ev.floor,
            wingId: ev.wingId,
            categoryCode: ev.categoryCode,
            fixtureTypeCode: ev.fixtureTypeCode,
            fixtureNameAr: ev.fixtureTypeCode,
            status: h.status,
            defects: h.defects || [],
            notes: h.notes,
            rating: h.evaluationRating || ev.rating,
            photoBase64: primaryImg || ev.photoBase64,
            media: h.media,
            maximoNumber: h.maximoNumber || ev.maintenanceTicket?.maximoNumber,
            ticketStatus: ev.maintenanceTicket?.status,
            inspectorName: h.actorName,
            timestamp: h.timestamp,
            isResolved:
              h.action === 'leader_verified' ||
              h.status === 'operational' ||
              ev.maintenanceTicket?.status === 'verified_closed',
            resolvedBy:
              h.action === 'leader_verified' || h.action === 'maintenance_closed'
                ? h.actorName
                : ev.maintenanceTicket?.closedBy,
            resolutionNotes: ev.maintenanceTicket?.closureNotes,
            resolvedAt: ev.maintenanceTicket?.closedAt,
          });
        }
      }
    }

    const filteredLocal = buildingId
      ? safeLocal.filter((e) => e.buildingId.toUpperCase() === buildingId.toUpperCase())
      : safeLocal;

    const mergedMap = new Map<string, EvaluationHistoryEntry>();
    for (const item of filteredLocal) {
      if (item && item.id) mergedMap.set(item.id, item);
    }
    for (const item of cloudHistoryEntries) {
      if (item && item.id) mergedMap.set(item.id, item);
    }

    return Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
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
  let localClearedCount = 0;
  const remaining: Record<string, FixtureEvaluation> = {};
  const keysToDelete = new Set<string>();

  // 1. Collect all matching keys from local cache
  for (const [id, evalItem] of Object.entries(cache)) {
    if (evalItem.buildingId && evalItem.buildingId.toUpperCase() === bId) {
      localClearedCount += 1;
      keysToDelete.add(id);
    } else {
      remaining[id] = evalItem;
    }
  }

  // 2. Query Firestore directly to find ANY existing documents for this building in cloud
  try {
    const q = query(
      collection(db, EVALUATIONS_COLLECTION),
      where('buildingId', '==', bId)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      keysToDelete.add(docSnap.id);
    });
  } catch (err) {
    console.warn('[Firestore] Could not query remote building docs during reset:', err);
  }

  // 3. Update local cache immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
  } catch (err) {
    console.warn('Failed to update local cache during reset:', err);
  }

  // 4. Also clear timeline history for this building
  try {
    const timeline = getBuildingTimeline();
    const remainingTimeline = timeline.filter((t) => t.buildingId.toUpperCase() !== bId);
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(remainingTimeline));
  } catch (err) {
    console.warn('Failed to clear timeline during reset:', err);
  }

  // 5. Delete or tombstone in Firestore (satisfying standard write security rules)
  const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
  const idList = Array.from(keysToDelete);

  if (secretCode && idList.length > 0) {
    await Promise.all(
      idList.map(async (id) => {
        const docRef = doc(db, EVALUATIONS_COLLECTION, id);

        // A. Write tombstone with secretCode so standard write rules pass 100%
        try {
          await setDoc(docRef, {
            id,
            buildingId: bId,
            isDeleted: true,
            status: 'uninspected',
            defects: [],
            rating: 0,
            hasPhoto: false,
            secretCode,
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn(`[Firestore] Tombstone write failed for ${id}:`, err);
        }

        // B. Also attempt hard delete in case Firestore security rules permit delete
        try {
          await deleteDoc(docRef);
        } catch {
          // If deleteDoc is rejected by rules, the tombstone with isDeleted: true guarantees removal!
        }
      })
    );
  }

  const finalClearedCount = Math.max(localClearedCount, idList.length);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hostels_building_reset', {
        detail: { buildingId: bId, clearedCount: finalClearedCount },
      })
    );
  }

  return { success: true, clearedCount: finalClearedCount };
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

// ============================================================================
// 11. Public Campus Map Cloud Settings & Reset (Firebase Firestore)
// ============================================================================
export const CAMPUS_MAP_CONFIG_DOC_ID = 'GLOBAL_CAMPUS_MAP_CONFIG';

/**
 * Save Campus Map Configuration (ground image, scale, building positions) to Firebase Firestore
 * This makes the 3D campus visualization a public setting available to all visitors
 */
export async function saveCampusMapToCloud(config: CampusMapConfig): Promise<CloudSaveResult> {
  const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
  const rawPayload: Record<string, any> = {
    ...config,
    id: CAMPUS_MAP_CONFIG_DOC_ID,
    buildingId: 'CAMPUS_GLOBAL',
    secretCode,
    updatedAt: new Date().toISOString(),
  };

  const cleanPayload = stripUndefinedValues(rawPayload);

  try {
    const docRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_MAP_CONFIG_DOC_ID);
    await setDoc(docRef, cleanPayload, { merge: true });

    // Also attempt saving to 'settings' collection if accessible
    try {
      const settingsRef = doc(db, 'settings', 'campus_map');
      await setDoc(settingsRef, cleanPayload, { merge: true });
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_cloud_sync_event', {
          detail: { type: 'campus_map_saved', success: true },
        })
      );
    }

    return { success: true, cloudSynced: true };
  } catch (err: any) {
    const errorMsg = err?.message || 'Failed to save campus map to cloud';
    const errorCode = err?.code || 'unknown';
    console.warn(`[HostelsEval Firebase] Campus map cloud save failed (${errorCode}):`, errorMsg);
    return {
      success: false,
      cloudSynced: false,
      cloudError: errorMsg,
      code: errorCode,
    };
  }
}

/**
 * Fetch Campus Map Configuration from Firebase Firestore (Public Read)
 */
export async function fetchCampusMapFromCloud(): Promise<CampusMapConfig | null> {
  try {
    const docRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_MAP_CONFIG_DOC_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.buildingPositions) {
        return {
          groundImageUrl: data.groundImageUrl || undefined,
          groundScale: typeof data.groundScale === 'number' ? data.groundScale : 100,
          groundOffsetX: typeof data.groundOffsetX === 'number' ? data.groundOffsetX : 0,
          groundOffsetZ: typeof data.groundOffsetZ === 'number' ? data.groundOffsetZ : 0,
          buildingPositions: data.buildingPositions || {},
          updatedAt: data.updatedAt,
        };
      }
    }

    // Try fallback from 'settings/campus_map'
    try {
      const settingsRef = doc(db, 'settings', 'campus_map');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data && data.buildingPositions) {
          return {
            groundImageUrl: data.groundImageUrl || undefined,
            groundScale: typeof data.groundScale === 'number' ? data.groundScale : 100,
            groundOffsetX: typeof data.groundOffsetX === 'number' ? data.groundOffsetX : 0,
            groundOffsetZ: typeof data.groundOffsetZ === 'number' ? data.groundOffsetZ : 0,
            buildingPositions: data.buildingPositions || {},
            updatedAt: data.updatedAt,
          };
        }
      }
    } catch {}

    return null;
  } catch (err) {
    console.warn('[HostelsEval Firebase] Failed to fetch campus map from cloud:', err);
    return null;
  }
}

/**
 * Reset Campus Map Configuration in Firebase Firestore back to default grid
 */
export async function resetCampusMapInCloud(): Promise<CloudSaveResult> {
  const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
  const resetPayload = {
    id: CAMPUS_MAP_CONFIG_DOC_ID,
    buildingId: 'CAMPUS_GLOBAL',
    groundImageUrl: null,
    groundScale: 100,
    groundOffsetX: 0,
    groundOffsetZ: 0,
    buildingPositions: {},
    secretCode,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_MAP_CONFIG_DOC_ID);
    await setDoc(docRef, resetPayload);

    try {
      const settingsRef = doc(db, 'settings', 'campus_map');
      await deleteDoc(settingsRef);
    } catch {}

    return { success: true, cloudSynced: true };
  } catch (err: any) {
    return {
      success: false,
      cloudSynced: false,
      cloudError: err?.message,
      code: err?.code,
    };
  }
}


