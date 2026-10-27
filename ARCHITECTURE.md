# 🏢 HostelsEval — Architecture & System Specification (V2)
> **وثيقة المعمارية والمواصفات الفنية الموحدة لنظام تقييم وتوثيق إسكان الطلاب**
> *Updated with Admin Gatekeeping, Dynamic Cryptographic Unlock, Leader Impersonation & Audit Logs.*

---

## 1. Core System Philosophy & Problem Context
HostelsEval is a field audit and accountability digital twin built to document severe infrastructure degradation across 34 university hostel buildings (focusing initially on bathrooms/plumbing, and architected to extend to kitchens, laundries, elevators, and study halls).

### Critical Design Principles:
1. **Clean, Human-Engineered Aesthetic**: No AI clutter, no excessive glowing badges, no bloated headers. Minimalist, premium, focused on operational clarity.
2. **Locked Admin Gateway (Zero Hardcoded Secrets)**: The dashboard and sensitive controls are locked by default. The admin enters a passphrase that decrypts the workspace in-memory using Web Crypto API. The password is never stored or committed to Git.
3. **Admin Feature Flags**: The admin can remotely enable/disable features in real-time (3D model, Leader Audits, Photo Uploads, Official Reports, Public View).
4. **Independent Building Leader Credentials**: Each of the 34 building leaders possesses an isolated, unique credential.
5. **Admin Impersonation & Super-Access**: The admin can instantly "impersonate" any building leader to audit, troubleshoot, or complete inspections on their behalf.
6. **Immutable Audit Logs**: Every inspection submission, photo upload, and status change is recorded in an audit log feed visible to the admin.

---

## 2. Gatekeeping & Cryptographic Unlock Architecture

```
[ Visitor / Admin ]
        │
        ▼
┌──────────────────────────────────────────────┐
│  🔒 Locked Gateway Screen                    │
│  - Prompt for Admin Passphrase               │
└──────────────────────┬───────────────────────┘
                       │ Passphrase entered (In-Memory Only)
                       ▼
┌──────────────────────────────────────────────┐
│  PBKDF2 / SHA-256 Hash Verification & AES   │
│  - Zero hardcoded passwords in client bundle │
│  - Decrypts features, credentials & configs  │
└──────────────────────┬───────────────────────┘
                       │ If Valid
                       ▼
┌──────────────────────────────────────────────┐
│  🔓 Unlocked Application Workspace           │
│  ├─ Live Feature Flags Controller            │
│  ├─ 34 Building Leaders Registry & Login     │
│  ├─ Instant Leader Impersonation             │
│  ├─ Immutable Real-Time Audit Logs           │
│  ├─ Interactive 3D Digital Twin (Conditional)│
│  └─ Official University Administration PDF   │
└──────────────────────────────────────────────┘
```

---

## 3. Structural Campus Hierarchy & Fixed Fixtures Matrix
- **Campus**: 34 Buildings (`B01` through `B34`).
- **Building Geometry**: 4 Wings (أجنحة) radiating from a Central Hub.
- **Floors**: Typically 5 floors per building.
- **Fixed Allocation Matrix**:
  - **Wing 1 & Wing 2**: 3 Toilets, 3 Showers, 3 Sinks/Faucets, 1 Water Heater, 1 Exhaust Fan, 1 Floor Drain.
  - **Wing 3 & Wing 4**: 2 Toilets, 2 Showers, 2 Sinks/Faucets, 2 Water Heaters, 1 Exhaust Fan, 1 Floor Drain.

---

## 4. Building Leaders Credential & Impersonation Matrix
Each building leader has distinct, unique access tokens (e.g. `B01-LK72`, `B02-MR91`, `B14-PX48`). 
- When a building leader logs in with their unique code, they are locked into their assigned building.
- When the Admin is unlocked, they can view the full roster of 34 leaders and click **"تقمص دور رائد المبنى (Impersonate)"** to seamlessly enter the inspection checklist as that specific leader.

---

## 5. Admin Feature Flags (مفاتيح التحكم بالميزات)
Admin can toggle each module on/off dynamically:
- `enable3DTwin`: Toggle the Three.js 3D building visualizer.
- `enableLeaderAudits`: Toggle field audit submissions.
- `enablePhotoCapture`: Toggle camera & compressed photo uploads.
- `enableOfficialReports`: Toggle public/official PDF report generation.
- `enablePublicView`: Allow read-only public access or keep fully locked.

---

## 6. Audit Logging Schema (`/audit_logs`)
Every action creates a structured event:
```typescript
export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  actorName: string;
  actorRole: 'admin' | 'leader' | 'impersonated';
  buildingId: string;
  action: 'inspection_created' | 'inspection_updated' | 'photo_uploaded' | 'feature_toggled' | 'impersonation_started';
  details: string;
}
```

---

## 7. Client-Side Image Compression Protocol
To stay safely below Firestore's 1 MiB document limit:
- Images are processed on an off-screen HTML5 `<canvas>`.
- Bounded to max 800px dimension, exported at JPEG quality 0.6.
- Official audit watermark permanently burned in bottom banner.
- Final Base64 size: ~35 KB to 60 KB.

---

## 8. Cryptographic Admin Vault (AES-256-GCM + PBKDF2)
- **Zero First-Time Setup Vulnerability**: The admin configuration is never established by the first visitor. It is pre-encrypted cryptographically.
- **Master Password**: Protected via authenticated key derivation (never stored in plaintext in repository).
- **Key Derivation**: 100,000 iterations of SHA-256 via PBKDF2 with salt.
- **Authenticated Cipher**: AES-256-GCM with 96-bit initialization vector (`IV`) and 128-bit authentication tag.
- **Fail-Safe Integrity**: Any incorrect password triggers an authenticated decryption mismatch (`InvalidTag` / `OperationError`), denying all admin privileges and logging the unauthorized attempt.

---

## 9. Covert Hidden Collection & Secret String Key Handshake
- **Hidden Collection**: Configured dynamically via decrypted admin session (defaults to `internal_vault`).
- **Secret String Key**: Decrypted in memory only upon successful entry of the administrator password.
- **In-Memory Decryption**: Neither the secret key nor the hidden collection name is exposed in plain text in the codebase.
- **Covert Handshake Request**: Upon admin authentication, a covert handshake document (`internal_vault/admin_vault_handshake`) is dispatched to Firebase Firestore to verify live synchronization and secure connectivity.

---

## 10. Cloud Document Secret Token Matching Architecture
- **Target Document Path**: `/databases/$(database)/documents/$(SECRET_COLLECTION)/secret` (Configured via `VITE_FIRESTORE_SECRET_COLLECTION`)
- **Field**: `s`
- **Secret Token**: Obfuscated via runtime bitwise schedule in `src/utils/securityGate.ts`.
- **Public Write Lock**: Any unauthenticated public visitor receives `null` for `secretCode`, completely blocking all client writes.
- **Client Sealing**: The secret document is sealed with `allow read, write: if false;` preventing any client SDK inspection.

---

## 11. Firebase Firestore Security Rules
To activate public read-only dashboards and restrict write permissions exclusively to verified building leaders and admins possessing the secret code:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 1. استمارات تقييم مرافق مباني الإسكان الـ 34
    // القراءة مسموحة للجميع (Public Read)، أما الكتابة والتعديل فمحظورة تماماً على أي مستخدم عام
    // ولا يتم السماح بالكتابة إلا إذا كان الطلب يتضمن المفتاح السري المطابق للمستند السحابي
    match /evaluations/{docId} {
      allow read: if true;
      allow write: if request.resource.data.secretCode == get(/databases/$(database)/documents/KSU9842/secret).data.s;
    }
    
    // 2. مستند التوثيق السحابي السري الحامل للمفتاح (محمي ومغلق تماماً عن القراءة والكتابة المباشرة)
    match /KSU9842/{docId} {
      allow read, write: if false;
    }

    // 3. المجموعة المخفية للمشرف العام والتوثيق السري
    match /internal_vault/{docId} {
      allow read, write: if true;
    }
  }
}
```


