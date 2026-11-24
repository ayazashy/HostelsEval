// ============================================================================
// HostelsEval — Firestore Data Service
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
  FacilityMediaMeta,
  FacilityMediaVaultDoc,
  MaintenanceTicketInfo,
} from '../types/hostel';
import { resolveEvaluationDepartment, isCleaningOrPestTicket } from '../config/facilityTemplates';
import {
  getDecodedSecurityCode,
  getAdminRawSecurityCode,
  FIRESTORE_SECRET_COLLECTION,
  FIRESTORE_SECRET_DOC,
  FIRESTORE_SECRET_FIELD,
} from '../utils/securityGate';
import {
  getActiveCallerRole,
  checkActiveLeaderAuth,
  checkIsAdminUnlocked,
} from '../utils/sessionStore';
import { runWithNetworkProgress } from '../utils/networkProgressStore';
import {
  estimateFirestoreDocSizeBytes,
  SAFE_FIRESTORE_DOC_BYTES,
  MAX_SINGLE_FILE_BASE64_BYTES,
} from '../utils/imageCompressor';

export const EVALUATIONS_COLLECTION = 'evaluations';
export const LOCAL_STORAGE_KEY = 'hostels_eval_local_cache';
export const CAMPUS_LIGHT_INDEX_DOC_ID = 'GLOBAL_CAMPUS_LIGHT_INDEX';
export const MEDIA_DOC_PREFIX = 'MEDIA_';

// ----------------------------------------------------------------------------
// In-Memory Caches & On-Demand Media Vault LRU (Prevents OOM on Old Devices)
// ----------------------------------------------------------------------------
const MAX_LRU_MEDIA_CACHE_ENTRIES = 8;
const mediaVaultLruCache = new Map<string, FacilityMediaVaultDoc>();
const migratedLegacyIds = new Set<string>();
let memoryEvalCache: Record<string, FixtureEvaluation> | null = null;
let isBackgroundMigrationRunning = false;

export function getMediaVaultFromLru(fixtureId: string): FacilityMediaVaultDoc | undefined {
  if (!fixtureId) return undefined;
  const existing = mediaVaultLruCache.get(fixtureId);
  if (!existing) return undefined;
  // Refresh LRU order
  mediaVaultLruCache.delete(fixtureId);
  mediaVaultLruCache.set(fixtureId, existing);
  return existing;
}

export function putMediaVaultInLru(fixtureId: string, vault: FacilityMediaVaultDoc): void {
  if (!fixtureId || !vault) return;
  const prev = mediaVaultLruCache.get(fixtureId);
  const merged: FacilityMediaVaultDoc = {
    ...(prev || {}),
    ...vault,
    id: `${MEDIA_DOC_PREFIX}${fixtureId}`,
    fixtureId,
    buildingId: 'MEDIA_VAULT',
    photoBase64: vault.photoBase64 || prev?.photoBase64,
    media: vault.media && vault.media.length > 0 ? vault.media : prev?.media,
    closurePhotoBase64: vault.closurePhotoBase64 || prev?.closurePhotoBase64,
    maximoAttachmentBase64: vault.maximoAttachmentBase64 || prev?.maximoAttachmentBase64,
    maximoAttachmentName: vault.maximoAttachmentName || prev?.maximoAttachmentName,
    maximoAttachmentType: vault.maximoAttachmentType || prev?.maximoAttachmentType,
    lastRejectionPhotoBase64: vault.lastRejectionPhotoBase64 || prev?.lastRejectionPhotoBase64,
    historyMediaById: {
      ...(prev?.historyMediaById || {}),
      ...(vault.historyMediaById || {}),
    },
    updatedAt: vault.updatedAt || prev?.updatedAt || new Date().toISOString(),
  };

  if (mediaVaultLruCache.has(fixtureId)) {
    mediaVaultLruCache.delete(fixtureId);
  }
  mediaVaultLruCache.set(fixtureId, merged);

  while (mediaVaultLruCache.size > MAX_LRU_MEDIA_CACHE_ENTRIES) {
    const oldestKey = mediaVaultLruCache.keys().next().value;
    if (oldestKey) {
      mediaVaultLruCache.delete(oldestKey);
    } else {
      break;
    }
  }
}

function isBase64DataUri(val: unknown): val is string {
  return typeof val === 'string' && val.length > 64 && (val.startsWith('data:') || val.length > 500);
}

/**
 * Extracts any embedded Base64 media from an evaluation object into a dedicated FacilityMediaVaultDoc.
 * Returns null if the object contains no embedded Base64 blobs.
 */
export function extractMediaVaultFromEvaluation(raw: any): FacilityMediaVaultDoc | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;

  let hasAnyBase64 = false;
  const vault: FacilityMediaVaultDoc = {
    id: `${MEDIA_DOC_PREFIX}${raw.id}`,
    fixtureId: raw.id,
    buildingId: 'MEDIA_VAULT',
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };

  if (isBase64DataUri(raw.photoBase64)) {
    vault.photoBase64 = raw.photoBase64;
    hasAnyBase64 = true;
  }

  if (Array.isArray(raw.media)) {
    const validMedia = raw.media.filter(
      (m: any) => m && typeof m === 'object' && isBase64DataUri(m.url)
    );
    if (validMedia.length > 0) {
      vault.media = validMedia;
      if (!vault.photoBase64) {
        const firstImg = validMedia.find((m: any) => m.type === 'image');
        if (firstImg) vault.photoBase64 = firstImg.url;
      }
      hasAnyBase64 = true;
    }
  }

  const t = raw.maintenanceTicket;
  if (t && typeof t === 'object') {
    if (isBase64DataUri(t.closurePhotoBase64)) {
      vault.closurePhotoBase64 = t.closurePhotoBase64;
      hasAnyBase64 = true;
    }
    if (isBase64DataUri(t.maximoAttachmentBase64)) {
      vault.maximoAttachmentBase64 = t.maximoAttachmentBase64;
      vault.maximoAttachmentName = t.maximoAttachmentName;
      vault.maximoAttachmentType = t.maximoAttachmentType;
      hasAnyBase64 = true;
    }
    if (isBase64DataUri(t.lastRejectionPhotoBase64)) {
      vault.lastRejectionPhotoBase64 = t.lastRejectionPhotoBase64;
      hasAnyBase64 = true;
    }
  }

  if (Array.isArray(raw.history)) {
    const historyMediaById: Record<string, FacilityMediaItem[]> = {};
    for (const h of raw.history) {
      if (h && typeof h === 'object' && typeof h.id === 'string' && Array.isArray(h.media)) {
        const validEventMedia = h.media.filter(
          (m: any) => m && typeof m === 'object' && isBase64DataUri(m.url)
        );
        if (validEventMedia.length > 0) {
          historyMediaById[h.id] = validEventMedia;
          hasAnyBase64 = true;
        }
      }
    }
    if (Object.keys(historyMediaById).length > 0) {
      vault.historyMediaById = historyMediaById;
    }
  }

  return hasAnyBase64 ? vault : null;
}

/**
 * Strips all heavy Base64 blobs from an evaluation record while preserving lightweight
 * metadata flags (hasPhoto, mediaCount, mediaMeta, hasClosurePhoto, hasMaximoAttachment, etc.)
 * so devices never run out of RAM or localStorage quota.
 */
export function stripHeavyMediaFromEvaluation(data: any): FixtureEvaluation {
  if (!data || typeof data !== 'object') return data;

  // Preserve any in-flight Base64 in the small 8-item LRU cache before stripping
  const extracted = extractMediaVaultFromEvaluation(data);
  if (extracted && data.id) {
    putMediaVaultInLru(data.id, extracted);
  }

  const copy: any = { ...data };
  if ('secretCode' in copy) {
    delete copy.secretCode;
  }

  const rawMedia: FacilityMediaItem[] = Array.isArray(copy.media) ? copy.media : [];
  const existingMeta: FacilityMediaMeta[] = Array.isArray(copy.mediaMeta) ? copy.mediaMeta : [];

  const mediaMeta: FacilityMediaMeta[] =
    existingMeta.length > 0
      ? existingMeta
      : rawMedia.map((m) => ({
          id: m.id || `m_${Date.now()}`,
          type: m.type || 'image',
          name: m.name,
          capturedAt: m.capturedAt || copy.updatedAt || new Date().toISOString(),
          capturedBy: m.capturedBy || copy.inspectorName,
        }));

  const hasPhoto = Boolean(
    copy.hasPhoto ||
      isBase64DataUri(copy.photoBase64) ||
      rawMedia.length > 0 ||
      mediaMeta.length > 0 ||
      (typeof copy.mediaCount === 'number' && copy.mediaCount > 0)
  );

  const mediaCount =
    mediaMeta.length > 0
      ? mediaMeta.length
      : typeof copy.mediaCount === 'number' && copy.mediaCount > 0
      ? copy.mediaCount
      : hasPhoto
      ? 1
      : 0;

  copy.hasPhoto = hasPhoto;
  copy.mediaCount = mediaCount;
  if (mediaMeta.length > 0) {
    copy.mediaMeta = mediaMeta;
  }
  delete copy.photoBase64;
  delete copy.media;

  if (copy.maintenanceTicket && typeof copy.maintenanceTicket === 'object') {
    const ticketCopy: MaintenanceTicketInfo = { ...copy.maintenanceTicket };
    ticketCopy.hasClosurePhoto = Boolean(
      ticketCopy.hasClosurePhoto || isBase64DataUri(ticketCopy.closurePhotoBase64)
    );
    ticketCopy.hasMaximoAttachment = Boolean(
      ticketCopy.hasMaximoAttachment || isBase64DataUri(ticketCopy.maximoAttachmentBase64)
    );
    ticketCopy.hasRejectionPhoto = Boolean(
      ticketCopy.hasRejectionPhoto || isBase64DataUri(ticketCopy.lastRejectionPhotoBase64)
    );
    delete ticketCopy.closurePhotoBase64;
    delete ticketCopy.maximoAttachmentBase64;
    delete ticketCopy.lastRejectionPhotoBase64;
    copy.maintenanceTicket = ticketCopy;
  }

  if (Array.isArray(copy.history)) {
    copy.history = copy.history.slice(0, 25).map((ev: any) => {
      if (!ev || typeof ev !== 'object') return ev;
      const evCopy = { ...ev };
      const evRawMedia: FacilityMediaItem[] = Array.isArray(evCopy.media) ? evCopy.media : [];
      const evExistingMeta: FacilityMediaMeta[] = Array.isArray(evCopy.mediaMeta)
        ? evCopy.mediaMeta
        : [];
      const evMeta: FacilityMediaMeta[] =
        evExistingMeta.length > 0
          ? evExistingMeta
          : evRawMedia.map((m) => ({
              id: m.id || `hm_${Date.now()}`,
              type: m.type || 'image',
              name: m.name,
              capturedAt: m.capturedAt || evCopy.timestamp || new Date().toISOString(),
              capturedBy: m.capturedBy || evCopy.actorName,
            }));
      evCopy.hasMedia = Boolean(
        evCopy.hasMedia || evRawMedia.length > 0 || evMeta.length > 0
      );
      if (evMeta.length > 0) {
        evCopy.mediaMeta = evMeta;
      }
      delete evCopy.media;
      delete evCopy.maximoAttachmentUrl;
      return evCopy;
    });
  }

  return copy as FixtureEvaluation;
}

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
// Local Storage Cache Helpers (In-Memory Memoized + Stripped Lightweight Records)
// ----------------------------------------------------------------------------
export function getLocalCache(): Record<string, FixtureEvaluation> {
  if (memoryEvalCache) {
    return { ...memoryEvalCache };
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      memoryEvalCache = {};
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      memoryEvalCache = {};
      return {};
    }

    const sanitized: Record<string, FixtureEvaluation> = {};
    let needsRewrite = false;

    for (const [key, val] of Object.entries(parsed)) {
      if (
        key &&
        key !== 'undefined' &&
        key !== 'null' &&
        !key.startsWith(MEDIA_DOC_PREFIX) &&
        key !== CAMPUS_LIGHT_INDEX_DOC_ID &&
        val &&
        typeof val === 'object' &&
        typeof (val as any).buildingId === 'string' &&
        (val as any).buildingId !== 'MEDIA_VAULT' &&
        (val as any).buildingId !== 'CAMPUS_GLOBAL' &&
        typeof (val as any).id === 'string'
      ) {
        const rawObj = val as any;
        if (
          rawObj.photoBase64 ||
          (Array.isArray(rawObj.media) && rawObj.media.length > 0) ||
          rawObj.maintenanceTicket?.closurePhotoBase64 ||
          rawObj.maintenanceTicket?.maximoAttachmentBase64 ||
          rawObj.maintenanceTicket?.lastRejectionPhotoBase64 ||
          'secretCode' in rawObj
        ) {
          needsRewrite = true;
        }
        sanitized[key] = stripHeavyMediaFromEvaluation(rawObj);
      } else {
        needsRewrite = true;
      }
    }

    memoryEvalCache = sanitized;

    if (needsRewrite) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
      } catch {}
    }

    return { ...sanitized };
  } catch {
    memoryEvalCache = {};
    return {};
  }
}

export function getAllCachedEvaluations(): FixtureEvaluation[] {
  return Object.values(getLocalCache()).map((e) => sanitizeEvaluationRecord(e));
}

export function getLocalCacheCount(): number {
  return Object.keys(getLocalCache()).length;
}

/**
 * Strip sensitive internal transport fields (e.g. secretCode) AND heavy Base64 media
 * from evaluation objects before caching in localStorage, state, or exporting.
 */
export function sanitizeEvaluationRecord(data: any): FixtureEvaluation {
  return stripHeavyMediaFromEvaluation(data);
}

export function saveToLocalCache(evaluation: FixtureEvaluation): void {
  if (
    !evaluation ||
    !evaluation.id ||
    !evaluation.buildingId ||
    evaluation.id.startsWith(MEDIA_DOC_PREFIX) ||
    evaluation.id === CAMPUS_LIGHT_INDEX_DOC_ID ||
    evaluation.buildingId === 'MEDIA_VAULT' ||
    evaluation.buildingId === 'CAMPUS_GLOBAL'
  ) {
    return;
  }
  try {
    const cache = getLocalCache();
    const slim = stripHeavyMediaFromEvaluation(evaluation);
    cache[slim.id] = slim;
    memoryEvalCache = cache;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

/**
 * Batch-saves multiple evaluations to localStorage in a SINGLE JSON.stringify call.
 * Eliminates the O(N^2) parse/stringify loop that caused OOM crashes on old mobile devices.
 */
export function saveBatchToLocalCache(
  evaluations: FixtureEvaluation[],
  deletedIds: string[] = []
): void {
  try {
    const cache = getLocalCache();
    let changed = false;

    for (const delId of deletedIds) {
      if (delId && cache[delId]) {
        delete cache[delId];
        changed = true;
      }
    }

    for (const evaluation of evaluations) {
      if (
        !evaluation ||
        !evaluation.id ||
        !evaluation.buildingId ||
        evaluation.id.startsWith(MEDIA_DOC_PREFIX) ||
        evaluation.id === CAMPUS_LIGHT_INDEX_DOC_ID ||
        evaluation.buildingId === 'MEDIA_VAULT' ||
        evaluation.buildingId === 'CAMPUS_GLOBAL'
      ) {
        continue;
      }
      if (evaluation.isDeleted) {
        if (cache[evaluation.id]) {
          delete cache[evaluation.id];
          changed = true;
        }
        continue;
      }
      cache[evaluation.id] = stripHeavyMediaFromEvaluation(evaluation);
      changed = true;
    }

    if (changed) {
      memoryEvalCache = cache;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch (err) {
    console.warn('LocalStorage batch save failed:', err);
  }
}

export function removeFromLocalCache(id: string): void {
  if (!id) return;
  try {
    const cache = getLocalCache();
    if (cache[id]) {
      delete cache[id];
      memoryEvalCache = cache;
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
 * Only allow valid http(s) URLs so javascript: / data: links cannot be injected as ticket links.
 */
export function sanitizeSafeHttpUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {}
  return undefined;
}

/**
 * Helper to bound history array size and strip heavy Base64 from history events
 * so main evaluation documents stay < 1 KB.
 */
function appendFacilityHistoryEvent(
  existingHistory: FacilityHistoryEvent[] | undefined,
  newEvent: FacilityHistoryEvent
): FacilityHistoryEvent[] {
  const list = [newEvent, ...(existingHistory || [])].slice(0, 25);
  return list.map((ev) => {
    const copy = { ...ev };
    const rawMedia: FacilityMediaItem[] = Array.isArray(copy.media) ? copy.media : [];
    const existingMeta: FacilityMediaMeta[] = Array.isArray(copy.mediaMeta) ? copy.mediaMeta : [];
    const meta: FacilityMediaMeta[] =
      existingMeta.length > 0
        ? existingMeta
        : rawMedia.map((m) => ({
            id: m.id,
            type: m.type,
            name: m.name,
            capturedAt: m.capturedAt,
            capturedBy: m.capturedBy,
          }));
    copy.hasMedia = Boolean(copy.hasMedia || rawMedia.length > 0 || meta.length > 0);
    if (meta.length > 0) {
      copy.mediaMeta = meta;
    }
    delete copy.media;
    delete copy.maximoAttachmentUrl;
    return copy;
  });
}

/**
 * Compact version of a stripped evaluation for the global lightweight index document
 * so 1,000+ tickets fit comfortably inside a single < 300 KB Firestore document.
 */
function toCompactIndexEntry(evaluation: FixtureEvaluation): FixtureEvaluation {
  const slim = stripHeavyMediaFromEvaluation(evaluation);
  return {
    ...slim,
    history: slim.history ? slim.history.slice(0, 5) : undefined,
  };
}

/**
 * Helper to merge an array of sharded FacilityMediaVaultDoc documents (Part 1 + Part 2 + ...)
 * back into one unified FacilityMediaVaultDoc for seamless on-demand viewing.
 */
function mergeShardedMediaVaultDocs(
  fixtureId: string,
  shards: Array<Record<string, any>>
): FacilityMediaVaultDoc {
  const combinedMedia: FacilityMediaItem[] = [];
  const seenMediaIds = new Set<string>();
  const combinedHistoryMedia: Record<string, FacilityMediaItem[]> = {};

  let photoBase64: string | undefined;
  let closurePhotoBase64: string | undefined;
  let maximoAttachmentBase64: string | undefined;
  let maximoAttachmentName: string | undefined;
  let maximoAttachmentType: 'pdf' | 'image' | undefined;
  let lastRejectionPhotoBase64: string | undefined;
  let updatedAt = new Date().toISOString();
  let overflowDocIds: string[] | undefined;

  for (const d of shards) {
    if (!d || typeof d !== 'object') continue;
    if (d.updatedAt) updatedAt = d.updatedAt;
    if (Array.isArray(d.overflowDocIds) && d.overflowDocIds.length > 0) {
      overflowDocIds = d.overflowDocIds;
    }
    if (!photoBase64 && isBase64DataUri(d.photoBase64)) {
      photoBase64 = d.photoBase64;
    }
    if (Array.isArray(d.media)) {
      for (const m of d.media) {
        if (m && typeof m === 'object' && isBase64DataUri(m.url)) {
          const mId = m.id || `m_${combinedMedia.length}`;
          if (!seenMediaIds.has(mId)) {
            seenMediaIds.add(mId);
            combinedMedia.push(m);
          }
        }
      }
    }
    if (!closurePhotoBase64 && isBase64DataUri(d.closurePhotoBase64)) {
      closurePhotoBase64 = d.closurePhotoBase64;
    }
    if (!maximoAttachmentBase64 && isBase64DataUri(d.maximoAttachmentBase64)) {
      maximoAttachmentBase64 = d.maximoAttachmentBase64;
      maximoAttachmentName = d.maximoAttachmentName;
      maximoAttachmentType = d.maximoAttachmentType;
    }
    if (!lastRejectionPhotoBase64 && isBase64DataUri(d.lastRejectionPhotoBase64)) {
      lastRejectionPhotoBase64 = d.lastRejectionPhotoBase64;
    }
    if (d.historyMediaById && typeof d.historyMediaById === 'object') {
      for (const [evId, evMedia] of Object.entries(d.historyMediaById)) {
        if (Array.isArray(evMedia) && evMedia.length > 0) {
          combinedHistoryMedia[evId] = evMedia as FacilityMediaItem[];
        }
      }
    }
  }

  if (!photoBase64 && combinedMedia.length > 0) {
    const firstImg = combinedMedia.find((m) => m.type === 'image');
    if (firstImg) photoBase64 = firstImg.url;
  }

  return {
    id: `${MEDIA_DOC_PREFIX}${fixtureId}`,
    fixtureId,
    buildingId: 'MEDIA_VAULT',
    partIndex: 1,
    totalParts: Math.max(1, shards.length),
    overflowDocIds,
    photoBase64,
    media: combinedMedia.length > 0 ? combinedMedia : undefined,
    closurePhotoBase64,
    maximoAttachmentBase64,
    maximoAttachmentName,
    maximoAttachmentType,
    lastRejectionPhotoBase64,
    historyMediaById:
      Object.keys(combinedHistoryMedia).length > 0 ? combinedHistoryMedia : undefined,
    updatedAt,
  };
}

/**
 * Dynamically estimates document size and splits a facility's media across 1 or more
 * linked Firestore documents (`MEDIA_${id}`, `MEDIA_${id}_PART_2`, `MEDIA_${id}_PART_3`, ...)
 * so NO Firestore document ever exceeds the 1 MiB (1,048,576 bytes) hard limit!
 */
async function saveFacilityMediaVaultSharded(
  fixtureId: string,
  newVaultPatch: FacilityMediaVaultDoc,
  secretCode: string,
  nowIso: string,
  replaceMediaList: boolean = false
): Promise<{ totalParts: number; overflowDocIds: string[]; mergedVault: FacilityMediaVaultDoc }> {
  const primaryDocId = `${MEDIA_DOC_PREFIX}${fixtureId}`;
  const primaryRef = doc(db, EVALUATIONS_COLLECTION, primaryDocId);

  // 1. Load existing sharded vault from LRU cache or Firestore so we preserve earlier attachments
  let existingVault: FacilityMediaVaultDoc | null = getMediaVaultFromLru(fixtureId) || null;
  let oldOverflowIds: string[] = existingVault?.overflowDocIds || [];

  try {
    const primarySnap = await getDoc(primaryRef);
    if (primarySnap.exists()) {
      const pData = primarySnap.data();
      const cloudOverflowIds: string[] = Array.isArray(pData.overflowDocIds)
        ? pData.overflowDocIds
        : [];
      oldOverflowIds = Array.from(new Set([...oldOverflowIds, ...cloudOverflowIds]));

      const overflowSnaps =
        cloudOverflowIds.length > 0
          ? await Promise.all(
              cloudOverflowIds.map((oid) => getDoc(doc(db, EVALUATIONS_COLLECTION, oid)))
            )
          : [];
      const allCloudShards = [
        pData,
        ...overflowSnaps.filter((s) => s.exists()).map((s) => s.data()!),
      ];
      const cloudMerged = mergeShardedMediaVaultDocs(fixtureId, allCloudShards);
      existingVault = mergeShardedMediaVaultDocs(fixtureId, [
        cloudMerged,
        ...(existingVault ? [existingVault] : []),
      ]);
    }
  } catch {}

  // 2. Merge existing vault with new patch
  let finalMediaList: FacilityMediaItem[] = [];
  if (replaceMediaList && newVaultPatch.media) {
    finalMediaList = [...newVaultPatch.media];
  } else {
    const byId = new Map<string, FacilityMediaItem>();
    for (const m of existingVault?.media || []) {
      if (m && isBase64DataUri(m.url)) byId.set(m.id, m);
    }
    for (const m of newVaultPatch.media || []) {
      if (m && isBase64DataUri(m.url)) byId.set(m.id, m);
    }
    finalMediaList = Array.from(byId.values());
  }

  const mergedVault: FacilityMediaVaultDoc = {
    id: primaryDocId,
    fixtureId,
    buildingId: 'MEDIA_VAULT',
    photoBase64:
      newVaultPatch.photoBase64 ||
      finalMediaList.find((m) => m.type === 'image')?.url ||
      existingVault?.photoBase64,
    media: finalMediaList.length > 0 ? finalMediaList : undefined,
    closurePhotoBase64: newVaultPatch.closurePhotoBase64 || existingVault?.closurePhotoBase64,
    maximoAttachmentBase64:
      newVaultPatch.maximoAttachmentBase64 || existingVault?.maximoAttachmentBase64,
    maximoAttachmentName:
      newVaultPatch.maximoAttachmentName || existingVault?.maximoAttachmentName,
    maximoAttachmentType:
      newVaultPatch.maximoAttachmentType || existingVault?.maximoAttachmentType,
    lastRejectionPhotoBase64:
      newVaultPatch.lastRejectionPhotoBase64 || existingVault?.lastRejectionPhotoBase64,
    historyMediaById: {
      ...(existingVault?.historyMediaById || {}),
      ...(newVaultPatch.historyMediaById || {}),
    },
    updatedAt: nowIso,
  };

  // 3. Break mergedVault into atomic attachment slots and verify each single file is < 1 MiB limit
  type AtomicMediaSlot = {
    label: string;
    bytes: number;
    applyToShard: (shard: Record<string, any>) => void;
  };

  const slots: AtomicMediaSlot[] = [];

  // Only store standalone photoBase64 if it is NOT already identical to media[0].url
  const firstMediaUrl = finalMediaList[0]?.url;
  if (
    mergedVault.photoBase64 &&
    (!firstMediaUrl || mergedVault.photoBase64 !== firstMediaUrl)
  ) {
    const b = estimateFirestoreDocSizeBytes({ photoBase64: mergedVault.photoBase64 });
    slots.push({
      label: 'الصورة الأساسية للبلاغ',
      bytes: b,
      applyToShard: (shard) => {
        shard.photoBase64 = mergedVault.photoBase64;
      },
    });
  }

  for (const mediaItem of finalMediaList) {
    const b = estimateFirestoreDocSizeBytes(mediaItem);
    slots.push({
      label: mediaItem.name || `مرفق المرفق (${mediaItem.type})`,
      bytes: b,
      applyToShard: (shard) => {
        if (!Array.isArray(shard.media)) shard.media = [];
        shard.media.push(mediaItem);
        if (!shard.photoBase64 && mediaItem.type === 'image') {
          shard.photoBase64 = mediaItem.url;
        }
      },
    });
  }

  if (mergedVault.closurePhotoBase64) {
    const b = estimateFirestoreDocSizeBytes({
      closurePhotoBase64: mergedVault.closurePhotoBase64,
    });
    slots.push({
      label: 'صورة الإصلاح والإغلاق',
      bytes: b,
      applyToShard: (shard) => {
        shard.closurePhotoBase64 = mergedVault.closurePhotoBase64;
      },
    });
  }

  if (mergedVault.maximoAttachmentBase64) {
    const b = estimateFirestoreDocSizeBytes({
      maximoAttachmentBase64: mergedVault.maximoAttachmentBase64,
      maximoAttachmentName: mergedVault.maximoAttachmentName,
      maximoAttachmentType: mergedVault.maximoAttachmentType,
    });
    slots.push({
      label: mergedVault.maximoAttachmentName || 'مرفق بلاغ ماكسمو',
      bytes: b,
      applyToShard: (shard) => {
        shard.maximoAttachmentBase64 = mergedVault.maximoAttachmentBase64;
        shard.maximoAttachmentName = mergedVault.maximoAttachmentName;
        shard.maximoAttachmentType = mergedVault.maximoAttachmentType;
      },
    });
  }

  if (mergedVault.lastRejectionPhotoBase64) {
    const b = estimateFirestoreDocSizeBytes({
      lastRejectionPhotoBase64: mergedVault.lastRejectionPhotoBase64,
    });
    slots.push({
      label: 'صورة رفض الإغلاق',
      bytes: b,
      applyToShard: (shard) => {
        shard.lastRejectionPhotoBase64 = mergedVault.lastRejectionPhotoBase64;
      },
    });
  }

  if (mergedVault.historyMediaById) {
    // Keep up to 12 most recent history media events across shards
    const entries = Object.entries(mergedVault.historyMediaById).slice(-12);
    for (const [evId, evMediaList] of entries) {
      if (!Array.isArray(evMediaList) || evMediaList.length === 0) continue;
      const b = estimateFirestoreDocSizeBytes({ [evId]: evMediaList });
      slots.push({
        label: `مرفق محادثة (${evId})`,
        bytes: b,
        applyToShard: (shard) => {
          if (!shard.historyMediaById) shard.historyMediaById = {};
          shard.historyMediaById[evId] = evMediaList;
        },
      });
    }
  }

  // Validate that no single atomic attachment exceeds the 1 MiB Firestore document capacity
  for (const slot of slots) {
    if (slot.bytes > MAX_SINGLE_FILE_BASE64_BYTES + 16384) {
      const sizeMb = (slot.bytes / (1024 * 1024)).toFixed(2);
      throw new Error(
        `عفواً، المرفق «${slot.label}» بحجم (${sizeMb} MB) يتجاوز السعة القصوى المسموحة للملف الواحد في خادم قاعدة البيانات (1MB Server Capacity) حتى بعد الضغط.`
      );
    }
  }

  // 4. Pack atomic slots dynamically into 1 or more linked Firestore documents (< 850 KB each)
  const createEmptyShard = (partIndex: number): Record<string, any> => ({
    id: partIndex === 1 ? primaryDocId : `${primaryDocId}_PART_${partIndex}`,
    fixtureId,
    buildingId: 'MEDIA_VAULT',
    partIndex,
    parentDocId: primaryDocId,
    secretCode,
    updatedAt: nowIso,
  });

  const shardPayloads: Array<Record<string, any>> = [createEmptyShard(1)];
  let currentShardBytes = estimateFirestoreDocSizeBytes(shardPayloads[0]);

  for (const slot of slots) {
    if (
      currentShardBytes + slot.bytes > SAFE_FIRESTORE_DOC_BYTES &&
      currentShardBytes > 4096
    ) {
      // Current document would exceed safe 1 MiB capacity -> open a new linked document for the same facility!
      const nextPartIndex = shardPayloads.length + 1;
      const nextShard = createEmptyShard(nextPartIndex);
      slot.applyToShard(nextShard);
      shardPayloads.push(nextShard);
      currentShardBytes = estimateFirestoreDocSizeBytes(nextShard);
    } else {
      slot.applyToShard(shardPayloads[shardPayloads.length - 1]);
      currentShardBytes += slot.bytes;
    }
  }

  const totalParts = shardPayloads.length;
  const overflowDocIds = shardPayloads.slice(1).map((s) => s.id as string);

  for (const shard of shardPayloads) {
    shard.totalParts = totalParts;
  }
  shardPayloads[0].overflowDocIds = overflowDocIds;

  // 5. Write all dynamically linked shard documents to Firestore in parallel
  await Promise.all(
    shardPayloads.map((shard) =>
      setDoc(doc(db, EVALUATIONS_COLLECTION, shard.id), stripUndefinedValues(shard))
    )
  );

  // 6. Clean up any stale overflow shard documents that are no longer needed
  const staleOverflowIds = oldOverflowIds.filter((oid) => !overflowDocIds.includes(oid));
  if (staleOverflowIds.length > 0) {
    await Promise.all(
      staleOverflowIds.map(async (staleId) => {
        try {
          await deleteDoc(doc(db, EVALUATIONS_COLLECTION, staleId));
        } catch {}
      })
    );
  }

  mergedVault.totalParts = totalParts;
  mergedVault.overflowDocIds = overflowDocIds;
  putMediaVaultInLru(fixtureId, mergedVault);

  return { totalParts, overflowDocIds, mergedVault };
}

/**
 * On-Demand Media Loader: Fetches heavy Base64 attachments (photos, PDFs, videos)
 * ONLY when the user explicitly clicks/touches a specific ticket's attachment button.
 * Automatically re-assembles dynamically linked multi-document shards (`MEDIA_${id}` + `MEDIA_${id}_PART_2`...).
 */
export async function fetchFacilityMediaOnDemand(
  fixtureId: string
): Promise<FacilityMediaVaultDoc | null> {
  if (!fixtureId) return null;

  const cached = getMediaVaultFromLru(fixtureId);
  if (
    cached &&
    (cached.photoBase64 ||
      (cached.media && cached.media.length > 0) ||
      cached.closurePhotoBase64 ||
      cached.maximoAttachmentBase64 ||
      cached.lastRejectionPhotoBase64 ||
      (cached.historyMediaById && Object.keys(cached.historyMediaById).length > 0))
  ) {
    return cached;
  }

  return runWithNetworkProgress(
    {
      direction: 'download',
      titleAr: 'جاري تحميل المرفق / الصورة عند الطلب...',
      detailAr: `المرفق: ${fixtureId}`,
      estimatedDurationMs: 1300,
    },
    async (updateProgress) => {
      try {
        updateProgress(25, `جاري جلب وسائط المرفق (${fixtureId})...`);
        const mediaDocRef = doc(db, EVALUATIONS_COLLECTION, `${MEDIA_DOC_PREFIX}${fixtureId}`);
        const mediaSnap = await getDoc(mediaDocRef);
        let vault: FacilityMediaVaultDoc | null = null;

        if (mediaSnap.exists()) {
          const d = mediaSnap.data();
          const overflowIds: string[] = Array.isArray(d.overflowDocIds) ? d.overflowDocIds : [];

          if (overflowIds.length > 0) {
            updateProgress(
              50,
              `جاري تجميع (${overflowIds.length + 1}) مستندات وسائط مرتبطة للمرفق...`
            );
            const overflowSnaps = await Promise.all(
              overflowIds.map((oid) => getDoc(doc(db, EVALUATIONS_COLLECTION, oid)))
            );
            const allShardDocs = [
              d,
              ...overflowSnaps.filter((s) => s.exists()).map((s) => s.data()!),
            ];
            vault = mergeShardedMediaVaultDocs(fixtureId, allShardDocs);
          } else {
            vault = mergeShardedMediaVaultDocs(fixtureId, [d]);
          }
        }

        const hasCompleteMedia =
          vault &&
          (vault.photoBase64 ||
            (vault.media && vault.media.length > 0) ||
            vault.closurePhotoBase64 ||
            vault.maximoAttachmentBase64 ||
            vault.lastRejectionPhotoBase64);

        // Fallback for week-1 legacy documents that still had Base64 embedded in /evaluations/{fixtureId}
        if (!hasCompleteMedia) {
          updateProgress(65, 'جاري فحص السجل الأساسي للمرفق...');
          const legacyRef = doc(db, EVALUATIONS_COLLECTION, fixtureId);
          const legacySnap = await getDoc(legacyRef);
          if (legacySnap.exists()) {
            const rawLegacy = legacySnap.data();
            const extracted = extractMediaVaultFromEvaluation(rawLegacy);
            if (extracted) {
              vault = mergeShardedMediaVaultDocs(fixtureId, [
                extracted,
                ...(vault ? [vault] : []),
              ]);

              // Lazily migrate this legacy doc into sharded media vault in the background if caller is authenticated
              const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
              if (secretCode && !migratedLegacyIds.has(fixtureId)) {
                migrateSingleLegacyDocInBackground(rawLegacy, extracted, secretCode).catch(
                  () => {}
                );
              }
            }
          }
        }

        if (vault) {
          putMediaVaultInLru(fixtureId, vault);
        }
        updateProgress(95, 'اكتمل تحميل المرفق');
        return vault;
      } catch (err) {
        console.warn(`[HostelsEval] On-demand media fetch failed for ${fixtureId}:`, err);
        return cached || null;
      }
    }
  );
}

async function migrateSingleLegacyDocInBackground(
  rawDoc: any,
  extractedVault: FacilityMediaVaultDoc,
  secretCode: string
): Promise<void> {
  if (!rawDoc || !rawDoc.id || migratedLegacyIds.has(rawDoc.id)) return;
  migratedLegacyIds.add(rawDoc.id);

  try {
    const nowIso = new Date().toISOString();
    // 1. Save heavy media into dynamically sharded /evaluations/MEDIA_${id} (+ _PART_2 if >850KB)
    const shardInfo = await saveFacilityMediaVaultSharded(
      rawDoc.id,
      extractedVault,
      secretCode,
      nowIso
    );

    // 2. Overwrite main evaluation document /evaluations/${id} WITHOUT any Base64
    const stripped = stripHeavyMediaFromEvaluation(rawDoc);
    stripped.mediaShardCount = shardInfo.totalParts;
    if (shardInfo.overflowDocIds.length > 0) {
      stripped.mediaOverflowDocIds = shardInfo.overflowDocIds;
    }
    const evalRef = doc(db, EVALUATIONS_COLLECTION, rawDoc.id);
    await setDoc(
      evalRef,
      stripUndefinedValues({
        ...stripped,
        secretCode,
      })
    );
  } catch (err) {
    migratedLegacyIds.delete(rawDoc.id);
    console.warn(`[HostelsEval] Legacy media migration skipped for ${rawDoc?.id}:`, err);
  }
}

async function buildLightIndexAndMigrateLegacyDocs(
  strippedEvaluations: FixtureEvaluation[],
  legacyToMigrate: Array<{ raw: any; extracted: FacilityMediaVaultDoc }>,
  secretCode: string
): Promise<void> {
  if (isBackgroundMigrationRunning || !secretCode) return;
  isBackgroundMigrationRunning = true;

  try {
    // 1. Write the global lightweight campus index so all devices load in 1 fast read (< 300ms)
    const evaluationsMap: Record<string, FixtureEvaluation> = {};
    for (const item of strippedEvaluations) {
      if (
        item &&
        item.id &&
        !item.isDeleted &&
        !item.id.startsWith(MEDIA_DOC_PREFIX) &&
        item.id !== CAMPUS_LIGHT_INDEX_DOC_ID &&
        item.buildingId !== 'MEDIA_VAULT' &&
        item.buildingId !== 'CAMPUS_GLOBAL'
      ) {
        evaluationsMap[item.id] = toCompactIndexEntry(item);
      }
    }

    const indexRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_LIGHT_INDEX_DOC_ID);
    await setDoc(
      indexRef,
      stripUndefinedValues({
        id: CAMPUS_LIGHT_INDEX_DOC_ID,
        buildingId: 'CAMPUS_GLOBAL',
        secretCode,
        updatedAt: new Date().toISOString(),
        evaluationsMap,
      })
    );

    // 2. Migrate any legacy documents that still had embedded Base64
    for (const { raw, extracted } of legacyToMigrate) {
      await migrateSingleLegacyDocInBackground(raw, extracted, secretCode);
    }
  } catch (err) {
    console.warn('[HostelsEval] Background index build / legacy migration warning:', err);
  } finally {
    isBackgroundMigrationRunning = false;
  }
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

  // If user is public or read-only viewer (no leader PIN, no maintenance PIN, no admin password), BLOCK write immediately:
  if (!secretCode) {
    console.warn('[HostelsEval] Write blocked: Public and read-only KPI viewer users have zero write access.');
    return {
      success: false,
      cloudSynced: false,
      cloudError:
        'عفواً، لا تملك تصريح كتابة. يجب تسجيل الدخول كـ رائد مبنى أو صيانة أو مشرف لحفظ التحديثات.',
      code: 'permission-denied',
    };
  }

  // Enforce Horizontal Isolation for Building Leaders: a Leader can ONLY write to their assigned buildingId!
  const callerRole = getActiveCallerRole();
  const leaderAuth = checkActiveLeaderAuth();
  if (
    callerRole === 'leader' &&
    leaderAuth &&
    !checkIsAdminUnlocked() &&
    evaluation.buildingId.toUpperCase() !== leaderAuth.buildingId.toUpperCase()
  ) {
    console.warn(
      `[HostelsEval] Cross-building write blocked: leader of ${leaderAuth.buildingId} tried writing ${evaluation.buildingId}`
    );
    return {
      success: false,
      cloudSynced: false,
      cloudError: `غير مصرح: صلاحيتك كرائد مبنى محصورة في مبنى ${leaderAuth.buildingId} فقط.`,
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

  if (ticket && prevEval?.maintenanceTicket) {
    ticket = {
      ...ticket,
      hasClosurePhoto: Boolean(
        ticket.closurePhotoBase64 ||
          ticket.hasClosurePhoto ||
          prevEval.maintenanceTicket.hasClosurePhoto
      ),
      hasMaximoAttachment: Boolean(
        ticket.maximoAttachmentBase64 ||
          ticket.hasMaximoAttachment ||
          prevEval.maintenanceTicket.hasMaximoAttachment
      ),
      hasRejectionPhoto: Boolean(
        ticket.lastRejectionPhotoBase64 ||
          ticket.hasRejectionPhoto ||
          prevEval.maintenanceTicket.hasRejectionPhoto
      ),
    };
  }

  // Append event to facility's permanent history log
  const rawHistoryMedia =
    historyOverride?.media !== undefined ? historyOverride.media : mediaList.slice(0, 3);
  const newHistoryEvent: FacilityHistoryEvent = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: nowIso,
    action: historyOverride?.action || 'inspection',
    actorName: historyOverride?.actorName || evaluation.inspectorName || 'فاحص ميداني',
    actorRole: historyOverride?.actorRole || 'leader',
    status: evaluation.status,
    defects: evaluation.defects || [],
    notes: historyOverride?.notes !== undefined ? historyOverride.notes : evaluation.notes,
    media: rawHistoryMedia,
    hasMedia: rawHistoryMedia.length > 0,
    mediaMeta:
      rawHistoryMedia.length > 0
        ? rawHistoryMedia.map((m) => ({
            id: m.id,
            type: m.type,
            name: m.name,
            capturedAt: m.capturedAt,
            capturedBy: m.capturedBy,
          }))
        : undefined,
    maximoNumber: historyOverride?.maximoNumber || ticket?.maximoNumber,
    maximoUrl: historyOverride?.maximoUrl || ticket?.maximoUrl,
    maximoAttachmentUrl: historyOverride?.maximoAttachmentUrl,
    maximoAttachmentName: historyOverride?.maximoAttachmentName || ticket?.maximoAttachmentName,
    evaluationRating: historyOverride?.evaluationRating,
  };

  // Extract any new Base64 media before stripping
  const unstrippedEvaluation: FixtureEvaluation = {
    ...evaluation,
    photoBase64: primaryPhoto,
    hasPhoto: Boolean(
      primaryPhoto ||
        mediaList.length > 0 ||
        evaluation.hasPhoto ||
        prevEval?.hasPhoto ||
        (evaluation.mediaCount && evaluation.mediaCount > 0) ||
        (prevEval?.mediaCount && prevEval.mediaCount > 0)
    ),
    media: mediaList.length > 0 ? mediaList : undefined,
    mediaMeta:
      mediaList.length > 0
        ? mediaList.map((m) => ({
            id: m.id,
            type: m.type,
            name: m.name,
            capturedAt: m.capturedAt,
            capturedBy: m.capturedBy,
          }))
        : evaluation.mediaMeta || prevEval?.mediaMeta,
    mediaCount:
      mediaList.length > 0
        ? mediaList.length
        : evaluation.mediaCount ?? prevEval?.mediaCount ?? (evaluation.hasPhoto || prevEval?.hasPhoto ? 1 : 0),
    maintenanceTicket: ticket,
    history: [newHistoryEvent, ...(evaluation.history || prevEval?.history || [])].slice(0, 25),
    updatedAt: nowIso,
  };

  const extractedVault = extractMediaVaultFromEvaluation(unstrippedEvaluation);
  if (extractedVault) {
    putMediaVaultInLru(unstrippedEvaluation.id, extractedVault);
  }

  const mergedHistory = appendFacilityHistoryEvent(
    evaluation.history || prevEval?.history,
    newHistoryEvent
  );

  const strippedEvaluation: FixtureEvaluation = stripHeavyMediaFromEvaluation({
    ...unstrippedEvaluation,
    history: mergedHistory,
  });

  // Update local cache with stripped lightweight record for instant UI responsiveness
  saveToLocalCache(strippedEvaluation);

  // Record lightweight timeline scan event (zero Base64 in localStorage)
  recordEvaluationHistory({
    id: newHistoryEvent.id,
    fixtureId: strippedEvaluation.id,
    buildingId: strippedEvaluation.buildingId,
    floor: strippedEvaluation.floor,
    wingId: strippedEvaluation.wingId,
    categoryCode: strippedEvaluation.categoryCode,
    fixtureTypeCode: strippedEvaluation.fixtureTypeCode,
    fixtureNameAr: strippedEvaluation.fixtureTypeCode,
    status: strippedEvaluation.status,
    defects: strippedEvaluation.defects || [],
    notes: newHistoryEvent.notes,
    rating: strippedEvaluation.rating,
    hasPhoto: Boolean(newHistoryEvent.hasMedia || strippedEvaluation.hasPhoto),
    mediaMeta: newHistoryEvent.mediaMeta || strippedEvaluation.mediaMeta,
    maximoNumber: ticket?.maximoNumber,
    ticketStatus: ticket?.status,
    inspectorName: newHistoryEvent.actorName,
    timestamp: nowIso,
    isResolved:
      strippedEvaluation.status === 'operational' || ticket?.status === 'verified_closed',
  });

  // Strip all undefined properties so Firestore accepts the document
  const rawPayload: Record<string, any> = {
    ...strippedEvaluation,
    secretCode, // Attaches secret code to satisfy Firestore Rule: request.resource.data.secretCode == get(...).data.s
    updatedAt: nowIso,
  };
  const cleanPayload = stripUndefinedValues(rawPayload);

  return runWithNetworkProgress(
    {
      direction: 'upload',
      titleAr: extractedVault
        ? 'جاري رفع البلاغ والمرفقات إلى السحابة...'
        : 'جاري حفظ تحديثات البلاغ سحابياً...',
      detailAr: `${strippedEvaluation.buildingId} • ${strippedEvaluation.id}`,
      estimatedDurationMs: extractedVault ? 2000 : 900,
    },
    async (updateProgress) => {
      try {
        // 1. If there is Base64 media in this save, dynamically estimate capacity & shard across MEDIA_${id} (+ _PART_2...)
        if (extractedVault) {
          updateProgress(25, 'جاري فحص سعة المستند (1MB) ورفع المرفقات...');
          const replaceMediaList = Array.isArray(evaluation.media) && evaluation.media.length > 0;
          const shardResult = await saveFacilityMediaVaultSharded(
            strippedEvaluation.id,
            extractedVault,
            secretCode,
            nowIso,
            replaceMediaList
          );
          strippedEvaluation.mediaShardCount = shardResult.totalParts;
          if (shardResult.overflowDocIds.length > 0) {
            strippedEvaluation.mediaOverflowDocIds = shardResult.overflowDocIds;
            updateProgress(
              50,
              `تم توزيع المرفقات تلقائياً على (${shardResult.totalParts}) مستندات سحابية مرتبطة...`
            );
          }
          cleanPayload.mediaShardCount = shardResult.totalParts;
          if (shardResult.overflowDocIds.length > 0) {
            cleanPayload.mediaOverflowDocIds = shardResult.overflowDocIds;
          }
          saveToLocalCache(strippedEvaluation);
          migratedLegacyIds.add(strippedEvaluation.id);
        } else if (
          strippedEvaluation.hasPhoto &&
          !migratedLegacyIds.has(strippedEvaluation.id)
        ) {
          // Ensure any legacy embedded media on /evaluations/${id} is preserved in sharded MEDIA_${id} before overwriting
          try {
            const existingSnap = await getDoc(
              doc(db, EVALUATIONS_COLLECTION, strippedEvaluation.id)
            );
            if (existingSnap.exists()) {
              const rawExisting = existingSnap.data();
              const legacyMedia = extractMediaVaultFromEvaluation(rawExisting);
              if (legacyMedia) {
                const shardResult = await saveFacilityMediaVaultSharded(
                  strippedEvaluation.id,
                  legacyMedia,
                  secretCode,
                  nowIso
                );
                cleanPayload.mediaShardCount = shardResult.totalParts;
                if (shardResult.overflowDocIds.length > 0) {
                  cleanPayload.mediaOverflowDocIds = shardResult.overflowDocIds;
                }
              }
            }
            migratedLegacyIds.add(strippedEvaluation.id);
          } catch {}
        }

        // 2. Verify main lightweight evaluation document is well below 1 MiB and write it
        updateProgress(70, 'جاري تحديث سجل المرفق الخفيف...');
        const docRef = doc(db, EVALUATIONS_COLLECTION, strippedEvaluation.id);
        await setDoc(docRef, stripUndefinedValues(cleanPayload));

        // 3. Update global lightweight index document for instant campus-wide loading
        updateProgress(85, 'جاري تحديث الفهرس السريع للبلاغات...');
        try {
          const indexRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_LIGHT_INDEX_DOC_ID);
          await setDoc(
            indexRef,
            stripUndefinedValues({
              id: CAMPUS_LIGHT_INDEX_DOC_ID,
              buildingId: 'CAMPUS_GLOBAL',
              secretCode,
              updatedAt: nowIso,
              evaluationsMap: {
                [strippedEvaluation.id]: toCompactIndexEntry(strippedEvaluation),
              },
            }),
            { merge: true }
          );
        } catch (indexErr) {
          console.warn('[HostelsEval] Lightweight index update warning:', indexErr);
        }

        // Notify listeners of cloud success
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('hostels_cloud_sync_event', {
              detail: { type: 'save_success', id: strippedEvaluation.id },
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
                id: strippedEvaluation.id,
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
  );
}

// ----------------------------------------------------------------------------
// 1b. Maintenance & Maximo Ticket Helpers
// ----------------------------------------------------------------------------
export async function updateMaximoTicketInfo(
  evaluation: FixtureEvaluation,
  params: {
    maximoNumber: string;
    maximoUrl?: string;
    attachmentBase64?: string;
    attachmentName?: string;
    attachmentType?: 'pdf' | 'image';
    actorName: string;
  }
): Promise<CloudSaveResult> {
  const callerRole = getActiveCallerRole();
  if (callerRole !== 'admin' && callerRole !== 'maintenance') {
    return {
      success: false,
      cloudSynced: false,
      cloudError: 'غير مصرح: تسجيل أرقام ومرفقات ماكسمو متاح لحساب الصيانة والمشرف العام فقط.',
      code: 'permission-denied',
    };
  }

  const nowIso = new Date().toISOString();
  const prevTicket = evaluation.maintenanceTicket || { status: 'open' };
  const safeUrl =
    params.maximoUrl !== undefined
      ? params.maximoUrl.trim() === ''
        ? undefined
        : sanitizeSafeHttpUrl(params.maximoUrl)
      : prevTicket.maximoUrl;

  const nextTicket: MaintenanceTicketInfo = {
    ...prevTicket,
    status:
      prevTicket.status === 'open' || prevTicket.status === 'reopened'
        ? 'in_progress'
        : prevTicket.status,
    maximoNumber: params.maximoNumber.trim(),
    maximoUrl: safeUrl,
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
        safeUrl ? ' مع ربط رابط البلاغ في ماكسمو' : ''
      }${params.attachmentName ? ` وإرفاق مستند (${params.attachmentName})` : ''}`,
      maximoNumber: params.maximoNumber.trim(),
      maximoUrl: safeUrl,
      maximoAttachmentUrl: params.attachmentBase64,
      maximoAttachmentName: params.attachmentName,
      media: [],
    }
  );
}

/**
 * Transitions a newly opened ticket directly to "قيد العمل / In Progress"
 * when maintenance/cleaning personnel start handling it even before a Maximo # is issued.
 */
export async function startMaintenanceTicketWork(
  evaluation: FixtureEvaluation,
  params: {
    actorName: string;
    actorRole: 'maintenance' | 'cleaning' | 'admin';
  }
): Promise<CloudSaveResult> {
  const callerRole = getActiveCallerRole();
  if (callerRole !== 'admin' && callerRole !== 'maintenance' && callerRole !== 'cleaning') {
    return {
      success: false,
      cloudSynced: false,
      cloudError: 'غير مصرح: هذا الإجراء مخصص لفريق الصيانة أو النظافة والمشرف العام.',
      code: 'permission-denied',
    };
  }

  const nowIso = new Date().toISOString();
  const prevTicket = evaluation.maintenanceTicket || { status: 'open' };
  const nextTicket: MaintenanceTicketInfo = {
    ...prevTicket,
    status: 'in_progress',
    registeredAt: prevTicket.registeredAt || nowIso,
    registeredBy: prevTicket.registeredBy || params.actorName,
  };

  return saveEvaluation(
    {
      ...evaluation,
      maintenanceTicket: nextTicket,
    },
    {
      action: 'maximo_registered',
      actorName: params.actorName,
      actorRole: params.actorRole === 'cleaning' ? 'cleaning' : 'maintenance',
      notes: `تم استلام البلاغ والبدء في المعالجة الميدانية (قيد العمل)`,
      media: [],
    }
  );
}

export async function closeMaintenanceTicket(
  evaluation: FixtureEvaluation,
  params: {
    maximoNumber?: string;
    maximoUrl?: string;
    attachmentBase64?: string;
    attachmentName?: string;
    attachmentType?: 'pdf' | 'image';
    closureNotes: string;
    closurePhotoBase64?: string;
    actorName: string;
  }
): Promise<CloudSaveResult> {
  const callerRole = getActiveCallerRole();
  if (callerRole !== 'admin' && callerRole !== 'maintenance' && callerRole !== 'cleaning') {
    return {
      success: false,
      cloudSynced: false,
      cloudError: 'غير مصرح: إغلاق البلاغات مخصص لفريق الصيانة أو النظافة والمشرف العام.',
      code: 'permission-denied',
    };
  }

  // Enforce Track Isolation: cleaning cannot close maintenance tickets and vice versa
  if (callerRole !== 'admin') {
    const isClnTicket = isCleaningOrPestTicket(evaluation);
    if ((callerRole === 'cleaning' && !isClnTicket) || (callerRole === 'maintenance' && isClnTicket)) {
      return {
        success: false,
        cloudSynced: false,
        cloudError: 'غير مصرح: هذا البلاغ يتبع مسار خدمة مختلف عن صلاحية حسابك.',
        code: 'permission-denied',
      };
    }
  }

  const nowIso = new Date().toISOString();
  const prevTicket = evaluation.maintenanceTicket || { status: 'open' };
  const finalMaximoNumber = params.maximoNumber?.trim() || prevTicket.maximoNumber;
  const finalMaximoUrl =
    params.maximoUrl !== undefined && params.maximoUrl.trim()
      ? sanitizeSafeHttpUrl(params.maximoUrl) ?? prevTicket.maximoUrl
      : prevTicket.maximoUrl;

  const nextTicket: MaintenanceTicketInfo = {
    ...prevTicket,
    status: 'pending_evaluation',
    maximoNumber: finalMaximoNumber,
    maximoUrl: finalMaximoUrl,
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
      maximoUrl: finalMaximoUrl,
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
    ksuEvaluationConfirmed?: boolean;
  }
): Promise<CloudSaveResult> {
  const callerRole = getActiveCallerRole();
  if (callerRole !== 'admin' && callerRole !== 'leader') {
    return {
      success: false,
      cloudSynced: false,
      cloudError: 'غير مصرح: اعتماد أو رفض إغلاق البلاغات مخصص لرائد المبنى أو المشرف العام فقط.',
      code: 'permission-denied',
    };
  }

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
    const confirmedKsu = !!params.ksuEvaluationConfirmed;
    const nextTicket: MaintenanceTicketInfo = {
      ...prevTicket,
      status: 'verified_closed',
      verifiedAt: nowIso,
      verifiedBy: params.leaderName,
      serviceRating: params.rating,
      serviceFeedback: params.feedback?.trim() || 'تم التحقق ميدانياً وتأكيد جودة الإصلاح',
      ksuEvaluationConfirmed: confirmedKsu,
      ksuEvaluationConfirmedAt: confirmedKsu ? nowIso : undefined,
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
        notes: `اعتماد إغلاق البلاغ وتقييم الخدمة (${params.rating}/5)${
          confirmedKsu ? ' • تم تأكيد رفع التقييم في نماذج الجامعة (مكتمل)' : ''
        }: ${params.feedback?.trim() || 'تم التأكد من الإصلاح'}`,
        evaluationRating: params.rating,
        maximoNumber: prevTicket.maximoNumber,
        maximoUrl: prevTicket.maximoUrl,
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

  const nextTicket: MaintenanceTicketInfo | undefined =
    (params.actorRole === 'maintenance' || params.actorRole === 'cleaning') &&
    (!evaluation.maintenanceTicket ||
      evaluation.maintenanceTicket.status === 'open')
      ? {
          ...(evaluation.maintenanceTicket || { status: 'in_progress' }),
          status: 'in_progress',
          registeredAt: evaluation.maintenanceTicket?.registeredAt || nowIso,
          registeredBy: evaluation.maintenanceTicket?.registeredBy || params.actorName,
        }
      : evaluation.maintenanceTicket;

  return saveEvaluation(
    {
      ...evaluation,
      maintenanceTicket: nextTicket,
    },
    {
      action: 'chat_message',
      actorName: params.actorName,
      actorRole: params.actorRole,
      notes: params.message.trim(),
      media: chatMedia,
    }
  );
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
        const deletedIds: string[] = [];
        const legacyToMigrate: Array<{ raw: any; extracted: FacilityMediaVaultDoc }> = [];

        snapshot.forEach((docSnap) => {
          if (
            docSnap.id.startsWith(MEDIA_DOC_PREFIX) ||
            docSnap.id === CAMPUS_LIGHT_INDEX_DOC_ID ||
            docSnap.id === CAMPUS_MAP_CONFIG_DOC_ID
          ) {
            return;
          }
          const raw = docSnap.data();
          if (!raw || !raw.id || !raw.buildingId) return;

          const extracted = extractMediaVaultFromEvaluation(raw);
          if (extracted) {
            legacyToMigrate.push({ raw, extracted });
          }

          const data = stripHeavyMediaFromEvaluation(raw);
          if (data.isDeleted) {
            deletedIds.push(data.id);
          } else {
            remoteList.push(data);
          }
        });

        // Batch-save once instead of inside forEach loop!
        saveBatchToLocalCache(remoteList, deletedIds);

        // Migrate any legacy embedded Base64 docs in the background if user is authenticated
        if (legacyToMigrate.length > 0) {
          const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
          if (secretCode) {
            for (const { raw, extracted } of legacyToMigrate) {
              migrateSingleLegacyDocInBackground(raw, extracted, secretCode).catch(() => {});
            }
          }
        }

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
// 3. Fetch All Evaluations for Campus Overview & Maintenance (Lightweight Index First!)
// ----------------------------------------------------------------------------
export async function fetchAllEvaluations(): Promise<FixtureEvaluation[]> {
  return runWithNetworkProgress(
    {
      direction: 'download',
      titleAr: 'جاري تحميل بيانات البلاغات والمرافق (بدون المرفقات الثقيلة)...',
      detailAr: 'وضع التحميل السريع الموفر للذاكرة (On-Demand Media)',
      estimatedDurationMs: 1100,
    },
    async (updateProgress) => {
      try {
        updateProgress(20, 'جاري قراءة الفهرس الخفيف السريع للبلاغات...');

        // Fast Path: 1 single document read (~30-80 KB, ZERO Base64 attachments!)
        try {
          const indexRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_LIGHT_INDEX_DOC_ID);
          const indexSnap = await getDoc(indexRef);
          if (indexSnap.exists()) {
            const indexData = indexSnap.data();
            const evaluationsMap = indexData?.evaluationsMap;
            if (
              evaluationsMap &&
              typeof evaluationsMap === 'object' &&
              Object.keys(evaluationsMap).length > 0
            ) {
              updateProgress(75, 'تم جلب الفهرس السريع، جاري تحديث الواجهة...');
              const remoteList: FixtureEvaluation[] = [];
              const deletedIds: string[] = [];

              for (const rawItem of Object.values(evaluationsMap)) {
                const item = stripHeavyMediaFromEvaluation(rawItem);
                if (
                  item &&
                  item.id &&
                  item.buildingId &&
                  !item.id.startsWith(MEDIA_DOC_PREFIX) &&
                  item.buildingId !== 'MEDIA_VAULT' &&
                  item.buildingId !== 'CAMPUS_GLOBAL'
                ) {
                  if (item.isDeleted) {
                    deletedIds.push(item.id);
                  } else {
                    remoteList.push(item);
                  }
                }
              }

              saveBatchToLocalCache(remoteList, deletedIds);

              const localMap = getLocalCache();
              const mergedMap = new Map<string, FixtureEvaluation>();
              Object.values(localMap).forEach((item) => {
                if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
              });
              remoteList.forEach((item) => {
                if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
              });

              updateProgress(96, 'اكتملت مزامنة بيانات البلاغات بنجاح');
              return Array.from(mergedMap.values());
            }
          }
        } catch (fastPathErr) {
          console.warn('[HostelsEval] Fast light index read fallback:', fastPathErr);
        }

        // Fallback Path (first run before light index is built): read collection & immediately strip heavy Base64
        updateProgress(40, 'جاري تجهيز الفهرس الخفيف وتجريد المرفقات الثقيلة...');
        const querySnapshot = await getDocs(collection(db, EVALUATIONS_COLLECTION));
        const remoteList: FixtureEvaluation[] = [];
        const deletedIds: string[] = [];
        const legacyToMigrate: Array<{ raw: any; extracted: FacilityMediaVaultDoc }> = [];

        querySnapshot.forEach((docSnap) => {
          if (
            docSnap.id.startsWith(MEDIA_DOC_PREFIX) ||
            docSnap.id === CAMPUS_MAP_CONFIG_DOC_ID ||
            docSnap.id === CAMPUS_LIGHT_INDEX_DOC_ID ||
            docSnap.id === '_connection_test_probe'
          ) {
            return;
          }
          const raw = docSnap.data();
          if (
            !raw ||
            !raw.id ||
            !raw.buildingId ||
            raw.buildingId === 'CAMPUS_GLOBAL' ||
            raw.buildingId === 'MEDIA_VAULT'
          ) {
            return;
          }

          const extracted = extractMediaVaultFromEvaluation(raw);
          if (extracted) {
            legacyToMigrate.push({ raw, extracted });
          }

          const stripped = stripHeavyMediaFromEvaluation(raw);
          if (stripped.isDeleted) {
            deletedIds.push(stripped.id);
          } else {
            remoteList.push(stripped);
          }
        });

        updateProgress(85, 'جاري حفظ الفهرس الخفيف في ذاكرة الجهاز...');
        // Single batch write to localStorage instead of N writes inside forEach!
        saveBatchToLocalCache(remoteList, deletedIds);

        const localMap = getLocalCache();
        const mergedMap = new Map<string, FixtureEvaluation>();
        Object.values(localMap).forEach((item) => {
          if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
        });
        remoteList.forEach((item) => {
          if (item && item.id && !item.isDeleted) mergedMap.set(item.id, item);
        });

        const mergedResult = Array.from(mergedMap.values());

        // Automatically build GLOBAL_CAMPUS_LIGHT_INDEX & migrate legacy embedded Base64 in background if authenticated
        const secretCode = getDecodedSecurityCode() || getAdminRawSecurityCode();
        if (secretCode && mergedResult.length > 0) {
          buildLightIndexAndMigrateLegacyDocs(mergedResult, legacyToMigrate, secretCode).catch(
            () => {}
          );
        }

        updateProgress(96, 'اكتملت المزامنة وتجهيز البلاغات');
        return mergedResult;
      } catch (err) {
        console.warn('Firestore fetch failed, returning local cache:', err);
        return Object.values(getLocalCache()).filter((item) => !item?.isDeleted);
      }
    }
  );
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

  return runWithNetworkProgress(
    {
      direction: 'upload',
      titleAr: 'جاري مزامنة كافة السجلات والفهرس السريع مع السحابة...',
      detailAr: `إجمالي السجلات: ${itemsToSync.length}`,
      estimatedDurationMs: Math.max(1500, itemsToSync.length * 35),
    },
    async (updateProgress) => {
      let synced = 0;
      let failed = 0;
      let firstError: string | undefined;
      const evaluationsMap: Record<string, FixtureEvaluation> = {};

      for (let i = 0; i < itemsToSync.length; i++) {
        const item = itemsToSync[i];
        if (
          !item ||
          !item.id ||
          item.id.startsWith(MEDIA_DOC_PREFIX) ||
          item.id === CAMPUS_LIGHT_INDEX_DOC_ID ||
          item.buildingId === 'MEDIA_VAULT' ||
          item.buildingId === 'CAMPUS_GLOBAL'
        ) {
          continue;
        }

        const pct = Math.min(90, Math.round(((i + 1) / Math.max(1, itemsToSync.length)) * 85));
        updateProgress(pct, `جاري رفع السجل (${i + 1} / ${itemsToSync.length}): ${item.id}`);

        try {
          const nowIso = new Date().toISOString();
          const extracted = extractMediaVaultFromEvaluation(item);
          let shardCount: number | undefined;
          let overflowIds: string[] | undefined;
          if (extracted && secretCode) {
            const shardRes = await saveFacilityMediaVaultSharded(
              item.id,
              extracted,
              secretCode,
              nowIso
            );
            shardCount = shardRes.totalParts;
            overflowIds = shardRes.overflowDocIds;
          }

          const stripped = stripHeavyMediaFromEvaluation(item);
          if (shardCount) stripped.mediaShardCount = shardCount;
          if (overflowIds && overflowIds.length > 0) stripped.mediaOverflowDocIds = overflowIds;
          const docRef = doc(db, EVALUATIONS_COLLECTION, stripped.id);
          const rawPayload: Record<string, any> = {
            ...stripped,
            updatedAt: new Date().toISOString(),
          };
          if (secretCode) {
            rawPayload.secretCode = secretCode;
          }
          const cleanPayload = stripUndefinedValues(rawPayload);
          await setDoc(docRef, cleanPayload);
          evaluationsMap[stripped.id] = toCompactIndexEntry(stripped);
          synced++;
        } catch (err: any) {
          failed++;
          if (!firstError) {
            firstError = `${err?.code || 'ERROR'}: ${err?.message || 'Permission denied'}`;
          }
        }
      }

      if (secretCode && Object.keys(evaluationsMap).length > 0) {
        try {
          updateProgress(94, 'جاري تحديث الفهرس السريع للمجمع...');
          const indexRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_LIGHT_INDEX_DOC_ID);
          await setDoc(
            indexRef,
            stripUndefinedValues({
              id: CAMPUS_LIGHT_INDEX_DOC_ID,
              buildingId: 'CAMPUS_GLOBAL',
              secretCode,
              updatedAt: new Date().toISOString(),
              evaluationsMap,
            }),
            { merge: true }
          );
        } catch {}
      }

      return {
        total: itemsToSync.length,
        synced,
        failed,
        firstError,
      };
    }
  );
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

    // Strip any legacy Base64 from local timeline storage automatically to free localStorage & RAM
    let timelineHadBase64 = false;
    const strippedLocal = safeLocal.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (entry.photoBase64 || (Array.isArray(entry.media) && entry.media.length > 0)) {
        timelineHadBase64 = true;
        const copy = { ...entry };
        copy.hasPhoto = true;
        delete copy.photoBase64;
        delete copy.media;
        return copy;
      }
      return entry;
    });
    if (timelineHadBase64) {
      try {
        localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(strippedLocal));
      } catch {}
    }

    // Also collect cloud-synced per-facility history from cached evaluations
    const allEvals = getAllCachedEvaluations();
    const cloudHistoryEntries: EvaluationHistoryEntry[] = [];

    for (const ev of allEvals) {
      if (buildingId && ev.buildingId.toUpperCase() !== buildingId.toUpperCase()) {
        continue;
      }
      if (Array.isArray(ev.history) && ev.history.length > 0) {
        for (const h of ev.history) {
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
            hasPhoto: Boolean(h.hasMedia || ev.hasPhoto),
            mediaMeta: h.mediaMeta || ev.mediaMeta,
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
      ? strippedLocal.filter((e) => e.buildingId.toUpperCase() === buildingId.toUpperCase())
      : strippedLocal;

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
    const slimEntry: EvaluationHistoryEntry = {
      ...entry,
      hasPhoto: Boolean(
        entry.hasPhoto || entry.photoBase64 || (entry.media && entry.media.length > 0)
      ),
    };
    delete slimEntry.photoBase64;
    delete slimEntry.media;

    const current = getBuildingTimeline();
    // Keep most recent first (up to 300 lightweight records)
    const updated = [slimEntry, ...current].slice(0, 300);
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hostels_timeline_updated', {
          detail: { entry: slimEntry, buildingId: slimEntry.buildingId },
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
  const role = getActiveCallerRole();
  if (role === 'public' || role === 'viewer') {
    console.warn('[HostelsEval] resolveTimelineIssue blocked for read-only/public user.');
    return;
  }
  const leaderAuth = checkActiveLeaderAuth();

  try {
    const current = getBuildingTimeline();
    const updated = current.map((item) => {
      if (item.id === historyId) {
        if (
          role === 'leader' &&
          leaderAuth &&
          !checkIsAdminUnlocked() &&
          item.buildingId.toUpperCase() !== leaderAuth.buildingId.toUpperCase()
        ) {
          return item;
        }
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
    memoryEvalCache = remaining;
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
        mediaVaultLruCache.delete(id);
        const docRef = doc(db, EVALUATIONS_COLLECTION, id);
        const mediaRef = doc(db, EVALUATIONS_COLLECTION, `${MEDIA_DOC_PREFIX}${id}`);

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

        // B. Also attempt hard delete on main doc, primary media vault doc, and any overflow shard docs
        try {
          await deleteDoc(docRef);
        } catch {}
        try {
          await deleteDoc(mediaRef);
        } catch {}
        for (let part = 2; part <= 6; part++) {
          try {
            await deleteDoc(doc(db, EVALUATIONS_COLLECTION, `${MEDIA_DOC_PREFIX}${id}_PART_${part}`));
          } catch {}
        }
      })
    );

    // Update GLOBAL_CAMPUS_LIGHT_INDEX with remaining items
    try {
      const evaluationsMap: Record<string, FixtureEvaluation> = {};
      for (const item of Object.values(remaining)) {
        if (item && item.id && !item.isDeleted) {
          evaluationsMap[item.id] = toCompactIndexEntry(item);
        }
      }
      const indexRef = doc(db, EVALUATIONS_COLLECTION, CAMPUS_LIGHT_INDEX_DOC_ID);
      await setDoc(
        indexRef,
        stripUndefinedValues({
          id: CAMPUS_LIGHT_INDEX_DOC_ID,
          buildingId: 'CAMPUS_GLOBAL',
          secretCode,
          updatedAt: new Date().toISOString(),
          evaluationsMap,
        })
      );
    } catch {}
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


