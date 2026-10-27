// ============================================================================
// 💾 إدارة البيانات والتصدير وإعادة التعيين (Data Management & Reset Tab)
// يتيح للمشرف تصدير البيانات (CSV/JSON) وإعادة تعيين بيانات أي مبنى منفرداً
// ============================================================================

import React, { useState } from 'react';
import { BUILDINGS_CONFIG } from '../../config/buildings';
import {
  exportBuildingDataAsJSON,
  exportBuildingDataAsCSV,
  resetBuildingEvaluations,
  getAllCachedEvaluations,
  getBuildingTimeline,
} from '../../services/firestoreService';
import { logAuditEvent } from '../../services/authService';
import { TimelineViewer } from '../Timeline/TimelineViewer';
import {
  Database,
  Download,
  Trash2,
  FileSpreadsheet,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react';

interface DataManagementTabProps {
  onRefreshEvaluations?: () => void;
}

export const DataManagementTab: React.FC<DataManagementTabProps> = ({
  onRefreshEvaluations,
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('B14');
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const allEvals = getAllCachedEvaluations();
  const timeline = getBuildingTimeline();

  const selectedBuildingEvals = allEvals.filter(
    (e) => e.buildingId.toUpperCase() === selectedBuildingId.toUpperCase()
  );
  const selectedBuildingTimeline = timeline.filter(
    (t) => t.buildingId.toUpperCase() === selectedBuildingId.toUpperCase()
  );

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = (targetBuildingId?: string) => {
    const jsonStr = exportBuildingDataAsJSON(targetBuildingId);
    const filename = targetBuildingId
      ? `HostelsEval_${targetBuildingId}_${new Date().toISOString().slice(0, 10)}.json`
      : `HostelsEval_CampusAll_${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(jsonStr, filename, 'application/json');
    setStatusMessage(`تم تصدير ملف JSON بنجاح (${filename})`);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleExportCSV = (targetBuildingId?: string) => {
    const csvStr = exportBuildingDataAsCSV(targetBuildingId);
    const filename = targetBuildingId
      ? `HostelsEval_${targetBuildingId}_${new Date().toISOString().slice(0, 10)}.csv`
      : `HostelsEval_CampusAll_${new Date().toISOString().slice(0, 10)}.csv`;
    // UTF-8 BOM for Arabic Excel compatibility
    downloadFile('\uFEFF' + csvStr, filename, 'text/csv;charset=utf-8;');
    setStatusMessage(`تم تصدير ملف Excel (CSV) بنجاح (${filename})`);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleConfirmReset = async () => {
    if (!resetConfirmId) return;
    if (typedConfirmation.trim().toUpperCase() !== resetConfirmId.toUpperCase()) {
      alert(`يرجى كتابة رمز المبنى "${resetConfirmId}" بدقة للتأكيد`);
      return;
    }

    const res = await resetBuildingEvaluations(resetConfirmId);
    if (res.success) {
      logAuditEvent({
        actorName: 'المشرف العام',
        actorRole: 'admin',
        buildingId: resetConfirmId,
        action: 'feature_toggled',
        details: `تمت إعادة تعيين ومسح بيانات المبنى بالكامل (${res.clearedCount} تقييم)`,
      });

      setStatusMessage(`تمت إعادة تعيين بيانات المبنى ${resetConfirmId} بنجاح (${res.clearedCount} عنصر تم مسحه)`);
      if (onRefreshEvaluations) onRefreshEvaluations();
    }

    setResetConfirmId(null);
    setTypedConfirmation('');
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const currentBuilding = BUILDINGS_CONFIG.find((b) => b.id === selectedBuildingId);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              إدارة البيانات، التصدير، وإعادة التعيين لكل مبنى
            </h3>
            <p className="text-xs text-slate-500">
              تصدير سجلات الفحص والتقييمات بصيغ Excel و JSON، ومسح بيانات أي مبنى منفرداً
            </p>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Campus Wide Quick Export Card */}
      <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-blue-950 flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-600" />
            <span>تصدير بيانات جميع مباني الحرم الجامعي (34 مبنى دفعة واحدة)</span>
          </h4>
          <p className="text-xs text-slate-600 mt-1">
            إجمالي التقييمات المحفوظة حالياً: <strong>{allEvals.length}</strong> تقييم • إجمالي السجلات الزمنية: <strong>{timeline.length}</strong> عملية فحص
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExportCSV()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel (CSV) لكل الحرم</span>
          </button>

          <button
            onClick={() => handleExportJSON()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <FileJson className="w-4 h-4" />
            <span>تصدير JSON شامل</span>
          </button>
        </div>
      </div>

      {/* Per Building Management Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700">اختر المبنى:</label>
            <select
              value={selectedBuildingId}
              onChange={(e) => setSelectedBuildingId(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus:border-blue-500"
            >
              {BUILDINGS_CONFIG.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr} ({b.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-100 text-slate-700 font-bold px-3 py-1 rounded-lg border border-slate-200">
              {selectedBuildingEvals.length} تقييم مرافق مسجل
            </span>
            <span className="text-xs bg-slate-100 text-slate-700 font-bold px-3 py-1 rounded-lg border border-slate-200">
              {selectedBuildingTimeline.length} حدث زمني
            </span>
          </div>
        </div>

        {/* Action Buttons for Selected Building */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CSV Export */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>تصدير تقرير إكسل (CSV)</span>
              </span>
              <p className="text-[11px] text-slate-500 mt-1">
                ملف جدول بيانات يحتوي على كافة تقييمات مرافق المبنى {selectedBuildingId} وحالتها والملاحظات
              </p>
            </div>
            <button
              onClick={() => handleExportCSV(selectedBuildingId)}
              className="w-full py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل ملف CSV للمبنى</span>
            </button>
          </div>

          {/* JSON Export */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-blue-600" />
                <span>تصدير نسخة احتياطية (JSON)</span>
              </span>
              <p className="text-[11px] text-slate-500 mt-1">
                نسخة رقمية متكاملة لتقييمات المبنى والسجل الزمني للمتابعة والإصلاحات
              </p>
            </div>
            <button
              onClick={() => handleExportJSON(selectedBuildingId)}
              className="w-full py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل ملف JSON للمبنى</span>
            </button>
          </div>

          {/* Wipe & Reset Data */}
          <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>إعادة تعيين ومسح بيانات المبنى (Reset)</span>
              </span>
              <p className="text-[11px] text-rose-600/80 mt-1">
                حذف جميع الفحوصات والسجل الزمني للمبنى {selectedBuildingId} وإعادته لحالة "غير مفحوص" (رمادي)
              </p>
            </div>
            <button
              onClick={() => {
                setResetConfirmId(selectedBuildingId);
                setTypedConfirmation('');
              }}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح بيانات المبنى {selectedBuildingId}</span>
            </button>
          </div>
        </div>

        {/* Embedded Timeline Viewer for the Selected Building */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <TimelineViewer
            buildingId={selectedBuildingId}
            canResolve={true}
            currentUserName="المشرف العام"
            onRefresh={onRefreshEvaluations}
          />
        </div>
      </div>

      {/* Confirmation Modal for Reset */}
      {resetConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-right flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">
                تأكيد إعادة تعيين ومسح بيانات المبنى ({resetConfirmId})
              </h3>
              <p className="text-xs text-slate-600 mt-2">
                هذا الإجراء سيقوم بحذف كافة الفحوصات الميدانية المسجلة والسجل الزمني لهذا المبنى وإرجاعه إلى حالة <strong>غير مفحوص (اللون الرمادي)</strong>. لا يمكن التراجع عن هذه الخطوة!
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <label className="block text-slate-700 font-bold mb-1">
                لتأكيد العملية، يرجى كتابة رمز المبنى ({resetConfirmId}) أدناه:
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder={resetConfirmId}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-slate-900 text-sm focus:outline-none focus:border-rose-500 uppercase"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetConfirmId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={typedConfirmation.trim().toUpperCase() !== resetConfirmId.toUpperCase()}
                onClick={handleConfirmReset}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد المسح النهائي</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
