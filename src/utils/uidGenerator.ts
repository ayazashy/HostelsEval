// ============================================================================
// 🏷️ HostelsEval — UID Generator & Parser
// Standard: B[01-34]-W[1-4]-F[1-5]-[CATEGORY]-[TYPE]-[INDEX]
// ============================================================================

import { FacilityCategoryCode, FixtureTypeCode } from '../types/hostel';

export interface UIDComponents {
  buildingId: string; // 'B14'
  wingId: number;     // 1..4
  floor: number;      // 1..5
  categoryCode: FacilityCategoryCode;
  fixtureTypeCode: FixtureTypeCode;
  fixtureIndex: number;
}

export function generateFixtureUID(comp: UIDComponents): string {
  const b = comp.buildingId.toUpperCase();
  const w = `W${comp.wingId}`;
  const f = `F${comp.floor}`;
  const cat = comp.categoryCode.toUpperCase();
  const type = comp.fixtureTypeCode.toUpperCase();
  const idx = comp.fixtureIndex.toString().padStart(2, '0');

  return `${b}-${w}-${f}-${cat}-${type}-${idx}`;
}

export function parseFixtureUID(uid: string): UIDComponents | null {
  const parts = uid.split('-');
  if (parts.length < 6) return null;

  const [b, w, f, cat, type, idx] = parts;

  return {
    buildingId: b,
    wingId: parseInt(w.replace('W', ''), 10) || 1,
    floor: parseInt(f.replace('F', ''), 10) || 1,
    categoryCode: cat as FacilityCategoryCode,
    fixtureTypeCode: type as FixtureTypeCode,
    fixtureIndex: parseInt(idx, 10) || 1,
  };
}
