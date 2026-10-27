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
    localStorage.setItem(STRUCTURES_STORAGE_KEY, JSON.stringify(all));
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

/**
 * Generate default grid positions as fallback (6 columns x 6 rows)
 */
function generateDefaultCampusPositions(): Record<string, { x: number; z: number; rotation?: number }> {
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
  try {
    const raw = localStorage.getItem(CAMPUS_MAP_STORAGE_KEY);
    if (raw) {
      const parsed: CampusMapConfig = JSON.parse(raw);
      // Ensure all 34 buildings exist in positions map
      const defaults = generateDefaultCampusPositions();
      return {
        ...parsed,
        buildingPositions: {
          ...defaults,
          ...(parsed.buildingPositions || {}),
        },
      };
    }
  } catch (err) {
    console.warn('[CampusMapStore] Failed to read map config:', err);
  }

  return {
    buildingPositions: generateDefaultCampusPositions(),
    groundScale: 1,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Save Campus Map Configuration (Ground map image + Real world building positions)
 */
export function saveCampusMapConfig(config: CampusMapConfig): void {
  try {
    localStorage.setItem(
      CAMPUS_MAP_STORAGE_KEY,
      JSON.stringify({
        ...config,
        updatedAt: new Date().toISOString(),
      })
    );
    window.dispatchEvent(
      new CustomEvent('hostels_campus_map_updated', {
        detail: config,
      })
    );
  } catch (err) {
    console.error('[CampusMapStore] Failed to save campus map config:', err);
  }
}
