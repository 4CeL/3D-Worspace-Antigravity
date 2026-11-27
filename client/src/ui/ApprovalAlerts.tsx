import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Crosshair, Hand, HelpCircle, X } from 'lucide-react';
import type { AgentNode, PendingApprovalRequest } from '@office/shared';

interface ApprovalAlertsProps {
  agents: AgentNode[];
  onFocusAgent: (agentId: string) => void;
}

function formatWaitingDuration(startedAt: number, now: number): string {
  const totalSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (totalSec < 60) return `${totalSec}d`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${secs}d`;
}

function getOrCreateAudioContext(
  ref: React.MutableRefObject<AudioContext | null>,
): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (ref.current && ref.current.state !== 'closed') {
      return ref.current;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ref.current = new AudioCtx();
    return ref.current;
  } catch {
    return null;
  }
}

function playGentleChime(ref: React.MutableRefObject<AudioContext | null>): void {
  try {
    const ctx = getOrCreateAudioContext(ref);
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const start = ctx.currentTime + 0.01;
    const notes = [659.25, 880]; // Warm gentle E5 -> A5 chime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start + idx * 0.14);

      gain.gain.setValueAtTime(0.0001, start + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.055, start + idx * 0.14 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + idx * 0.14 + 0.34);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + idx * 0.14);
      osc.stop(start + idx * 0.14 + 0.36);
    });
  } catch {
    // Gracefully no-op in jsdom/SSR or when autoplay/AudioContext is unavailable
  }
}

export const ApprovalAlerts: React.FC<ApprovalAlertsProps> = ({ agents, onFocusAgent }) => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastChimeAtRef = useRef<number>(0);

  // Close reusable AudioContext cleanly on unmount
  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== 'closed') {
        try {
          void ctx.close().catch(() => {});
        } catch {
          // ignore close errors in restricted/mocked environments
        }
      }
    };
  }, []);

  const pendingItems = useMemo(() => {
    const list: Array<{ key: string; agent: AgentNode; req: PendingApprovalRequest }> = [];
    for (const agent of agents) {
      if (agent.pendingApproval) {
        list.push({
          key: `${agent.id}:${agent.pendingApproval.id}`,
          agent,
          req: agent.pendingApproval,
        });
      }
    }
    list.sort((a, b) => a.req.startedAt - b.req.startedAt);
    return list;
  }, [agents]);

  const visibleItems = useMemo(
    () => pendingItems.filter((item) => !dismissedIds.has(item.key)),
    [pendingItems, dismissedIds],
  );

  // Prune resolved keys from seenIdsRef & dismissedIds, and play chime once for brand-new requests
  useEffect(() => {
    const activeKeys = new Set(pendingItems.map((item) => item.key));

    for (const key of Array.from(seenIdsRef.current)) {
      if (!activeKeys.has(key)) {
        seenIdsRef.current.delete(key);
      }
    }

    setDismissedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (activeKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    let hasNew = false;
    for (const item of pendingItems) {
      if (!seenIdsRef.current.has(item.key)) {
        seenIdsRef.current.add(item.key);
        hasNew = true;
      }
    }
    if (hasNew && soundEnabled) {
      const ts = Date.now();
      if (ts - lastChimeAtRef.current >= 1500) {
        lastChimeAtRef.current = ts;
        playGentleChime(audioCtxRef);
      }
    }
  }, [pendingItems, soundEnabled]);

  // Update live waiting durations every 1s only while alerts are visible
  useEffect(() => {
    if (visibleItems.length === 0) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [visibleItems.length]);

  if (visibleItems.length === 0) return null;

  const handleDismiss = (requestId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(requestId);
      return next;
    });
  };

  return (
    <section
      aria-label="Notifikasi Persetujuan Agent"
      className="pointer-events-none fixed bottom-5 left-1/2 z-30 flex w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2"
    >
      {/* Subtle sound toggle bar */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSoundEnabled((prev) => !prev)}
          aria-label={soundEnabled ? 'Matikan suara notifikasi' : 'Nyalakan suara notifikasi'}
          title={soundEnabled ? 'Suara chime aktif (klik untuk bisukan)' : 'Suara chime dibisukan'}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-stone-200/90 bg-white/90 px-2.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm backdrop-blur-md transition hover:bg-stone-50"
        >
          {soundEnabled ? (
            <>
              <Bell className="h-3 w-3 text-amber-600" />
              <span>Suara Aktif</span>
            </>
          ) : (
            <>
              <BellOff className="h-3 w-3 text-stone-400" />
              <span>Bisu</span>
            </>
          )}
        </button>
      </div>

      {visibleItems.map(({ key, agent, req }) => {
        const isQuestion = req.kind === 'question';
        const waitText = formatWaitingDuration(req.startedAt, now);

        return (
          <div
            key={key}
            role="alert"
            aria-atomic="true"
            className={`pointer-events-auto rounded-2xl border bg-white/95 p-3.5 shadow-xl shadow-stone-900/12 backdrop-blur-md transition ${
              isQuestion
                ? 'border-indigo-300/95 ring-2 ring-indigo-200/70'
                : 'border-amber-300/95 ring-2 ring-amber-200/75'
            }`}
          >
            {/* Card header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-xl ${
                    isQuestion
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {isQuestion ? (
                    <HelpCircle className="h-4 w-4" />
                  ) : (
                    <Hand className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-stone-800">
                      {agent.displayName || agent.role}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                      {agent.projectName}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        isQuestion
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {waitText}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                aria-label="Tutup notifikasi"
                onClick={() => handleDismiss(key)}
                className="shrink-0 rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Request title + monospace detail */}
            <div className="mt-2">
              <p className="text-xs font-bold text-stone-800">{req.title}</p>
              {req.detail && (
                <p
                  title={req.detail}
                  className="mt-1 line-clamp-2 rounded-xl bg-stone-100/90 px-2.5 py-1.5 font-mono text-[11px] text-stone-700"
                >
                  {req.detail}
                </p>
              )}
            </div>

            {/* Guidance + action */}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-stone-500">
                {isQuestion
                  ? 'Jawab pertanyaan di jendela Antigravity'
                  : 'Konfirmasi Yes / No di jendela Antigravity'}
              </span>
              <button
                type="button"
                onClick={() => onFocusAgent(agent.id)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition ${
                  isQuestion
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>Lihat Meja</span>
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
};
