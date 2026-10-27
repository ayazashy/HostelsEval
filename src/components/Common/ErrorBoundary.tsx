// ============================================================================
// 🛡️ Error Boundary (Light Mode)
// Prevents React white-screen crashes and provides graceful recovery
// ============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[HostelsEval ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetStorage = (): void => {
    try {
      localStorage.removeItem('hostels_active_view');
      localStorage.removeItem('hostels_selected_building_id');
      localStorage.removeItem('hostels_eval_local_cache');
    } catch {}
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-900" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-black text-slate-900 mb-2">
              حدث خطأ غير متوقع أثناء المعالجة
            </h2>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              تم حماية النظام واستعادة وضع الأمان بنجاح. يمكنك تحديث الصفحة أو إعادة تهيئة الذاكرة المؤقتة لمتابعة العمل بشكل طبيعي.
            </p>

            {this.state.error && (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 text-right overflow-x-auto text-xs text-rose-700 font-mono">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل الصفحة</span>
              </button>

              <button
                onClick={this.handleResetStorage}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 border border-slate-300"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                <span>تنظيف الذاكرة المؤقتة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
