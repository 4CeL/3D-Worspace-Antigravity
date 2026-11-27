import React, { useState } from 'react';
import {
  Building2,
  Eye,
  EyeOff,
  FlaskConical,
  RotateCcw,
  Tag,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { RecencyWindow } from '@office/shared';

interface TopBarProps {
  activeCount: number;
  totalCount: number;
  connected: boolean;
  hookActive: boolean;
  demoMode: boolean;
  projects: string[];
  selectedProject: string;
  recency: RecencyWindow;
  showLabels: boolean;
  hideFinished: boolean;
  hiddenCount?: number;
  pendingCount?: number;
  onSelectProject: (project: string) => void;
  onChangeRecency: (recency: RecencyWindow) => void;
  onToggleLabels: () => void;
  onToggleHideFinished: () => void;
  onUnhideAll?: () => void;
  onFocusPending?: () => void;
  onToggleDemo: () => void;
  onResetCamera: () => void;
}

const RECENCY_OPTIONS: Array<{ value: RecencyWindow; label: string }> = [
  { value: '30m', label: '30m' },
  { value: '2h', label: '2j' },
  { value: 'today', label: 'Hari ini' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeCount,
  totalCount,
  connected,
  hookActive,
  demoMode,
  projects,
  selectedProject,
  recency,
  showLabels,
  hideFinished,
  hiddenCount = 0,
  pendingCount = 0,
  onSelectProject,
  onChangeRecency,
  onToggleLabels,
  onToggleHideFinished,
  onUnhideAll,
  onFocusPending,
  onToggleDemo,
  onResetCamera,
}) => {
  const [showHookTip, setShowHookTip] = useState(false);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
      {/* Left translucent pill: Brand, Live count, Project Filter, Recency */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/80 bg-white/88 px-3.5 py-2 shadow-lg shadow-stone-900/5 backdrop-blur-md">
        <div className="flex items-center gap-2 pr-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold tracking-tight text-stone-800">
            Antigravity Office
          </span>
        </div>

        <span className="h-4 w-px bg-stone-200" />

        <div
          className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
          title={`${activeCount} aktif dari ${totalCount} agent di kantor`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>{activeCount} Aktif</span>
          <span className="font-normal text-emerald-600/80">/ {totalCount}</span>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            aria-label="Fokus agent yang butuh izin"
            onClick={() => onFocusPending?.()}
            className="flex animate-pulse items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-xs transition hover:bg-amber-200"
          >
            <span>✋ {pendingCount} Butuh Izin</span>
          </button>
        )}

        {/* Project filter */}
        <select
          aria-label="Filter Project"
          value={selectedProject}
          onChange={(e) => onSelectProject(e.target.value)}
          className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700 outline-none transition hover:border-stone-300 focus:border-emerald-500"
        >
          <option value="ALL">Semua Project</option>
          {projects.map((proj) => (
            <option key={proj} value={proj}>
              {proj}
            </option>
          ))}
        </select>

        {/* Recency window */}
        <div className="flex items-center rounded-xl bg-stone-100 p-0.5 text-xs">
          {RECENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChangeRecency(opt.value)}
              className={`rounded-lg px-2 py-0.5 font-medium transition ${
                recency === opt.value
                  ? 'bg-white text-stone-800 shadow-xs'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right translucent pill: Controls + Hook status */}
      <div className="pointer-events-auto relative flex flex-wrap items-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/88 px-2.5 py-2 shadow-lg shadow-stone-900/5 backdrop-blur-md">
        {/* Hook telemetry mode badge */}
        <button
          type="button"
          onClick={() => setShowHookTip((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
            hookActive
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
          title="Status integrasi Global Hook Antigravity"
        >
          <Zap className="h-3.5 w-3.5" />
          <span>{hookActive ? 'Hybrid Live' : 'Transcript Only'}</span>
        </button>

        {/* Connection icon */}
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-xl ${
            connected ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}
          title={connected ? 'Terhubung ke server lokal' : 'Menghubungkan ulang...'}
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        </span>

        <span className="h-4 w-px bg-stone-200" />

        <button
          type="button"
          onClick={onToggleLabels}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
            showLabels
              ? 'bg-stone-800 text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Label File</span>
        </button>

        <button
          type="button"
          onClick={onToggleHideFinished}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
            hideFinished
              ? 'bg-stone-800 text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {hideFinished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          <span>Sembunyikan Selesai</span>
        </button>

        {hiddenCount > 0 && onUnhideAll && (
          <button
            type="button"
            aria-label="Pulihkan meja tersembunyi"
            onClick={onUnhideAll}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Pulihkan {hiddenCount} Meja</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleDemo}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
            demoMode
              ? 'bg-violet-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          <span>Mode Simulasi</span>
        </button>

        <button
          type="button"
          onClick={onResetCamera}
          className="flex items-center gap-1.5 rounded-xl bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Kamera</span>
        </button>

        {/* Hook setup quick popover */}
        {showHookTip && (
          <div className="absolute right-0 top-12 z-30 w-80 rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600 shadow-xl">
            <div className="mb-1.5 flex items-center justify-between">
              <strong className="text-stone-800">
                {hookActive ? 'Global Hook Aktif (Hybrid Live)' : 'Aktifkan Global Hook Antigravity'}
              </strong>
              <button
                type="button"
                onClick={() => setShowHookTip(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>
            {hookActive ? (
              <p>
                Event lifecycle Antigravity mengalir instan ke kantor 3D bersama data transcript
                lokal.
              </p>
            ) : (
              <>
                <p className="mb-2">
                  Saat ini kantor 3D berjalan di mode <strong>Transcript Only</strong>. Untuk
                  animasi instan tanpa jeda & nama project resmi, jalankan perintah ini sekali di
                  folder project:
                </p>
                <pre className="rounded-xl bg-stone-900 px-3 py-2 font-mono text-[11px] text-emerald-300">
                  npm run setup-hooks
                </pre>
                <p className="mt-2 text-[11px] text-stone-500">
                  Aman & fail-open (&lt;=150ms). Bisa dilepas kapan saja dengan{' '}
                  <code className="font-mono text-stone-700">npm run remove-hooks</code>.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
