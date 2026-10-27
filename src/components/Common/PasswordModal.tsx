// ============================================================================
// 🔐 دخول رائد المبنى (Light Mode)
// تقييم ومتابعة مرافق مباني الإسكان الطلابي
// ============================================================================

import React, { useState } from 'react';
import { BuildingInfo, BuildingLeaderAuth } from '../../types/hostel';
import { loginBuildingLeaderWithCode, BUILDING_LEADER_ACCOUNTS } from '../../services/authService';
import { KeyRound, ShieldAlert, X, Check } from 'lucide-react';

interface PasswordModalProps {
  buildings: BuildingInfo[];
  selectedBuildingId: string;
  onClose: () => void;
  onSuccess: (auth: BuildingLeaderAuth) => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  buildings,
  selectedBuildingId,
  onClose,
  onSuccess,
}) => {
  const [buildingId, setBuildingId] = useState(selectedBuildingId);
  const [leaderName, setLeaderName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const result = loginBuildingLeaderWithCode(buildingId, accessCode, leaderName);
    if (result.success && result.auth) {
      onSuccess(result.auth);
      onClose();
    } else {
      setErrorMsg(result.error || 'كود الدخول غير صحيح');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition"
          title="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-5 pb-3 border-b border-slate-100 flex items-center gap-3">
          <img
            src="/housing-logo.png"
            alt="شعار إدارة الإسكان الطلابي - جامعة الملك سعود"
            className="housing-brand-logo-modal"
            style={{ height: '36px', width: 'auto', maxWidth: '120px', objectFit: 'contain' }}
          />
          <div>
            <h3 className="text-base font-bold text-slate-900">دخول رائد المبنى المعتمد</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              لإدخال وتعديل بيانات التفتيش الميداني الخاصة بمبناك
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
          {/* Building Select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-700 font-bold">المبنى المسؤول عنه:</label>
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 font-bold focus:bg-white"
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr} ({b.id})
                </option>
              ))}
            </select>
          </div>

          {/* Inspector Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-700 font-bold">اسم رائد المبنى:</label>
            <input
              type="text"
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
              placeholder="مثال: عبدالله الشمري"
              className="bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 placeholder-slate-400 focus:bg-white"
            />
          </div>

          {/* Access Code Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-700 font-bold">كود الدخول المخصص (Access Code):</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="أدخل كود الدخول المعتمد لمبناك..."
                required
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pr-9 pl-3 py-2.5 placeholder-slate-400 font-mono focus:bg-white"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm mt-1"
          >
            <Check className="w-4 h-4" />
            <span>تسجيل الدخول وبدء التفتيش</span>
          </button>
        </form>
      </div>
    </div>
  );
};
