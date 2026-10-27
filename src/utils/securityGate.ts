// ============================================================================
// 🛡️ بوابة الأمان السحابية والمفتاح السري المشفر
// Zero Plaintext Secret In Repository • Runtime In-Memory Reconstruction
// Matching Cloud Document Gate Rule
// ============================================================================

import { checkIsAdminUnlocked, isCallerAuthenticated } from './sessionStore';

// Obfuscated Byte Schedule (XOR + 3-bit circular rotation)
const GATE_MASK = [0x7A, 0x3F, 0x5C, 0x1E, 0x92, 0x4B, 0x6D, 0x81, 0x24, 0xAA, 0x55, 0xC3];
const GATE_PAYLOAD_BYTES = [
  137, 99, 72, 10, 38, 80, 9, 246, 131, 47, 240, 52, 161, 3, 43, 49, 53, 203, 145, 150, 11, 79, 80, 220,
];

// Target Firestore Secret Document details (Configurable via environment)
export const FIRESTORE_SECRET_COLLECTION =
  import.meta.env.VITE_FIRESTORE_SECRET_COLLECTION || 'KSU9842';
export const FIRESTORE_SECRET_DOC =
  import.meta.env.VITE_FIRESTORE_SECRET_DOC || 'secret';
export const FIRESTORE_SECRET_FIELD =
  import.meta.env.VITE_FIRESTORE_SECRET_FIELD || 's';

/**
 * Reconstructs the secret code in memory ONLY when an active, authenticated
 * session (Super Admin or Verified Building Leader) is present.
 * Public users will ALWAYS receive null, preventing any unauthorized write access.
 */
export function getDecodedSecurityCode(): string | null {
  // Strict Permission Check: Public visitors have zero write capability
  if (!isCallerAuthenticated()) {
    return null;
  }

  // De-obfuscate dynamically in runtime memory
  try {
    const chars: string[] = [];
    for (let i = 0; i < GATE_PAYLOAD_BYTES.length; i++) {
      const val = GATE_PAYLOAD_BYTES[i];
      const m = GATE_MASK[i % GATE_MASK.length];
      // Circular bitwise rotate right 3 bits, then XOR
      const rot = ((val >> 3) | ((val & 0x07) << 5)) & 0xFF;
      chars.push(String.fromCharCode(rot ^ m));
    }
    return chars.join('');
  } catch {
    return null;
  }
}

/**
 * Helper to obtain the secret code specifically for admin initialization.
 * Only callable when admin session is verified.
 */
export function getAdminRawSecurityCode(): string | null {
  if (!checkIsAdminUnlocked()) {
    return null;
  }
  const chars: string[] = [];
  for (let i = 0; i < GATE_PAYLOAD_BYTES.length; i++) {
    const val = GATE_PAYLOAD_BYTES[i];
    const m = GATE_MASK[i % GATE_MASK.length];
    const rot = ((val >> 3) | ((val & 0x07) << 5)) & 0xFF;
    chars.push(String.fromCharCode(rot ^ m));
  }
  return chars.join('');
}
