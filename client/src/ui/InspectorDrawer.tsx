import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  EyeOff,
  FileCode2,
  FolderGit2,
  Hand,
  HelpCircle,
  Layers,
  Pencil,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import type { AgentNode, AgentStatus, FileAction, FloorConfig } from '@office/shared';

interface InspectorDrawerProps {
  agent: AgentNode | null;
  allAgents: Record<string, AgentNode>;
  floors?: FloorConfig[];
  currentFloorId?: string;
  onClose: () => void;
  onFocusAgent: (agentId: string) => void;
  onRenameAgent?: (agentId: string, name: string | null) => void;
  onMoveTeamFloor?: (rootId: string, floorId: string) => void;
  onHideAgent?: (agentId: string) => void;
}

const STATUS_BADGE: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  editing: { label: 'Mengedit file', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  reading: { label: 'Membaca kode', cls: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  running: { label: 'Menjalankan command', cls: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  thinking: { label: 'Sedang berpikir', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  delegating: { label: 'Koordinasi tim', cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  error: { label: 'Error tool', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  idle: { label: 'Selesai / Santai', cls: 'bg-stone-100 text-stone-600', dot: 'bg-stone-400' },
};

const FILE_BADGE: Record<FileAction, { label: string; cls: string }> = {
  edit: { label: 'EDIT', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  write: { label: 'WRITE', cls: 'bg-teal-100 text-teal-800 border-teal-200' },
  read: { label: 'READ', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
};

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 10) return 'baru saja';
  if (diffSec < 60) return `${diffSec}d lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m lalu`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}j lalu`;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  agent,
  allAgents,
  floors,
  currentFloorId,
  onClose,
  onFocusAgent,
  onRenameAgent,
  onMoveTeamFloor,
  onHideAgent,
}) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    setEditingName(false);
    setDraftName(agent?.displayName ?? '');
  }, [agent?.id]);

  useEffect(() => {
    if (!agent) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingName) {
          setEditingName(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [agent, editingName, onClose]);

  if (!agent) return null;

  const badge = Object.prototype.hasOwnProperty.call(STATUS_BADGE, agent.status)
    ? STATUS_BADGE[agent.status]
    : STATUS_BADGE.idle;
  const parentAgent = agent.parentId ? allAgents[agent.parentId] : null;
  const childAgents = Object.values(allAgents).filter((a) => a.parentId === agent.id);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== agent.displayName) {
      onRenameAgent?.(agent.id, trimmed);
    }
    setEditingName(false);
  };

  const handleCopy = async (fullPath: string) => {
    try {
      await navigator.clipboard.writeText(fullPath);
      setCopiedPath(fullPath);
      window.setTimeout(() => {
        setCopiedPath((prev) => (prev === fullPath ? null : prev));
      }, 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <aside
      aria-label="Inspector Agent"
      className="fixed bottom-4 right-4 top-20 z-20 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-stone-200/90 bg-white/95 shadow-2xl shadow-stone-900/12 backdrop-blur-md"
    >
      {/* Header */}
      <div className="border-b border-stone-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                {agent.isSubagent ? 'Subagent' : 'Main Agent'}
              </span>
              {agent.modelName && (
                <span className="truncate font-mono text-[10px] text-stone-400">
                  {agent.modelName}
                </span>
              )}
            </div>
            {editingName ? (
              <div className="mt-1.5 flex items-center gap-1">
                <input
                  type="text"
                  aria-label="Nama agent baru"
                  autoFocus
                  maxLength={60}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingName(false);
                      setDraftName(agent.displayName);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-emerald-400 bg-white px-2 py-1 text-sm font-semibold text-stone-800 outline-none ring-2 ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={commitRename}
                  aria-label="Simpan nama"
                  className="rounded-lg bg-emerald-600 p-1.5 text-white transition hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setDraftName(agent.displayName);
                  }}
                  aria-label="Batal ganti nama"
                  className="rounded-lg bg-stone-100 p-1.5 text-stone-500 transition hover:bg-stone-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1.5">
                <h2 className="truncate text-base font-bold text-stone-800">
                  {agent.displayName}
                </h2>
                {onRenameAgent && (
                  <button
                    type="button"
                    aria-label="Ganti nama agent"
                    title="Ganti nama agent"
                    onClick={() => {
                      setDraftName(agent.displayName);
                      setEditingName(true);
                    }}
                    className="shrink-0 rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {onRenameAgent && agent.hasCustomAlias && (
                  <button
                    type="button"
                    aria-label="Reset nama"
                    title="Kembalikan ke nama default"
                    onClick={() => onRenameAgent(agent.id, null)}
                    className="shrink-0 rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-amber-600"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Inspector"
            className="rounded-xl p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}
          >
            <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>

          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            <FolderGit2 className="h-3.5 w-3.5 text-stone-400" />
            {agent.projectName}
          </span>
        </div>

        {/* Highlighted Pending Approval / Question Callout Banner */}
        {agent.pendingApproval && (
          <div
            role="status"
            className={`mt-2.5 rounded-2xl border p-3 ${
              agent.pendingApproval.kind === 'question'
                ? 'border-indigo-300 bg-indigo-50/90 text-indigo-950'
                : 'border-amber-300 bg-amber-50/95 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              {agent.pendingApproval.kind === 'question' ? (
                <HelpCircle className="h-3.5 w-3.5 shrink-0 animate-pulse text-indigo-600" />
              ) : (
                <Hand className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-600" />
              )}
              <span>
                {agent.pendingApproval.kind === 'question'
                  ? 'Menunggu Jawaban User'
                  : 'Butuh Persetujuan'}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold">{agent.pendingApproval.title}</p>
            {agent.pendingApproval.detail && (
              <p
                title={agent.pendingApproval.detail}
                className="mt-1 break-words rounded-xl bg-white/80 px-2.5 py-1.5 font-mono text-[11px] text-stone-700"
              >
                {agent.pendingApproval.detail}
              </p>
            )}
            <p className="mt-1.5 text-[11px] opacity-80">
              {agent.pendingApproval.kind === 'question'
                ? 'Jawab pertanyaan ini di jendela Antigravity untuk melanjutkan.'
                : 'Konfirmasi Yes / No di jendela Antigravity untuk melanjutkan.'}
            </p>
          </div>
        )}

        {/* Team floor selector */}
        {floors && floors.length > 0 && onMoveTeamFloor && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-stone-50/80 px-2.5 py-1.5">
            <label
              htmlFor="inspector-team-floor"
              className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              <span>Lantai Tim</span>
            </label>
            <select
              id="inspector-team-floor"
              aria-label="Lantai Tim"
              value={currentFloorId || floors[0].id}
              onChange={(e) => onMoveTeamFloor(agent.rootId, e.target.value)}
              className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium text-stone-700 outline-none focus:border-emerald-500"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  L{f.index} · {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {agent.focusText && (
          <p className="mt-2.5 rounded-xl bg-amber-50/70 px-3 py-2 text-xs text-stone-700">
            {agent.focusText}
          </p>
        )}

        {agent.errorMessage && (
          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {agent.errorMessage}
          </p>
        )}
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Team relationships */}
        {(parentAgent || childAgents.length > 0) && (
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <Users className="h-3.5 w-3.5" />
              <span>Relasi Tim</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parentAgent && (
                <button
                  type="button"
                  onClick={() => onFocusAgent(parentAgent.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                >
                  <span>↑ Induk: {parentAgent.displayName}</span>
                </button>
              )}
              {childAgents.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onFocusAgent(child.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[child.status].dot}`}
                  />
                  <span>↳ {child.displayName || child.role}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Primary Section: Files Worked On */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <FileCode2 className="h-3.5 w-3.5" />
              <span>File Dikerjakan ({agent.files.length})</span>
            </div>
          </div>

          {agent.files.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 p-4 text-center text-xs text-stone-400">
              Belum ada file yang dibaca atau diedit di sesi ini.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {agent.files.map((file) => {
                const actionStyle = FILE_BADGE[file.action];
                const isCopied = copiedPath === file.path;
                return (
                  <li
                    key={file.path}
                    className="group flex items-start justify-between gap-2 rounded-2xl border border-stone-100 bg-stone-50/70 p-2.5 transition hover:border-stone-200 hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold ${actionStyle.cls}`}
                        >
                          {actionStyle.label}
                        </span>
                        <span className="truncate font-mono text-xs font-semibold text-stone-800">
                          {file.fileName}
                        </span>
                        {file.count > 1 && (
                          <span className="rounded-full bg-stone-200/70 px-1.5 text-[10px] font-medium text-stone-600">
                            ×{file.count}
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-0.5 truncate font-mono text-[10px] text-stone-400"
                        title={file.path}
                      >
                        {file.relativePath}
                      </div>
                      <div className="mt-0.5 text-[10px] text-stone-400">
                        {formatTimeAgo(file.lastTouchedAt)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(file.path)}
                      title="Salin path lengkap"
                      className="shrink-0 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent Activity Feed */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Aktivitas Terbaru</span>
          </div>

          {agent.recentActivity.length === 0 ? (
            <p className="text-xs text-stone-400">Belum ada aktivitas tercatat.</p>
          ) : (
            <ul className="space-y-1.5">
              {agent.recentActivity.slice(0, 15).map((item) => (
                <li
                  key={item.id}
                  className={`flex items-start justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs ${
                    item.isError ? 'bg-rose-50 text-rose-700' : 'bg-stone-50/70 text-stone-600'
                  }`}
                >
                  <span className="min-w-0 flex-1 break-words">{item.summary}</span>
                  <span className="shrink-0 text-[10px] text-stone-400">
                    {formatTimeAgo(item.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Subtle footer action to dismiss/hide desk in 1 click */}
      {onHideAgent && (
        <div className="border-t border-stone-100 bg-stone-50/70 px-4 py-2.5">
          <button
            type="button"
            aria-label="Sembunyikan Meja"
            onClick={() => onHideAgent(agent.id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200/90 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span>Sembunyikan Meja</span>
          </button>
        </div>
      )}
    </aside>
  );
};
