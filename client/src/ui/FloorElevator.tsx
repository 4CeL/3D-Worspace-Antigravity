import React, { useState } from 'react';
import { Check, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { FloorConfig } from '@office/shared';

interface FloorElevatorProps {
  floors: FloorConfig[];
  focusedFloorIndex: number | null;
  floorStats: Record<string, { active: number; total: number }>;
  maxFloors?: number;
  onSelectFloor: (floorIndex: number | null) => void;
  onAddFloor: () => void;
  onRenameFloor: (floorId: string, name: string) => void;
  onDeleteFloor: (floorId: string) => void;
}

export const FloorElevator: React.FC<FloorElevatorProps> = ({
  floors,
  focusedFloorIndex,
  floorStats,
  maxFloors = 8,
  onSelectFloor,
  onAddFloor,
  onRenameFloor,
  onDeleteFloor,
}) => {
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const sortedTopDown = [...floors].sort((a, b) => b.index - a.index);
  const canAdd = floors.length < maxFloors;

  const commitRename = (floorId: string, originalName: string) => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== originalName) {
      onRenameFloor(floorId, trimmed);
    }
    setEditingFloorId(null);
  };

  return (
    <nav
      aria-label="Navigasi Lantai Gedung"
      className="pointer-events-auto fixed left-3 top-1/2 z-20 flex w-44 -translate-y-1/2 flex-col gap-1.5 rounded-2xl border border-stone-200/85 bg-white/90 p-2 shadow-lg shadow-stone-900/8 backdrop-blur-md sm:left-4"
    >
      {/* Add floor button at top */}
      <button
        type="button"
        disabled={!canAdd}
        onClick={onAddFloor}
        aria-label="Tambah Lantai"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-stone-50/80 px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>Tambah Lantai</span>
      </button>

      {/* Stacked floor buttons (top floor first, like a real elevator) */}
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto py-0.5">
        {sortedTopDown.map((floor) => {
          const stats = floorStats[floor.id] ?? { active: 0, total: 0 };
          const isFocused = focusedFloorIndex === floor.index;
          const isEditing = editingFloorId === floor.id;

          if (isEditing) {
            return (
              <div
                key={floor.id}
                className="flex items-center gap-1 rounded-xl border border-emerald-400 bg-white px-1.5 py-1"
              >
                <input
                  type="text"
                  aria-label={`Nama Lantai ${floor.index}`}
                  autoFocus
                  maxLength={40}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename(floor.id, floor.name);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingFloorId(null);
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs font-medium text-stone-800 outline-none"
                />
                <button
                  type="button"
                  aria-label="Simpan nama lantai"
                  onClick={() => commitRename(floor.id, floor.name)}
                  className="rounded-md p-0.5 text-emerald-600 hover:bg-emerald-50"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Batal"
                  onClick={() => setEditingFloorId(null)}
                  className="rounded-md p-0.5 text-stone-400 hover:bg-stone-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={floor.id}
              className={`group flex items-center gap-1 rounded-xl px-1.5 py-1 transition ${
                isFocused
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-stone-50/70 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectFloor(floor.index)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span
                  className={`flex h-5 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                    isFocused ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-700'
                  }`}
                >
                  L{floor.index}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{floor.name}</span>
                {stats.total > 0 && (
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isFocused
                        ? 'bg-white/20 text-white'
                        : stats.active > 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-stone-200/70 text-stone-500'
                    }`}
                    title={`${stats.active} aktif / ${stats.total} total agent`}
                  >
                    {stats.active > 0 && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isFocused ? 'bg-emerald-200' : 'bg-emerald-500'
                        }`}
                      />
                    )}
                    {stats.active > 0 ? stats.active : stats.total}
                  </span>
                )}
              </button>

              <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  aria-label={`Ganti nama Lantai ${floor.index}`}
                  title="Ganti nama lantai"
                  onClick={() => {
                    setDraftName(floor.name);
                    setEditingFloorId(floor.id);
                  }}
                  className={`rounded-md p-0.5 ${
                    isFocused
                      ? 'text-white/80 hover:bg-white/20 hover:text-white'
                      : 'text-stone-400 hover:bg-stone-200 hover:text-stone-700'
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                {floor.index > 1 && (
                  <button
                    type="button"
                    aria-label={`Hapus Lantai ${floor.index}`}
                    title="Hapus lantai (tim dipindah ke Lantai 1)"
                    onClick={() => onDeleteFloor(floor.id)}
                    className={`rounded-md p-0.5 ${
                      isFocused
                        ? 'text-white/80 hover:bg-rose-500/80 hover:text-white'
                        : 'text-stone-400 hover:bg-rose-100 hover:text-rose-600'
                    }`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Building overview ("Semua Lantai") button */}
      <button
        type="button"
        onClick={() => onSelectFloor(null)}
        className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
          focusedFloorIndex === null
            ? 'bg-stone-800 text-white shadow-xs'
            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }`}
      >
        <Layers className="h-3.5 w-3.5" />
        <span>Semua Lantai</span>
      </button>
    </nav>
  );
};
