// ============================================================================
// 🏗️ Building Architecture & Campus Map Placement Store
// Custom Floors & Towers per Floor + Satellite/Google Maps Geo-Placement
// ============================================================================

import { BuildingStructure, CampusMapConfig } from '../types/hostel';

const STRUCTURES_STORAGE_KEY = 'hostels_building_structures';
const CAMPUS_MAP_STORAGE_KEY = 'hostels_campus_map_config';

/**
 * Generate default architecture for a building.
 * By default: 5 floors.
 * - Floors 1 to 4: 4 towers (1, 2, 3, 4)
 * - Floor 5: 2 towers (1, 2) or customizable by admin
 */
export function getDefaultBuildingStructure(buildingId: string): BuildingStructure {
  return {
    buildingId: buildingId.toUpperCase(),
    floorsCount: 5,
    floorTowers: {
      1: [1, 2, 3, 4],
      2: [1, 2, 3, 4],
      3: [1, 2, 3, 4],
      4: [1, 2, 3, 4],
      5: [1, 2], // 5th floor in student housing typically has fewer towers
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Load all building structures from LocalStorage
 */
export function loadAllBuildingStructures(): Record<string, BuildingStructure> {
  try {
    const raw = localStorage.getItem(STRUCTURES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[StructureStore] Failed to read structures from cache:', err);
    return {};
  }
}

/**
 * Get the structure for a specific building
 */
export function getBuildingStructure(buildingId: string): BuildingStructure {
  const all = loadAllBuildingStructures();
  const bId = buildingId.toUpperCase();
  if (all[bId]) {
    return all[bId];
  }
  return getDefaultBuildingStructure(bId);
}

/**
 * Save / Update structure for a specific building
 */
export function saveBuildingStructure(
  buildingIdOrStructure: string | BuildingStructure,
  maybeStructure?: BuildingStructure
): void {
  try {
    const struct: BuildingStructure =
      typeof buildingIdOrStructure === 'string'
        ? { ...maybeStructure!, buildingId: buildingIdOrStructure.toUpperCase() }
        : buildingIdOrStructure;

    const all = loadAllBuildingStructures();
    all[struct.buildingId.toUpperCase()] = {
      ...struct,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STRUCTURES_STORAGE_KEY, JSON.stringify(all));
      localStorage.setItem('hostels_structure_version', Date.now().toString());
    } catch (e) {
      console.warn('[StructureStore] Failed writing to localStorage:', e);
    }

    window.dispatchEvent(
      new CustomEvent('hostels_structure_updated', {
        detail: { buildingId: struct.buildingId },
      })
    );
  } catch (err) {
    console.error('[StructureStore] Failed to save building structure:', err);
  }
}

/**
 * Reset building structure back to default
 */
export function resetBuildingStructure(buildingId: string): BuildingStructure {
  const def = getDefaultBuildingStructure(buildingId);
  saveBuildingStructure(def);
  return def;
}

// ----------------------------------------------------------------------------
// Campus Map Placement & Real World Coordinates
// ----------------------------------------------------------------------------

const DB_NAME = 'hostels_eval_db';
const DB_VERSION = 1;
const IDB_STORE_NAME = 'campus_map_store';
const BROADCAST_CHANNEL_NAME = 'hostels_campus_map_channel';

// In-memory cache for fast synchronous access
let inMemoryMapConfigCache: CampusMapConfig | null = null;

/**
 * Open or initialize IndexedDB for persistent storage of map configs & images
 */
function openHostelsIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save campus map configuration (including large ground images) to IndexedDB
 */
export async function idbSaveCampusMap(config: CampusMapConfig): Promise<void> {
  try {
    const db = await openHostelsIDB();
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    store.put(config, 'campus_map_config');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[CampusMapStore] IndexedDB save failed, falling back to storage:', err);
  }
}

/**
 * Retrieve campus map configuration from IndexedDB
 */
export async function idbGetCampusMap(): Promise<CampusMapConfig | null> {
  try {
    const db = await openHostelsIDB();
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.get('campus_map_config');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Broadcast campus map update to all open browser tabs
 */
function broadcastCampusMapUpdate(config: CampusMapConfig): void {
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.postMessage({ type: 'CAMPUS_MAP_UPDATED', config, timestamp: Date.now() });
      bc.close();
    }
  } catch (err) {
    console.warn('[CampusMapStore] BroadcastChannel error:', err);
  }
}

/**
 * Optimize / Compress uploaded satellite / Google Maps image
 * Resizes to max 1600x1600 and compresses as JPEG 0.85
 * Typical output is 180-320 KB (crystal clear yet tiny)
 */
export async function optimizeGroundImage(input: File | string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(typeof input === 'string' ? input : '');
      return;
    }

    const readFileAsDataUrl = (file: File): Promise<string> => {
      return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
    };

    const processDataUrl = (dataUrl: string) => {
      const img = new Image();
      // NOTE: Do NOT set crossOrigin on data: URLs as it causes WebKit/Safari to taint or reject the canvas
      img.onload = () => {
        try {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl); // Fallback to raw dataUrl
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressed);
        } catch (err) {
          console.warn('[optimizeGroundImage] Canvas compression error, falling back to original:', err);
          resolve(dataUrl); // Fallback to raw dataUrl
        }
      };

      img.onerror = () => {
        // Fallback to raw dataUrl if image object fails to construct
        resolve(dataUrl);
      };

      img.src = dataUrl;
    };

    if (typeof input === 'string') {
      processDataUrl(input);
    } else {
      readFileAsDataUrl(input)
        .then(processDataUrl)
        .catch((err) => {
          console.error('[optimizeGroundImage] File read error:', err);
          reject(err);
        });
    }
  });
}

/**
 * Generate default grid positions as fallback (6 columns x 6 rows)
 */
export function generateDefaultCampusPositions(): Record<string, { x: number; z: number; rotation?: number }> {
  const positions: Record<string, { x: number; z: number; rotation?: number }> = {};
  const cols = 6;
  const spacingX = 18;
  const spacingZ = 18;
  const offsetX = ((cols - 1) * spacingX) / 2;
  const rows = Math.ceil(34 / cols);
  const offsetZ = ((rows - 1) * spacingZ) / 2;

  for (let idx = 0; idx < 34; idx++) {
    const num = idx + 1;
    const bId = `B${num.toString().padStart(2, '0')}`;
    const col = idx % cols;
    const row = Math.floor(idx / cols);

    positions[bId] = {
      x: col * spacingX - offsetX,
      z: row * spacingZ - offsetZ,
      rotation: 0,
    };
  }

  return positions;
}

/**
 * Get current Campus Map Configuration
 */
export function getCampusMapConfig(): CampusMapConfig {
  const defaults = generateDefaultCampusPositions();

  // 1. Check in-memory cache first
  if (inMemoryMapConfigCache) {
    return {
      ...inMemoryMapConfigCache,
      buildingPositions: {
        ...defaults,
        ...(inMemoryMapConfigCache.buildingPositions || {}),
      },
    };
  }

  // 2. Check LocalStorage
  try {
    const raw = localStorage.getItem(CAMPUS_MAP_STORAGE_KEY);
    if (raw) {
      const parsed: CampusMapConfig = JSON.parse(raw);
      const combined: CampusMapConfig = {
        ...parsed,
        buildingPositions: {
          ...defaults,
          ...(parsed.buildingPositions || {}),
        },
      };
      inMemoryMapConfigCache = combined;
      return combined;
    }
  } catch (err) {
    console.warn('[CampusMapStore] Failed to read map config from localStorage:', err);
  }

  const defConfig: CampusMapConfig = {
    buildingPositions: defaults,
    groundScale: 1,
    updatedAt: new Date().toISOString(),
  };
  inMemoryMapConfigCache = defConfig;
  return defConfig;
}

/**
 * Background async loader to ensure IndexedDB image data is synced to cache
 */
export function syncCampusMapFromIndexedDB(onSynced?: (config: CampusMapConfig) => void): void {
  if (typeof window === 'undefined') return;

  idbGetCampusMap()
    .then((idbConfig) => {
      if (idbConfig) {
        const current = getCampusMapConfig();
        // If IndexedDB has ground image or is newer, update memory cache
        const idbTime = idbConfig.updatedAt ? new Date(idbConfig.updatedAt).getTime() : 0;
        const currentTime = current.updatedAt ? new Date(current.updatedAt).getTime() : 0;
        if (
          idbConfig.groundImageUrl &&
          (!current.groundImageUrl || idbTime >= currentTime)
        ) {
          const defaults = generateDefaultCampusPositions();
          const merged: CampusMapConfig = {
            ...idbConfig,
            buildingPositions: {
              ...defaults,
              ...(idbConfig.buildingPositions || {}),
            },
          };
          inMemoryMapConfigCache = merged;
          if (onSynced) onSynced(merged);
          window.dispatchEvent(
            new CustomEvent('hostels_campus_map_updated', {
              detail: merged,
            })
          );
        }
      }
    })
    .catch((err) => {
      console.warn('[CampusMapStore] syncFromIDB error:', err);
    });
}

// Automatically sync on initial load in browser
if (typeof window !== 'undefined') {
  syncCampusMapFromIndexedDB();
}

/**
 * Save Campus Map Configuration (Ground map image + Real world building positions)
 * Saves to IndexedDB (for full image data without quota limits)
 * Saves to LocalStorage (for fast startup)
 * Broadcasts via BroadcastChannel (for instant multi-tab sync)
 * Dispatches CustomEvent (for same-tab reactivity)
 */
export function saveCampusMapConfig(config: CampusMapConfig): void {
  try {
    const payload: CampusMapConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
    };

    // 1. Update in-memory cache
    inMemoryMapConfigCache = payload;

    // 2. Asynchronously save to IndexedDB (supports unlimited storage for ground satellite images)
    idbSaveCampusMap(payload);

    // 3. Save to localStorage (with safe fallback if quota is tight)
    try {
      localStorage.setItem(CAMPUS_MAP_STORAGE_KEY, JSON.stringify(payload));
    } catch (quotaErr) {
      console.warn('[CampusMapStore] localStorage quota exceeded, saving without image string in localStorage:', quotaErr);
      const withoutImg = { ...payload, groundImageUrl: undefined };
      try {
        localStorage.setItem(CAMPUS_MAP_STORAGE_KEY, JSON.stringify(withoutImg));
      } catch {}
    }

    // 4. Trigger cross-tab storage signal
    try {
      localStorage.setItem('hostels_map_version', Date.now().toString());
    } catch {}

    // 5. Broadcast to all open tabs via BroadcastChannel (INSTANT MULTI-TAB SYNC)
    broadcastCampusMapUpdate(payload);

    // 6. Dispatch same-window event for local reactive components
    window.dispatchEvent(
      new CustomEvent('hostels_campus_map_updated', {
        detail: payload,
      })
    );
  } catch (err) {
    console.error('[CampusMapStore] Failed to save campus map config:', err);
  }
}

