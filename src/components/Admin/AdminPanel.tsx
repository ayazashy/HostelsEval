// ============================================================================
// 🎛️ لوحة تحكم المشرف العام (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React, { useState } from 'react';
import {
  AdminFeatureFlags,
  AuditLogEntry,
  BuildingLeaderAuth,
  FixtureEvaluation,
} from '../../types/hostel';
import {
  BUILDING_LEADER_ACCOUNTS,
  saveFeatureFlags,
  getAuditLogs,
  logAuditEvent,
  impersonateBuildingLeader,
  getAdminVaultSession,
} from '../../services/authService';
import {
  testFirebaseCloudConnection,
  syncAllEvaluationsToFirestore,
  performHiddenVaultHandshake,
  initializeCloudSecretDocument,
  getLocalCacheCount,
  getAllCachedEvaluations,
  CloudConnectionTestResult,
  SyncBatchResult,
} from '../../services/firestoreService';
import {
  FIRESTORE_SECRET_COLLECTION,
  FIRESTORE_SECRET_DOC,
} from '../../utils/securityGate';
import {
  loadActiveFacilityCategories,
  addNewFacilityItem,
  removeFacilityItem,
  addNewFacilityCategory,
  removeFacilityCategory,
  DEFECT_TAGS,
} from '../../config/facilityTemplates';
import {
  Sliders,
  Users,
  History,
  Copy,
  Check,
  UserCheck,
  Power,
  Camera,
  Boxes,
  FileText,
  Eye,
  RefreshCw,
  Plus,
  Trash2,
  Layers,
  FolderPlus,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Database,
  KeyRound,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';

interface AdminPanelProps {
  featureFlags: AdminFeatureFlags;
  onUpdateFeatureFlags: (flags: AdminFeatureFlags) => void;
  onImpersonateLeader: (auth: BuildingLeaderAuth) => void;
  onBackToDashboard: () => void;
  allEvaluations?: FixtureEvaluation[];
  onRefreshEvaluations?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  featureFlags,
  onUpdateFeatureFlags,
  onImpersonateLeader,
  onBackToDashboard,
  allEvaluations = [],
  onRefreshEvaluations,
}) => {
  const [activeTab, setActiveTab] = useState<'features' | 'leaders' | 'facilities' | 'cloud' | 'logs'>('features');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>(getAuditLogs());
  const [searchLeader, setSearchLeader] = useState('');

  // Firebase Cloud & Secret Vault States
  const [cloudTestResult, setCloudTestResult] = useState<CloudConnectionTestResult | null>(null);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncBatchResult | null>(null);
  const [copiedRules, setCopiedRules] = useState(false);
  const [handshakeStatus, setHandshakeStatus] = useState<{
    tested: boolean;
    success: boolean;
    collection: string;
    secretKeyMasked: string;
    error?: string;
    timestamp?: string;
  } | null>(null);
  const vaultSession = getAdminVaultSession();

  const handleTestCloudConnection = async () => {
    setIsTestingCloud(true);
    try {
      const res = await testFirebaseCloudConnection();
      setCloudTestResult(res);
    } catch (err: any) {
      setCloudTestResult({
        canRead: false,
        canWrite: false,
        remoteDocsCount: 0,
        readError: err?.message || 'فشل الاتصال بـ Firebase',
        latencyMs: 0,
      });
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleTriggerHandshake = async () => {
    const vault = getAdminVaultSession();
    const secretKey = vault?.secretStringKey || '';
    const collectionName = vault?.hiddenCollectionName || 'internal_vault';

    if (!secretKey) {
      setHandshakeStatus({
        tested: true,
        success: false,
        collection: collectionName,
        secretKeyMasked: '••••••••',
        error: 'لم يتم فك تشفير الخزينة بعد',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const res = await performHiddenVaultHandshake(secretKey, collectionName);
    setHandshakeStatus({
      tested: true,
      success: res.success,
      collection: collectionName,
      secretKeyMasked: secretKey.substring(0, Math.min(8, secretKey.length)) + '••••••••',
      error: res.error,
      timestamp: res.timestamp,
    });
  };

  const handleSyncAllToFirestore = async () => {
    setIsSyncingAll(true);
    setSyncSummary(null);
    try {
      const items = allEvaluations && allEvaluations.length > 0 ? allEvaluations : getAllCachedEvaluations();
      const res = await syncAllEvaluationsToFirestore(items);
      setSyncSummary(res);
      logAuditEvent({
        actorName: 'المشرف العام',
        actorRole: 'admin',
        buildingId: 'ALL',
        action: 'cloud_sync',
        details: `مزامنة سحابية: تم رفع ${res.synced} تقييم بنجاح إلى Firebase من أصل ${res.total}`,
      });
      setLogs(getAuditLogs());
      if (onRefreshEvaluations) {
        onRefreshEvaluations();
      }
    } catch (err: any) {
      setSyncSummary({
        total: 0,
        synced: 0,
        failed: 0,
        firstError: err?.message,
      });
    } finally {
      setIsSyncingAll(false);
      handleTestCloudConnection();
    }
  };

  const [isInitializingSecretDoc, setIsInitializingSecretDoc] = useState(false);
  const [secretDocInitStatus, setSecretDocInitStatus] = useState<string | null>(null);

  const handleInitializeSecretDoc = async () => {
    setIsInitializingSecretDoc(true);
    setSecretDocInitStatus(null);
    try {
      const res = await initializeCloudSecretDocument();
      if (res.success) {
        setSecretDocInitStatus(`تمت تهيئة وتأكيد المستند السحابي ${FIRESTORE_SECRET_COLLECTION}/${FIRESTORE_SECRET_DOC} بنجاح ✓`);
      } else {
        setSecretDocInitStatus(`تعذر التهيئة (${res.code || 'خطأ'}): ${res.error}`);
      }
    } catch (err: any) {
      setSecretDocInitStatus(`خطأ: ${err?.message}`);
    } finally {
      setIsInitializingSecretDoc(false);
    }
  };

  const FIRESTORE_SECURITY_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 1. استمارات تقييم مرافق مباني الإسكان الـ 34
    // القراءة مسموحة للجميع (Public Read)، أما الكتابة والتعديل فمحظورة تماماً على أي مستخدم عام
    // ولا يتم السماح بالكتابة إلا إذا كان الطلب يتضمن المفتاح السري المطابق للمستند السحابي
    match /evaluations/{docId} {
      allow read: if true;
      allow write: if request.resource.data.secretCode == get(/databases/$(database)/documents/${FIRESTORE_SECRET_COLLECTION}/${FIRESTORE_SECRET_DOC}).data.s;
    }
    
    // 2. مستند التوثيق السحابي السري (محمي ومغلق تماماً عن القراءة والكتابة المباشرة من المتصفحات)
    match /${FIRESTORE_SECRET_COLLECTION}/{docId} {
      allow read, write: if false;
    }

    // 3. المجموعة المخفية للمشرف العام والتوثيق السري
    match /${vaultSession?.hiddenCollectionName || 'internal_vault'}/{docId} {
      allow read, write: if true;
    }
  }
};`;

  // Facilities Management States
  const [categories, setCategories] = useState(loadActiveFacilityCategories());
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('BTH');
  const [isAddingFixture, setIsAddingFixture] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // New Category Form States
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryCode, setNewCategoryCode] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');

  // New Fixture Form States
  const [newFixtureName, setNewFixtureName] = useState('');
  const [newFixtureCode, setNewFixtureCode] = useState('');
  const [newFixtureCount, setNewFixtureCount] = useState<number>(1);
  const [selectedWings, setSelectedWings] = useState<number[]>([1, 2, 3, 4]);
  const [selectedDefects, setSelectedDefects] = useState<string[]>(['broken', 'leak', 'rust']);

  const toggleFeature = (key: keyof AdminFeatureFlags) => {
    const nextFlags = {
      ...featureFlags,
      [key]: !featureFlags[key],
    };
    onUpdateFeatureFlags(nextFlags);
    saveFeatureFlags(nextFlags);
    setLogs(getAuditLogs());
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleImpersonate = (buildingId: string) => {
    const authData = impersonateBuildingLeader(buildingId);
    onImpersonateLeader(authData);
  };

  const handleAddFixtureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixtureName.trim() || !newFixtureCode.trim()) return;

    const updated = addNewFacilityItem({
      categoryCode: selectedCategoryCode,
      nameAr: newFixtureName.trim(),
      typeCode: newFixtureCode.trim().toUpperCase(),
      count: Number(newFixtureCount) || 1,
      wings: selectedWings,
      defaultDefectTags: selectedDefects,
    });

    setCategories([...updated]);
    logAuditEvent({
      actorName: 'المشرف العام',
      actorRole: 'admin',
      buildingId: 'ALL',
      action: 'feature_toggled',
      details: `تمت إضافة مرفق جديد للاستمارة: ${newFixtureName} (${newFixtureCode.toUpperCase()})`,
    });

    // Reset Form
    setNewFixtureName('');
    setNewFixtureCode('');
    setNewFixtureCount(1);
    setIsAddingFixture(false);
    setLogs(getAuditLogs());
  };

  const handleDeleteFixture = (categoryCode: string, typeCode: string, nameAr: string) => {
    if (confirm(`هل أنت متأكد من حذف مرفق "${nameAr}" من الاستمارة؟`)) {
      const updated = removeFacilityItem(categoryCode, typeCode);
      setCategories([...updated]);
      logAuditEvent({
        actorName: 'المشرف العام',
        actorRole: 'admin',
        buildingId: 'ALL',
        action: 'feature_toggled',
        details: `تم حذف مرفق: ${nameAr} (${typeCode})`,
      });
      setLogs(getAuditLogs());
    }
  };

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !newCategoryCode.trim()) return;

    const code = newCategoryCode.trim().toUpperCase();
    const updated = addNewFacilityCategory({
      code,
      nameAr: newCategoryName.trim(),
      descriptionAr: newCategoryDesc.trim() || newCategoryName.trim(),
    });

    setCategories([...updated]);
    setSelectedCategoryCode(code);
    setIsAddingCategory(false);
    setNewCategoryName('');
    setNewCategoryCode('');
    setNewCategoryDesc('');

    logAuditEvent({
      actorName: 'المشرف العام',
      actorRole: 'admin',
      buildingId: 'ALL',
      action: 'feature_toggled',
      details: `تم إنشاء تصنيف مرافق جديد: ${newCategoryName} (${code})`,
    });
    setLogs(getAuditLogs());
  };

  const handleDeleteCategory = (catCode: string, catName: string) => {
    if (confirm(`هل أنت متأكد من حذف تصنيف "${catName}" بالكامل؟`)) {
      const updated = removeFacilityCategory(catCode);
      setCategories([...updated]);
      if (selectedCategoryCode === catCode) {
        setSelectedCategoryCode(updated[0]?.code || 'BTH');
      }
      logAuditEvent({
        actorName: 'المشرف العام',
        actorRole: 'admin',
        buildingId: 'ALL',
        action: 'feature_toggled',
        details: `تم حذف تصنيف مرافق: ${catName} (${catCode})`,
      });
      setLogs(getAuditLogs());
    }
  };

  const toggleWingSelection = (wingId: number) => {
    if (selectedWings.includes(wingId)) {
      if (selectedWings.length > 1) {
        setSelectedWings(selectedWings.filter((w) => w !== wingId));
      }
    } else {
      setSelectedWings([...selectedWings, wingId].sort());
    }
  };

  const toggleDefectSelection = (defectId: string) => {
    if (selectedDefects.includes(defectId)) {
      setSelectedDefects(selectedDefects.filter((d) => d !== defectId));
    } else {
      setSelectedDefects([...selectedDefects, defectId]);
    }
  };

  const activeCategory =
    categories.find((c) => c.code === selectedCategoryCode) || categories[0];

  const filteredLeaders = BUILDING_LEADER_ACCOUNTS.filter(
    (acc) =>
      acc.buildingId.toLowerCase().includes(searchLeader.toLowerCase()) ||
      acc.buildingNameAr.includes(searchLeader)
  );

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">لوحة تحكم المشرف العام</h1>
            <p className="text-xs text-slate-500">
              إدارة الصلاحيات والميزات، إدارة المرافق، حسابات رواد المباني، وسجل الرقابة
            </p>
          </div>
        </div>

        <button
          onClick={onBackToDashboard}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
        >
          العودة للمباني السكنية
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('features')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'features'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>تفعيل وتعطيل الميزات ({Object.values(featureFlags).filter(Boolean).length}/5)</span>
        </button>

        <button
          onClick={() => setActiveTab('facilities')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'facilities'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-400" />
          <span>إدارة المرافق والخدمات</span>
        </button>

        <button
          onClick={() => setActiveTab('leaders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'leaders'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>سجل رواد المباني (34 مبنى)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('cloud');
            handleTestCloudConnection();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'cloud'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Cloud className="w-4 h-4 text-sky-400" />
          <span>الربط السحابي (Firebase)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('logs');
            setLogs(getAuditLogs());
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>سجل العمليات ({logs.length})</span>
        </button>
      </div>

      {/* TAB 1: Features */}
      {activeTab === 'features' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">المجسم المعماري 3D</h3>
                <p className="text-[11px] text-slate-500">عرض نموذج الأجنحة الـ 4 والمسح اللوني</p>
              </div>
            </div>
            <button
              onClick={() => toggleFeature('enable3DTwin')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                featureFlags.enable3DTwin
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {featureFlags.enable3DTwin ? 'مفعّل 🟢' : 'معطّل ⚪'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-700">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">استمارة فحص رواد المباني</h3>
                <p className="text-[11px] text-slate-500">السماح لرواد المباني بإدخال وتعديل التقييمات</p>
              </div>
            </div>
            <button
              onClick={() => toggleFeature('enableLeaderAudits')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                featureFlags.enableLeaderAudits
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {featureFlags.enableLeaderAudits ? 'مفعّل 🟢' : 'معطّل ⚪'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">رفع الصور وضغط الكاميرا</h3>
                <p className="text-[11px] text-slate-500">إتاحة التقاط ورفع صور التوثيق الميداني</p>
              </div>
            </div>
            <button
              onClick={() => toggleFeature('enablePhotoCapture')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                featureFlags.enablePhotoCapture
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {featureFlags.enablePhotoCapture ? 'مفعّل 🟢' : 'معطّل ⚪'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-700">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">تصدير التقارير الرسمية</h3>
                <p className="text-[11px] text-slate-500">إتاحة استخراج وطباعة تقرير الإسكان للمسؤولين</p>
              </div>
            </div>
            <button
              onClick={() => toggleFeature('enableOfficialReports')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                featureFlags.enableOfficialReports
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {featureFlags.enableOfficialReports ? 'مفعّل 🟢' : 'معطّل ⚪'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">العرض العام (Public View)</h3>
                <p className="text-[11px] text-slate-500">
                  عند التعطيل يظل النظام مقفلاً برمز سري
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleFeature('enablePublicView')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                featureFlags.enablePublicView
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border border-slate-300'
              }`}
            >
              {featureFlags.enablePublicView ? 'مفتوح 🌐' : 'مغلق ومحمي 🔒'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Facilities & Fixtures Management (NEW) */}
      {activeTab === 'facilities' && (
        <div className="flex flex-col gap-5">
          {/* Header & Category Switcher */}
          <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700">أقسام المرافق:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {categories.map((c) => (
                    <div
                      key={c.code}
                      className={`inline-flex items-center rounded-xl text-xs font-bold transition border ${
                        selectedCategoryCode === c.code
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      <button
                        onClick={() => setSelectedCategoryCode(c.code)}
                        className="px-3 py-1.5"
                      >
                        {c.nameAr} ({c.code})
                      </button>
                      {c.code !== 'BTH' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(c.code, c.nameAr);
                          }}
                          className={`p-1 pl-2 hover:text-rose-500 transition ${
                            selectedCategoryCode === c.code ? 'text-blue-200' : 'text-slate-400'
                          }`}
                          title="حذف هذا القسم"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setIsAddingCategory(!isAddingCategory);
                    setIsAddingFixture(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm border ${
                    isAddingCategory
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                  }`}
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>{isAddingCategory ? 'إغلاق' : 'إضافة قسم مرافق جديد'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsAddingFixture(!isAddingFixture);
                    setIsAddingCategory(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm border ${
                    isAddingFixture
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAddingFixture ? 'إغلاق' : 'إضافة مرفق / تجهيز تفصيلي'}</span>
                </button>
              </div>
            </div>

            {activeCategory && (
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-700">وصف القسم النشط: </span>
                  <span>{activeCategory.descriptionAr || activeCategory.nameAr}</span>
                </div>
                <div className="font-mono text-slate-600 font-bold">
                  رمز القسم: {activeCategory.code}
                </div>
              </div>
            )}
          </div>

          {/* Form to Add New Category (Expandable) */}
          {isAddingCategory && (
            <form
              onSubmit={handleAddCategorySubmit}
              className="bg-white p-5 rounded-2xl border-2 border-blue-300 shadow-md flex flex-col gap-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  <span>إنشاء قسم مرافق جديد للاستمارة الميدانية</span>
                </h3>
                <span className="text-slate-500">
                  سيظهر هذا التصنيف فوراً في قائمة فحص رواد المباني
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">اسم قسم المرافق (بالعربية):</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="مثال: المطابخ المشتركة، صالات المذاكرة، المصاعد..."
                    required
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">كود القسم الفريد (رمز المعرّف):</label>
                  <input
                    type="text"
                    value={newCategoryCode}
                    onChange={(e) => setNewCategoryCode(e.target.value)}
                    placeholder="مثال: KIT, ACT, ELV, HVAC..."
                    required
                    maxLength={4}
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 uppercase focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500">
                    رمز المعرف: B14-W1-F1-{newCategoryCode ? newCategoryCode.toUpperCase() : 'CODE'}-...
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">وصف القسم والتجهيزات المشمولة:</label>
                  <input
                    type="text"
                    value={newCategoryDesc}
                    onChange={(e) => setNewCategoryDesc(e.target.value)}
                    placeholder="مثال: الثلاجات، أفران التسخين، المايكرويف..."
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-sm mt-1 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>حفظ وإنشاء قسم المرافق الجديد</span>
              </button>
            </form>
          )}

          {/* Form to Add New Fixture (Expandable) */}
          {isAddingFixture && (
            <form
              onSubmit={handleAddFixtureSubmit}
              className="bg-white p-5 rounded-2xl border-2 border-emerald-200 shadow-md flex flex-col gap-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-900 text-sm">
                  إضافة مرفق جديد إلى {activeCategory.nameAr}
                </h3>
                <span className="text-slate-500">
                  سيظهر هذا المرفق تلقائياً في استمارة الفحص لرواد المباني
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Fixture Name */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">اسم المرفق باللغة العربية:</label>
                  <input
                    type="text"
                    value={newFixtureName}
                    onChange={(e) => setNewFixtureName(e.target.value)}
                    placeholder="مثال: غسالة أوتوماتيكية، مايكرويف، مكيف..."
                    required
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                  />
                </div>

                {/* Fixture Unique Code */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">كود المرفق الفريد (رمز المعرّف):</label>
                  <input
                    type="text"
                    value={newFixtureCode}
                    onChange={(e) => setNewFixtureCode(e.target.value)}
                    placeholder="مثال: MIC, REF, WSH, AC..."
                    required
                    maxLength={5}
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 uppercase focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500">
                    سيُستخدم في توليد معرّف المرفق: B01-W1-F1-{activeCategory.code}-
                    {newFixtureCode ? newFixtureCode.toUpperCase() : 'CODE'}-01
                  </span>
                </div>

                {/* Count */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700">العدد في كل جناح:</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newFixtureCount}
                    onChange={(e) => setNewFixtureCount(Number(e.target.value))}
                    required
                    className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                  />
                </div>
              </div>

              {/* Target Wings Checkboxes (Strictly labeled by numbers 1 to 4) */}
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-slate-700">الأجنحة التي يتواجد بها المرفق:</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((wId) => {
                    const isChecked = selectedWings.includes(wId);
                    return (
                      <button
                        key={wId}
                        type="button"
                        onClick={() => toggleWingSelection(wId)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <Check className={`w-3.5 h-3.5 ${isChecked ? 'opacity-100' : 'opacity-0'}`} />
                        <span>جناح {wId}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Defect Options */}
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-slate-700">تصنيفات الأعطال الشائعة لهذا المرفق:</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFECT_TAGS.map((defect) => {
                    const isSelected = selectedDefects.includes(defect.id);
                    return (
                      <button
                        key={defect.id}
                        type="button"
                        onClick={() => toggleDefectSelection(defect.id)}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                          isSelected
                            ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span>{defect.labelAr}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-sm mt-2 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>حفظ وإضافة المرفق للاستمارة الميدانية لرواد المباني</span>
              </button>
            </form>
          )}

          {/* Current Active Fixtures Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
              المرافق المسجلة حالياً في ({activeCategory.nameAr}):
            </div>
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3">اسم المرفق</th>
                  <th className="p-3">الكود الفريد</th>
                  <th className="p-3">العدد في الجناح</th>
                  <th className="p-3">الأجنحة المطبقة</th>
                  <th className="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {/* Get all unique templates in activeCategory */}
                {Array.from(
                  new Set(
                    Object.values(activeCategory.wingTemplates)
                      .flat()
                      .map((t) => t.typeCode)
                  )
                ).map((tCode) => {
                  const sampleTmpl = Object.values(activeCategory.wingTemplates)
                    .flat()
                    .find((t) => t.typeCode === tCode);
                  if (!sampleTmpl) return null;

                  // Find which wings have this fixture
                  const wingsWithFixture = [1, 2, 3, 4].filter((w) =>
                    activeCategory.wingTemplates[w]?.some((t) => t.typeCode === tCode)
                  );

                  return (
                    <tr key={tCode} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{sampleTmpl.nameAr}</td>
                      <td className="p-3 font-mono text-blue-700 font-bold">{sampleTmpl.typeCode}</td>
                      <td className="p-3">{sampleTmpl.count} خانات</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {wingsWithFixture.map((w) => (
                            <span
                              key={w}
                              className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-bold"
                            >
                              جناح {w}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() =>
                            handleDeleteFixture(activeCategory.code, tCode, sampleTmpl.nameAr)
                          }
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="حذف المرفق"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Leaders */}
      {activeTab === 'leaders' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={searchLeader}
              onChange={(e) => setSearchLeader(e.target.value)}
              placeholder="بحث برقم المبنى (مثلاً B14)..."
              className="bg-white border border-slate-300 text-slate-900 text-xs rounded-xl px-3 py-2 w-72"
            />
            <span className="text-xs text-slate-500">
              لكل مبنى كود دخول فريد ومستقل
            </span>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3">المبنى</th>
                  <th className="p-3">اسم رائد المبنى</th>
                  <th className="p-3">كود الدخول المخصص</th>
                  <th className="p-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLeaders.map((acc) => (
                  <tr key={acc.buildingId} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">
                      {acc.buildingNameAr} ({acc.buildingId})
                    </td>
                    <td className="p-3 text-slate-600">{acc.leaderName}</td>
                    <td className="p-3 font-mono">
                      <div className="inline-flex items-center gap-2 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-slate-800">
                        <span>{acc.accessCode}</span>
                        <button
                          onClick={() => handleCopy(acc.accessCode)}
                          className="hover:text-blue-600"
                          title="نسخ الكود"
                        >
                          {copiedCode === acc.accessCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleImpersonate(acc.buildingId)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-xl font-bold transition inline-flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>تقمص دور رائد المبنى</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Audit Logs */}
      {activeTab === 'logs' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              سجل تفصيلي بالعمليات المسجلة
            </span>
            <button
              onClick={() => setLogs(getAuditLogs())}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث السجل</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">لا توجد عمليات مسجلة بعد.</div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="p-3">التوقيت</th>
                    <th className="p-3">المستخدم</th>
                    <th className="p-3">المبنى</th>
                    <th className="p-3">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString('ar-SA', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="p-3 font-sans font-bold text-slate-900">
                        {log.actorName}
                        {log.actorRole === 'impersonated' && (
                          <span className="text-[9px] text-amber-600 mr-1.5">(مشرف متقمص)</span>
                        )}
                      </td>
                      <td className="p-3 text-blue-600 font-bold">{log.buildingId}</td>
                      <td className="p-3 font-sans text-slate-700">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Cloud Synchronization & Secret Vault */}
      {activeTab === 'cloud' && (
        <div className="flex flex-col gap-6">
          {/* Card 1: Cloud Connection Status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">حالة الربط السحابي مع Firebase Firestore</h3>
                  <p className="text-xs text-slate-500">
                    مشروع: <span className="font-mono text-slate-700 font-bold">hostelseval</span> • مجموعة التقييمات: <span className="font-mono text-blue-600 font-bold">evaluations</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestCloudConnection}
                  disabled={isTestingCloud}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingCloud ? 'animate-spin' : ''}`} />
                  <span>{isTestingCloud ? 'جاري الفحص...' : 'فحص الاتصال الآن'}</span>
                </button>

                <button
                  onClick={handleSyncAllToFirestore}
                  disabled={isSyncingAll}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Cloud className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-bounce' : ''}`} />
                  <span>{isSyncingAll ? 'جاري المزامنة السحابية...' : 'مزامنة ورفع كافة التقييمات إلى Firebase الآن'}</span>
                </button>
              </div>
            </div>

            {/* Status Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 flex flex-col gap-1">
                <span className="text-[11px] text-slate-500 font-bold">حالة الكتابة والقراءة السحابية</span>
                <div className="flex items-center gap-2 mt-1">
                  {cloudTestResult?.canWrite ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      متصل ومصرّح بالكتابة 🟢
                    </span>
                  ) : cloudTestResult?.canRead ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      قراءة فقط (بحاجة لتفعيل القواعد) 🟡
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-700">
                      لم يتم الفحص بعد ⚪
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 flex flex-col gap-1">
                <span className="text-[11px] text-slate-500 font-bold">المستندات في Firestore السحابي</span>
                <span className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {cloudTestResult ? cloudTestResult.remoteDocsCount : '—'}
                </span>
                <span className="text-[10px] text-slate-500">في مجموعة evaluations</span>
              </div>

              <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 flex flex-col gap-1">
                <span className="text-[11px] text-slate-500 font-bold">التقييمات المخزنة محلياً</span>
                <span className="text-xl font-bold font-mono text-blue-600 mt-0.5">
                  {getLocalCacheCount()}
                </span>
                <span className="text-[10px] text-slate-500">جاهزة للمزامنة السحابية الفورية</span>
              </div>
            </div>

            {/* Sync Feedback Message */}
            {syncSummary && (
              <div
                className={`p-4 rounded-xl border text-xs flex flex-col gap-1 ${
                  syncSummary.failed === 0 && syncSummary.synced > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {syncSummary.failed === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span>
                    اكتملت عملية المزامنة السحابية: تم رفع {syncSummary.synced} تقييم بنجاح
                    {syncSummary.failed > 0 && ` (تعثر ${syncSummary.failed} مستند بسبب أذونات Firebase)`}
                  </span>
                </div>
                {syncSummary.firstError && (
                  <p className="font-mono text-[11px] text-rose-700 bg-white/70 p-2 rounded-lg mt-1 border border-rose-200">
                    رمز الخطأ: {syncSummary.firstError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Secret Vault & Hidden Collection Trick */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">الخزينة المشفرة والمجموعة المخفية (Covert Vault)</h3>
                  <p className="text-xs text-slate-500">
                    تم فك تشفير هذا المفتاح السري والمجموعة السرية في الذاكرة عبر جلسة التحقق المشفرة للمشرف العام
                  </p>
                </div>
              </div>

              <button
                onClick={handleTriggerHandshake}
                className="px-3.5 py-2 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>إرسال طلب التوثيق السري الآن إلى Firebase</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-1">
                <span className="text-slate-500 font-bold text-[11px]">اسم المجموعة المخفية (Hidden Collection):</span>
                <span className="font-mono font-bold text-violet-900 text-sm">
                  {vaultSession?.hiddenCollectionName || 'internal_vault'}
                </span>
                <span className="text-[10px] text-slate-400">مجموعة سرية خاصة بالتحقق والتوثيق الأمني</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-1">
                <span className="text-slate-500 font-bold text-[11px]">المفتاح السري المشفر (Secret String Key):</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {vaultSession?.secretStringKey
                    ? `${vaultSession.secretStringKey.substring(0, Math.min(10, vaultSession.secretStringKey.length))}••••••••`
                    : '••••••••••••'}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">مشفر بـ AES-256-GCM + 100k PBKDF2</span>
              </div>
            </div>

            {handshakeStatus && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                  handshakeStatus.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {handshakeStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <div>
                  {handshakeStatus.success ? (
                    <p className="font-bold">
                      تم توثيق الاتصال السري بنجاح في Firebase بالمجموعة ({handshakeStatus.collection}) ✓
                    </p>
                  ) : (
                    <p>
                      <span className="font-bold">تنبيه:</span> تم إرسال الطلب السري ولكن Firebase يرفض الكتابة حالياً بسبب قيود القواعد ({handshakeStatus.error}).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Secret Document Initializer Button */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-bold text-xs text-slate-800">
                  مستند التحقق السحابي: {FIRESTORE_SECRET_COLLECTION}/{FIRESTORE_SECRET_DOC}
                </p>
                <p className="text-[11px] text-slate-500">
                  المستند الذي تستند إليه قواعد Firestore للتحقق من أصل كل طلب كتابة
                </p>
              </div>
              <button
                type="button"
                onClick={handleInitializeSecretDoc}
                disabled={isInitializingSecretDoc}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
              >
                <KeyRound className={`w-3.5 h-3.5 ${isInitializingSecretDoc ? 'animate-spin' : ''}`} />
                <span>
                  {isInitializingSecretDoc
                    ? 'جاري التهيئة...'
                    : `تهيئة وتأكيد المستند السحابي (${FIRESTORE_SECRET_COLLECTION}/${FIRESTORE_SECRET_DOC})`}
                </span>
              </button>
            </div>

            {secretDocInitStatus && (
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
                {secretDocInitStatus}
              </div>
            )}
          </div>

          {/* Card 3: Exact Firebase Security Rules */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  قواعد أمان Firebase Firestore المعتمدة (Security Rules)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  انسخ هذه القواعد وضعها في Firebase Console لتفعيل التخزين الميداني الفوري لرواد المباني والمشرف
                </p>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(FIRESTORE_SECURITY_RULES);
                  setCopiedRules(true);
                  setTimeout(() => setCopiedRules(false), 2500);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
              >
                {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRules ? 'تم نسخ القواعد!' : 'نسخ القواعد المعتمدة'}</span>
              </button>
            </div>

            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto text-left leading-relaxed">
              <pre>{FIRESTORE_SECURITY_RULES}</pre>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex flex-col gap-2">
              <span className="font-bold flex items-center gap-1.5 text-blue-950">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                خطوات تفعيل قواعد الأمان في دقيقة واحدة:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-slate-700 pr-1">
                <li>افتح لوحة تحكم <strong>Firebase Console</strong> واختر مشروع <strong>hostelseval</strong>.</li>
                <li>انتقل إلى <strong>Firestore Database</strong> من القائمة الجانبية ثم تبويب <strong>Rules (القواعد)</strong>.</li>
                <li>الصق النص المنسوخ أعلاه واضغط على <strong>Publish (نشر)</strong>.</li>
                <li>بعد النشر مباشرة، اضغط على زر <strong>"مزامنة ورفع كافة التقييمات إلى Firebase الآن"</strong> بالأعلى.</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
