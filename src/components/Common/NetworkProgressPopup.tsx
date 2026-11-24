// ============================================================================
// نافذة شريط التحميل التفاعلي للبيانات والمرفقات (Animated Transfer Progress Popup)
// Displays estimated animated progress bar during data downloads & uploads
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  NetworkTransferState,
  subscribeNetworkProgress,
} from '../../utils/networkProgressStore';
import { DownloadCloud, UploadCloud, Loader2 } from 'lucide-react';

export const NetworkProgressPopup: React.FC = () => {
  const [transfer, setTransfer] = useState<NetworkTransferState>({
    active: false,
    direction: 'download',
    titleAr: '',
    progressPct: 0,
    startedAt: 0,
  });

  useEffect(() => {
    return subscribeNetworkProgress(setTransfer);
  }, []);

  if (!transfer.active) return null;

  const isUpload = transfer.direction === 'upload';

  return (
    <div className="fixed bottom-16 md:bottom-5 left-4 right-4 sm:left-6 sm:right-auto sm:w-96 z-50 pointer-events-none print:hidden">
      <div className="bg-slate-900 text-white border border-slate-700 rounded-2xl p-3.5 shadow-2xl pointer-events-auto flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isUpload
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {isUpload ? (
                <UploadCloud className="w-4 h-4" />
              ) : (
                <DownloadCloud className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
                <span className="truncate">{transfer.titleAr}</span>
              </div>
              {transfer.subtitleAr && (
                <p className="text-[10px] text-slate-300 truncate mt-0.5">
                  {transfer.subtitleAr}
                </p>
              )}
            </div>
          </div>

          <span className="text-xs font-mono font-black text-blue-300 shrink-0">
            {transfer.progressPct}%
          </span>
        </div>

        {/* Animated Estimated Progress Bar */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-150 ${
              isUpload ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.max(6, transfer.progressPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
