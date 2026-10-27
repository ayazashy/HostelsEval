// ============================================================================
// 🔐 وحدة التشفير وفك التشفير لكلمة مرور المشرف العام والمجموعة المخفية
// Cryptographic Vault: AES-256-GCM + PBKDF2 (100,000 Iterations)
// Zero Plaintext Secret In Repository • Web Crypto Standard
// ============================================================================

export interface DecryptedAdminVault {
  role: string;
  username: string;
  secretStringKey: string;
  hiddenCollectionName: string;
  createdAt: string;
  systemVersion: string;
}

// Pre-computed Cryptographic Encrypted Payload (Derived via Master Password)
// Salt: ksu_hostels_eval_salt_2026_v2
// IV (12 bytes Base64): ojoM574qKDrM+DNp
// Ciphertext + Auth Tag (Base64)
const VAULT_SALT = 'ksu_hostels_eval_salt_2026_v2';
const VAULT_IV_BASE64 = 'ojoM574qKDrM+DNp';
const VAULT_CIPHERTEXT_BASE64 =
  'xq6QWYN2crP578lEdGHgUAZnU5XsyvQI744a87lIAcM+ecRtoCvFRxLNDB7IcJxBhPK+ph+YiAfbfEbb6Q3F2K2tI9ItmWmIjBQ5GToMMSNZebU226O0O6SN9AD7RnQDwlu58dIDh6xhYhjaxBbRSia5qbV3sW/JA1f/PcenzGOt6w4MUYsJLuiCPCkhrL8TEmwdAwAiq2oPr49pXOmZKsuz7SYhHJJMGKCHqrk2XnYhdld8cuVha7gzycjhoPiTh1u9C0o6NsyQ+xx8HV7vWCN3qX38Cg==';
const VAULT_TAG_BASE64 = 'spDTj3uuZxfSMtiHZGrsaQ==';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Attempt to decrypt the admin configuration payload using the supplied password.
 * Decryption will ONLY succeed if the password is the authentic master password.
 * Any other password causes an AES-GCM authentication tag mismatch and is rejected.
 */
export async function unlockAdminVaultWithPassword(passwordInput: string): Promise<{
  success: boolean;
  vault?: DecryptedAdminVault;
  error?: string;
}> {
  if (!passwordInput || !passwordInput.trim()) {
    return { success: false, error: 'يرجى إدخال كلمة مرور المشرف' };
  }

  try {
    const enc = new TextEncoder();
    const saltBytes = enc.encode(VAULT_SALT);
    const ivBytes = base64ToUint8Array(VAULT_IV_BASE64);
    const cipherBytes = base64ToUint8Array(VAULT_CIPHERTEXT_BASE64);
    const tagBytes = base64ToUint8Array(VAULT_TAG_BASE64);

    // In Web Crypto AES-GCM, the authentication tag is appended to the ciphertext
    const combinedCiphertext = new Uint8Array(cipherBytes.length + tagBytes.length);
    combinedCiphertext.set(cipherBytes, 0);
    combinedCiphertext.set(tagBytes, cipherBytes.length);

    // 1. Import Key Material from User's Input
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(passwordInput.trim()),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // 2. Derive 256-bit AES-GCM Key using 100,000 PBKDF2 iterations
    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // 3. Authenticated AES-GCM Decryption
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as any,
      },
      derivedKey,
      combinedCiphertext as any
    );

    // 4. Parse decrypted payload
    const decodedStr = new TextDecoder().decode(decryptedBuffer);
    const vault: DecryptedAdminVault = JSON.parse(decodedStr);

    return { success: true, vault };
  } catch (err) {
    // Decryption failure means wrong password or forged ciphertext
    return {
      success: false,
      error: 'كلمة مرور المشرف غير صحيحة أو غير مصرح بها. الوصول مرفوض.',
    };
  }
}
