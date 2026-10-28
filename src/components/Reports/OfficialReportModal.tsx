// ============================================================================
// 📑 تقرير المسح الشامل لمرافق الإسكان الطلابي (Light Mode)
// ============================================================================

import React, { useState } from 'react';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { computeCampusStats } from '../../utils/healthScore';
import { ImageViewerModal } from '../Common/ImageViewerModal';
import { Printer, X, ShieldCheck, AlertTriangle, Maximize2, FileText } from 'lucide-react';

interface OfficialReportModalProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  onClose: () => void;
}

export const OfficialReportModal: React.FC<OfficialReportModalProps> = ({
  buildings,
  allEvaluations,
  onClose,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const stats = computeCampusStats(buildings, allEvaluations);
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  const worstBuildings = [...buildings]
    .sort((a, b) => (a.healthScore || 100) - (b.healthScore || 100))
    .slice(0, 8);

  const criticalItems = allEvaluations
    .filter((e) => e.status === 'broken' || e.defects.includes('leak'))
    .slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Action Bar (Hidden in Print) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-700" />
            <h2 className="text-sm font-bold text-slate-900">
              تقرير متابعة وتقييم مرافق مباني الإسكان الطلابي
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ كـ PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-xl bg-slate-100 hover:bg-slate-200 transition"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Official Printable Report Document Body */}
        <div className="p-6 sm:p-10 overflow-y-auto bg-white text-slate-900 print:p-0">
          <div className="max-w-3xl mx-auto flex flex-col gap-6 text-slate-800 print:max-w-none">
            {/* 1. Header */}
            <div className="border-b-2 border-slate-300 pb-5 flex justify-between items-start">
              <div className="flex items-center gap-4 text-right">
                <img
                  src="./housing-logo.png"
                  alt="شعار إدارة الإسكان الطلابي - جامعة الملك سعود"
                  className="housing-brand-logo-modal"
                  style={{ height: '42px', width: 'auto', maxWidth: '140px', objectFit: 'contain' }}
                />
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                    تقرير التقييم والمتابعة الميدانية لمرافق الإسكان
                  </h1>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    جامعة الملك سعود • عمادة شؤون الطلاب • إدارة الإسكان الطلابي
                  </p>
                </div>
              </div>

              <div className="text-left font-mono text-xs text-slate-500">
                <div>الرقم المرجعي: KSU-HS-2026</div>
                <div>التاريخ: {dateStr}</div>
                <div className="text-[10px] text-emerald-700 font-bold mt-1">
                  حالة التقرير: معتمد ميدانياً
                </div>
              </div>
            </div>

            {/* 2. Executive Summary Box */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>ملخص تنفيذي للمسؤولين:</span>
              </h3>
              <p className="text-xs leading-relaxed text-slate-700">
                تم إجراء هذا المسح الميداني لرصد الأعطال الهيكلية والتشغيلية في دورات المياه
                ومرافق الإسكان (34 مبنى يضم كل منها 4 أجنحة). أظهرت البيانات الرقمية الموثقة وجود أعطال
                تؤثر على جودة البيئة السكنية للطلاب، وتتسبب في تسربات مائية تستدعي تدخلاً عاجلاً من فرق الصيانة.
              </p>

              {/* Shock Stats in Report */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-200 text-center">
                <div>
                  <span className="text-xs text-slate-500 block">
                    تسريبات المياه النشطة
                  </span>
                  <span className="text-2xl font-black text-rose-600 font-mono">
                    {stats.totalLeaksCount}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">
                    مراحيض خارج الخدمة
                  </span>
                  <span className="text-2xl font-black text-amber-600 font-mono">
                    {stats.totalCriticalToilets}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">
                    مراوش متضررة
                  </span>
                  <span className="text-2xl font-black text-blue-700 font-mono">
                    {stats.totalBrokenShowers}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Priority Buildings Table */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                قائمة المباني ذات الأولوية للصيانة العاجلة:
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-2.5">المبنى</th>
                      <th className="p-2.5">نسبة السلامة</th>
                      <th className="p-2.5">تسريب مياه</th>
                      <th className="p-2.5">مرافق معطلة</th>
                      <th className="p-2.5">الإجراء المطلوب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {worstBuildings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">
                          {b.nameAr} ({b.id})
                        </td>
                        <td className="p-2.5 font-mono font-bold text-rose-600">
                          %{b.healthScore || 100}
                        </td>
                        <td className="p-2.5 text-rose-600 font-bold">
                          {allEvaluations.filter((e) => e.buildingId === b.id && e.defects.includes('leak')).length}
                        </td>
                        <td className="p-2.5 text-amber-600 font-bold">
                          {allEvaluations.filter((e) => e.buildingId === b.id && e.status === 'broken').length}
                        </td>
                        <td className="p-2.5 text-[11px] text-slate-600">
                          صيانة شبكة المياه واستبدال الحنفيات والسيفونات
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Photographic Evidence Samples */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                نماذج من التوثيق الميداني بالصور والأرقام الفريدة:
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {criticalItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.photoBase64 && setSelectedPhoto(item.photoBase64)}
                    className={`border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs ${
                      item.photoBase64 ? 'cursor-pointer group hover:shadow-md transition' : ''
                    }`}
                  >
                    {item.photoBase64 ? (
                      <div className="relative w-full h-24 overflow-hidden bg-slate-100">
                        <img
                          src={item.photoBase64}
                          alt={item.id}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-white p-1 rounded-md pointer-events-none transition group-hover:bg-blue-600">
                          <Maximize2 className="w-3 h-3" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-24 bg-slate-50 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400">
                        <FileText className="w-4 h-4 text-slate-300" />
                        <span>سجل رقمي</span>
                      </div>
                    )}
                    <div className="p-2 text-[10px] border-t border-slate-100">
                      <div className="font-mono font-bold text-blue-700 truncate">
                        {item.id}
                      </div>
                      <div className="text-slate-500 truncate mt-0.5">
                        {item.defects.join('، ') || 'خلل تشغيلي'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Recommendations */}
            <div className="border-t border-slate-300 pt-4 flex flex-col gap-2 text-xs">
              <h4 className="font-bold text-slate-900">
                التوصيات المقدمة لإدارة الصيانة والتشغيل:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-700 leading-relaxed">
                <li>معالجة عاجلة لكافة الحنفيات والسيفونات التي تسرب مياه لمنع هدر المياه.</li>
                <li>صيانة واستبدال سخانات المياه غير العاملة في الأجنحة 3 و 4.</li>
                <li>صيانة شفاطات التهوية للتخلص من الرطوبة والروائح في الأجنحة.</li>
                <li>تكثيف نظافة أرضيات وجدران المراوش لإزالة الصدأ والتكلسات.</li>
              </ol>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-300 text-center text-xs text-slate-600">
              <div>
                <span className="block font-bold text-slate-800">ممثلو رواد المباني السكنية</span>
                <span className="block text-[11px] mt-1 text-slate-400">التوثيق الميداني المعتمد</span>
              </div>
              <div>
                <span className="block font-bold text-slate-800">إدارة الإسكان والتشغيل</span>
                <span className="block text-[11px] mt-1 text-slate-400">للاطلاع والمعالجة</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Full-Screen Image Lightbox with Pinch-to-Zoom */}
      {selectedPhoto && (
        <ImageViewerModal
          src={selectedPhoto}
          title="توثيق تقرير المعاينة"
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  );
};
