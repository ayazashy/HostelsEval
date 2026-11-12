// ============================================================================
// 🔐 وحدة إدارة حالة الجلسات (In-Memory + LocalStorage Persistent Session Store)
// Zero Circular Dependencies • Isolated State Management
// ============================================================================

import { BuildingLeaderAuth, MaintenanceAuth } from '../types/hostel';
import { DecryptedAdminVault } from './cryptoVault';

export const ADMIN_STORAGE_SESSION_KEY = 'hostels_admin_active_session_v2';
export const LEADER_STORAGE_SESSION_KEY = 'hostels_leader_active_auth_v2';
export const MAINTENANCE_STORAGE_SESSION_KEY = 'hostels_maintenance_active_auth_v2';

// In-Memory Session Cache
let inMemoryAdminUnlocked = false;
let inMemoryAdminVault: DecryptedAdminVault | null = null;
let inMemoryActiveLeaderAuth: BuildingLeaderAuth | null = null;
let inMemoryActiveMaintenanceAuth: MaintenanceAuth | null = null;

/**
 * Check if the admin is currently unlocked (either in-memory or persisted in localStorage)
 */
export function checkIsAdminUnlocked(): boolean {
  if (inMemoryAdminUnlocked && inMemoryAdminVault) {
    return true;
  }
  try {
    const stored = localStorage.getItem(ADMIN_STORAGE_SESSION_KEY);
    if (stored) {
      const parsed: DecryptedAdminVault = JSON.parse(stored);
      if (parsed && parsed.role === 'super_admin' && parsed.secretStringKey) {
        inMemoryAdminUnlocked = true;
        inMemoryAdminVault = parsed;
        return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Retrieve decrypted admin vault details if authenticated
 */
export function getAdminVaultSession(): DecryptedAdminVault | null {
  if (!inMemoryAdminVault) {
    checkIsAdminUnlocked();
  }
  return inMemoryAdminVault;
}

/**
 * Persist admin session in memory and localStorage
 */
export function setAdminSession(vault: DecryptedAdminVault): void {
  inMemoryAdminUnlocked = true;
  inMemoryAdminVault = vault;
  try {
    localStorage.setItem(ADMIN_STORAGE_SESSION_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn('Failed to persist admin session:', err);
  }
}

/**
 * Clear admin session from memory and localStorage
 */
export function clearAdminSession(): void {
  inMemoryAdminUnlocked = false;
  inMemoryAdminVault = null;
  try {
    localStorage.removeItem(ADMIN_STORAGE_SESSION_KEY);
  } catch {}
}

/**
 * Check active Building Leader authentication (either in-memory or persisted in localStorage)
 */
export function checkActiveLeaderAuth(): BuildingLeaderAuth | null {
  if (inMemoryActiveLeaderAuth) {
    return inMemoryActiveLeaderAuth;
  }
  try {
    const stored = localStorage.getItem(LEADER_STORAGE_SESSION_KEY);
    if (stored) {
      const parsed: BuildingLeaderAuth = JSON.parse(stored);
      if (parsed && parsed.isAuthenticated && parsed.buildingId) {
        inMemoryActiveLeaderAuth = parsed;
        return inMemoryActiveLeaderAuth;
      }
    }
  } catch {}
  return null;
}

/**
 * Persist building leader session in memory and localStorage
 */
export function setLeaderSession(auth: BuildingLeaderAuth): void {
  inMemoryActiveLeaderAuth = auth;
  try {
    localStorage.setItem(LEADER_STORAGE_SESSION_KEY, JSON.stringify(auth));
  } catch (err) {
    console.warn('Failed to persist leader session:', err);
  }
}

/**
 * Clear building leader session
 */
export function clearLeaderSession(): void {
  inMemoryActiveLeaderAuth = null;
  try {
    localStorage.removeItem(LEADER_STORAGE_SESSION_KEY);
  } catch {}
}

/**
 * Check active Maintenance authentication (either in-memory or persisted in localStorage)
 */
export function checkActiveMaintenanceAuth(): MaintenanceAuth | null {
  if (inMemoryActiveMaintenanceAuth) {
    return inMemoryActiveMaintenanceAuth;
  }
  try {
    const stored = localStorage.getItem(MAINTENANCE_STORAGE_SESSION_KEY);
    if (stored) {
      const parsed: MaintenanceAuth = JSON.parse(stored);
      if (parsed && parsed.isAuthenticated && parsed.technicianName) {
        inMemoryActiveMaintenanceAuth = parsed;
        return inMemoryActiveMaintenanceAuth;
      }
    }
  } catch {}
  return null;
}

/**
 * Persist maintenance session in memory and localStorage
 */
export function setMaintenanceSession(auth: MaintenanceAuth): void {
  inMemoryActiveMaintenanceAuth = auth;
  try {
    localStorage.setItem(MAINTENANCE_STORAGE_SESSION_KEY, JSON.stringify(auth));
  } catch (err) {
    console.warn('Failed to persist maintenance session:', err);
  }
}

/**
 * Clear maintenance session
 */
export function clearMaintenanceSession(): void {
  inMemoryActiveMaintenanceAuth = null;
  try {
    localStorage.removeItem(MAINTENANCE_STORAGE_SESSION_KEY);
  } catch {}
}

/**
 * Check if the caller has any authenticated role (Admin, Leader, or Maintenance)
 */
export function isCallerAuthenticated(): boolean {
  return (
    checkIsAdminUnlocked() ||
    checkActiveLeaderAuth() !== null ||
    checkActiveMaintenanceAuth() !== null
  );
}
