// ============================================================================
// ⏱️ السجل الزمني ومتابعة الإصلاحات (Inspection Timeline & Follow-up Tracker)
// Light Mode - Clean Architectural Style
// ============================================================================

import React, { useState, useEffect } from 'react';
import { EvaluationHistoryEntry } from '../../types/hostel';
import { getBuildingTimeline, resolveTimelineIssue } from '../../services/firestoreService';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Search,
  Filter,
  User,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Maximize2,
} from 'lucide-react';
import { ImageViewerModal } from '../Common/ImageViewerModal';

interface TimelineViewerProps {
  buildingId?: string; // Optional: filter by building
  canResolve?: boolean; // Can user mark issues as resolved?
  currentUserName?: string;
  onRefresh?: () => void;
}

export const TimelineViewer: React.FC<TimelineViewerProps> = ({
  buildingId,
  canResolve = true,
  currentUserName = 'فريق الصيانة',
  onRefresh,
}) => {
  const [entries, setEntries] = useState<EvaluationHistoryEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Resolution modal state
  const [resolvingEntryId, setResolvingEntryId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolverName, setResolverName] = useState(currentUserName);

  const loadEntries = () => {
    const list = getBuildingTimeline(buildingId);
    setEntries(list);
  };

  useEffect(() => {
    loadEntries();

    const handleUpdate = () => {
      loadEntries();
      if (onRefresh) onRefresh();
    };

    window.addEventListener('hostels_timeline_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('hostels_timeline_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [buildingId]);

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingEntryId) return;

    resolveTimelineIssue(
      resolvingEntryId,
      resolutionNotes.trim() || 'تم الإصلاح والمعالجة بنجاح',
      resolverName.trim() || currentUserName
    );

    setResolvingEntryId(null);
    setResolutionNotes('');
    loadEntries();
  };

  const filteredEntries = entries.filter((entry) => {
    // Filter by resolution status
    if (filter === 'unresolved' && entry.isResolved) return false;
    if (filter === 'resolved' && !entry.isResolved) return false;

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchFixture = entry.fixtureId.toLowerCase().includes(q);
      const matchBuilding = entry.buildingId.toLowerCase().includes(q);
      const matchInspector = (entry.inspectorName || '').toLowerCase().includes(q);
      const matchNotes = (entry.notes || '').toLowerCase().includes(q);
      const matchDefects = entry.defects.some((d) => d.toLowerCase().includes(q));
      if (!matchFixture && !matchBuilding && !matchInspector && !matchNotes && !matchDefects) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header and Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              سجل الفحوصات وتتبع الملاحظات {buildingId ? `• المبنى ${buildingId}` : ''}
            </h3>
            <p className="text-xs text-slate-500">
              توثيق زمني مستمر لجميع عمليات الفحص والتسريبات ومتابعة المعالجة
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({entries.length})
            </button>
            <button
              onClick={() => setFilter('unresolved')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                filter === 'unresolved'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              قيد المتابعة ({entries.filter((e) => !e.isResolved).length})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                filter === 'resolved'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              تم الإصلاح ({entries.filter((e) => e.isResolved).length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في السجل..."
              className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Timeline Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 shadow-sm">
          <Clock className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-700">لا توجد سجلات مسجلة مطابقة حتى الآن</p>
          <p className="text-xs text-slate-500 mt-1">
            عند حفظ أي فحص عبر استمارة الفحص الميداني، سيتم تسجيله هنا تلقائياً بتوقيته لمتابعة الإصلاحات.
          </p>
        </div>
      ) : (
        <div className="relative border-r-2 border-slate-200 pr-5 mr-3 flex flex-col gap-4">
          {filteredEntries.map((entry) => {
            const dateObj = new Date(entry.timestamp);
            const timeStr = dateObj.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            const dateStr = dateObj.toLocaleDateString('ar-SA', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            const isOperational = entry.status === 'operational';
            const hasLeaks = entry.defects.includes('leak');

            return (
              <div key={entry.id} className="relative group">
                {/* Timeline node icon on vertical line */}
                <div
                  className={`absolute -right-[27px] top-4 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition ${
                    entry.isResolved
                      ? 'border-emerald-500 text-emerald-600'
                      : hasLeaks
                      ? 'border-rose-500 text-rose-600'
                      : isOperational
                      ? 'border-blue-500 text-blue-600'
                      : 'border-amber-500 text-amber-600'
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      entry.isResolved
                        ? 'bg-emerald-500'
                        : hasLeaks
                        ? 'bg-rose-500'
                        : isOperational
                        ? 'bg-blue-500'
                        : 'bg-amber-500'
                    }`}
                  />
                </div>

                {/* Entry Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-300 transition flex flex-col gap-3">
                  {/* Top Bar: Sector, Fixture, Time */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-800 font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-200">
                        {entry.buildingId} • الدور {entry.floor} • جناح {entry.wingId}
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {entry.fixtureId}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {dateStr} - {timeStr}
                      </span>
                    </div>
                  </div>

                  {/* Body: Status, Defects, Inspector, Notes */}
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Badge */}
                        <span
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 ${
                            entry.status === 'operational'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : entry.status === 'needs_maintenance'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {entry.status === 'operational' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {entry.status === 'operational'
                            ? 'سليم ويعمل'
                            : entry.status === 'needs_maintenance'
                            ? 'يحتاج صيانة'
                            : 'عاطل عن العمل'}
                        </span>

                        {/* Defect tags */}
                        {entry.defects.map((d, i) => (
                          <span
                            key={i}
                            className={`text-xs px-2 py-0.5 rounded-lg font-bold border ${
                              d === 'leak'
                                ? 'bg-rose-100 border-rose-300 text-rose-800 animate-pulse'
                                : 'bg-amber-100 border-amber-300 text-amber-800'
                            }`}
                          >
                            {d === 'leak' ? '💧 تسريب مياه' : d}
                          </span>
                        ))}

                        {/* Inspector */}
                        <span className="text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>المفتش: <strong>{entry.inspectorName || 'غير مسجل'}</strong></span>
                        </span>
                      </div>

                      {/* Notes */}
                      {entry.notes && (
                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          {entry.notes}
                        </p>
                      )}
                    </div>

                    {/* Photo thumbnail */}
                    {entry.photoBase64 && (
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(entry.photoBase64 || null)}
                          className="relative group/img overflow-hidden rounded-xl border border-slate-200 w-20 h-20 shadow-xs cursor-pointer block"
                        >
                          <img
                            src={entry.photoBase64}
                            alt="توثيق العطل"
                            className="w-full h-full object-cover group-hover/img:scale-105 transition"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-white p-1 rounded-md pointer-events-none transition group-hover/img:bg-blue-600">
                            <Maximize2 className="w-3 h-3" />
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Resolution Tracker Footer */}
                  <div className="mt-1 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    {entry.isResolved ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-lg font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          تمت المعالجة والإصلاح بنجاح ✅
                        </span>
                        {entry.resolvedBy && (
                          <span className="text-slate-600">
                            بواسطة: <strong>{entry.resolvedBy}</strong>
                          </span>
                        )}
                        {entry.resolutionNotes && (
                          <span className="text-slate-500 italic">
                            ({entry.resolutionNotes})
                          </span>
                        )}
                        {entry.resolvedAt && (
                          <span className="text-slate-400 font-mono text-[11px]">
                            {new Date(entry.resolvedAt).toLocaleDateString('ar-SA')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <Wrench className="w-3.5 h-3.5 text-amber-600" />
                          الملاحظة قيد المتابعة والإصلاح
                        </span>

                        {canResolve && (
                          <button
                            onClick={() => {
                              setResolvingEntryId(entry.id);
                              setResolutionNotes('');
                              setResolverName(currentUserName);
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>تسجيل إتمام الإصلاح</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resolution Modal */}
      {resolvingEntryId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 text-right flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                توثيق إتمام الإصلاح والمعالجة
              </h3>
              <button
                onClick={() => setResolvingEntryId(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم القائم بالإصلاح / الفني / المشرف:
                </label>
                <input
                  type="text"
                  value={resolverName}
                  onChange={(e) => setResolverName(e.target.value)}
                  placeholder="مثال: فريق صيانة السباكة / رائد المبنى"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تفاصيل الإصلاح والقطع المستبدلة:
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="مثال: تم تغيير خلاط المياه ومعالجة تسريب محبس الزاوية واختبار الضغط بنجاح..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResolvingEntryId(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>تأكيد إتمام الإصلاح</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Full-Screen Image Lightbox with Pinch-to-Zoom */}
      {selectedPhoto && (
        <ImageViewerModal
          src={selectedPhoto}
          title="توثيق بلاغ الصيانة"
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  );
};
