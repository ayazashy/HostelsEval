// ============================================================================
// HostelsEval — Network Transfer Progress Store (Download & Upload Tracker)
// Provides real-time & estimated animated progress for slow networks / old devices
// ============================================================================

export type TransferDirection = 'download' | 'upload';

export interface NetworkTransferState {
  active: boolean;
  direction: TransferDirection;
  titleAr: string;
  subtitleAr?: string;
  progressPct: number; // 0..100
  startedAt: number;
}

type Listener = (state: NetworkTransferState) => void;

let currentState: NetworkTransferState = {
  active: false,
  direction: 'download',
  titleAr: '',
  subtitleAr: undefined,
  progressPct: 0,
  startedAt: 0,
};

const listeners = new Set<Listener>();
let activeTimer: ReturnType<typeof setInterval> | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let activeTasksCount = 0;

function notify() {
  for (const l of listeners) {
    l({ ...currentState });
  }
}

function clearTimers() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

export function subscribeNetworkProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...currentState });
  return () => {
    listeners.delete(listener);
  };
}

export function startNetworkTransfer(params: {
  direction: TransferDirection;
  titleAr: string;
  subtitleAr?: string;
  estimatedDurationMs?: number;
}): void {
  activeTasksCount += 1;
  clearTimers();

  const duration = params.estimatedDurationMs || 1800;
  const startTs = Date.now();

  currentState = {
    active: true,
    direction: params.direction,
    titleAr: params.titleAr,
    subtitleAr: params.subtitleAr,
    progressPct: 8,
    startedAt: startTs,
  };
  notify();

  // Smooth asymptotic progress curve up to 92% while waiting for network
  activeTimer = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const ratio = Math.min(1, elapsed / duration);
    // Ease-out curve: fast initial progress, slows near 92%
    const eased = Math.round(8 + 84 * (1 - Math.pow(1 - ratio, 2.2)));
    if (eased > currentState.progressPct && currentState.progressPct < 92) {
      currentState.progressPct = Math.min(92, eased);
      notify();
    } else if (currentState.progressPct < 95 && elapsed > duration) {
      currentState.progressPct = Math.min(95, currentState.progressPct + 1);
      notify();
    }
  }, 90);
}

export function updateNetworkTransfer(progressPct: number, subtitleAr?: string): void {
  if (!currentState.active) return;
  currentState.progressPct = Math.max(currentState.progressPct, Math.min(99, Math.round(progressPct)));
  if (subtitleAr !== undefined) {
    currentState.subtitleAr = subtitleAr;
  }
  notify();
}

export function finishNetworkTransfer(): void {
  activeTasksCount = Math.max(0, activeTasksCount - 1);
  if (activeTasksCount > 0) {
    return;
  }

  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }

  if (!currentState.active) return;

  currentState.progressPct = 100;
  notify();

  hideTimeout = setTimeout(() => {
    currentState = {
      ...currentState,
      active: false,
      progressPct: 0,
    };
    notify();
  }, 260);
}

export async function runWithNetworkProgress<T>(
  params: {
    direction: TransferDirection;
    titleAr: string;
    subtitleAr?: string;
    detailAr?: string;
    estimatedDurationMs?: number;
  },
  task: (updateProgress: (progressPct: number, detailAr?: string) => void) => Promise<T>
): Promise<T> {
  startNetworkTransfer({
    ...params,
    subtitleAr: params.subtitleAr ?? params.detailAr,
  });
  try {
    return await task(updateNetworkTransfer);
  } finally {
    finishNetworkTransfer();
  }
}
