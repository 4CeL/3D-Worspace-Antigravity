import React, { useMemo, useState } from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';
import { useOfficeSocket } from './hooks/useOfficeSocket';
import { OfficeCanvas } from './scene/OfficeCanvas';
import { TopBar } from './ui/TopBar';
import { InspectorDrawer } from './ui/InspectorDrawer';
import { FloorElevator } from './ui/FloorElevator';
import { filterSnapshotForView } from './ui/filterSnapshot';

export const App: React.FC = () => {
  const {
    snapshot,
    connected,
    recency,
    setRecency,
    toggleDemo,
    renameAgent,
    addFloor,
    renameFloor,
    deleteFloor,
    moveTeamFloor,
  } = useOfficeSocket();

  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [showLabels, setShowLabels] = useState(true);
  const [hideFinished, setHideFinished] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [focusedFloorIndex, setFocusedFloorIndex] = useState<number | null>(null);
  const [floorFocusNonce, setFloorFocusNonce] = useState(0);
  const [resetNonce, setResetNonce] = useState(0);

  const { projects, effectiveProject, snapshot: filteredSnapshot } = useMemo(
    () => filterSnapshotForView(snapshot, selectedProject, hideFinished),
    [snapshot, selectedProject, hideFinished],
  );

  const floors = filteredSnapshot.floors?.length
    ? filteredSnapshot.floors
    : [{ id: 'floor-1', index: 1, name: 'Lantai 1' }];

  // Keep focusedFloorIndex valid if a higher floor gets deleted or mode switches
  const effectiveFocusedFloor =
    focusedFloorIndex !== null && floors.some((f) => f.index === focusedFloorIndex)
      ? focusedFloorIndex
      : null;

  const floorStats = useMemo(() => {
    const stats: Record<string, { active: number; total: number }> = {};
    for (const f of floors) {
      stats[f.id] = { active: 0, total: 0 };
    }
    const defaultFloorId = floors[0].id;
    for (const cluster of filteredSnapshot.clusters) {
      const fid = stats[cluster.floorId] ? cluster.floorId : defaultFloorId;
      for (const agentId of cluster.agentIds) {
        const agent = filteredSnapshot.agents[agentId];
        if (!agent) continue;
        stats[fid].total += 1;
        if (agent.status !== 'idle') {
          stats[fid].active += 1;
        }
      }
    }
    return stats;
  }, [floors, filteredSnapshot.clusters, filteredSnapshot.agents]);

  const allAgentsList = Object.values(filteredSnapshot.agents);
  const activeCount = allAgentsList.filter((a) => a.status !== 'idle').length;
  const selectedAgent = selectedAgentId ? snapshot.agents[selectedAgentId] ?? null : null;
  const selectedCluster = selectedAgent
    ? snapshot.clusters.find((c) => c.rootId === selectedAgent.rootId) ?? null
    : null;

  const handleSelectFloor = (floorIdx: number | null) => {
    setFocusedFloorIndex(floorIdx);
    setFloorFocusNonce((n) => n + 1);
  };

  const handleSelectAgent = (id: string | null) => {
    setSelectedAgentId(id);
    if (id) {
      setFocusAgentId(id);
      setFocusNonce((n) => n + 1);
    }
  };

  const handleFocusAgent = (id: string) => {
    setSelectedAgentId(id);
    setFocusAgentId(id);
    setFocusNonce((n) => n + 1);
  };

  const handleAddFloor = async () => {
    const created = await addFloor();
    if (created) {
      setFocusedFloorIndex(created.index);
      setFloorFocusNonce((n) => n + 1);
    }
  };

  const handleDeleteFloor = async (floorId: string) => {
    const deleting = floors.find((f) => f.id === floorId);
    await deleteFloor(floorId);
    if (deleting && effectiveFocusedFloor !== null && effectiveFocusedFloor >= deleting.index) {
      setFocusedFloorIndex(null);
      setFloorFocusNonce((n) => n + 1);
    }
  };

  const handleMoveTeamFloor = async (rootId: string, floorId: string) => {
    await moveTeamFloor(rootId, floorId);
    const targetFloor = floors.find((f) => f.id === floorId);
    if (targetFloor && effectiveFocusedFloor !== null && effectiveFocusedFloor !== targetFloor.index) {
      setFocusedFloorIndex(targetFloor.index);
      setFloorFocusNonce((n) => n + 1);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f4ede4]">
      <OfficeCanvas
        snapshot={filteredSnapshot}
        selectedAgentId={selectedAgentId}
        showLabels={showLabels}
        focusedFloorIndex={effectiveFocusedFloor}
        floorFocusNonce={floorFocusNonce}
        focusAgentId={focusAgentId}
        focusNonce={focusNonce}
        resetNonce={resetNonce}
        onSelectAgent={handleSelectAgent}
        onFocusFloor={(idx) => handleSelectFloor(idx)}
      />

      <TopBar
        activeCount={activeCount}
        totalCount={allAgentsList.length}
        connected={connected}
        hookActive={snapshot.hookActive}
        demoMode={snapshot.demoMode}
        projects={projects}
        selectedProject={effectiveProject}
        recency={recency}
        showLabels={showLabels}
        hideFinished={hideFinished}
        onSelectProject={setSelectedProject}
        onChangeRecency={setRecency}
        onToggleLabels={() => setShowLabels((v) => !v)}
        onToggleHideFinished={() => setHideFinished((v) => !v)}
        onToggleDemo={() => {
          setFocusedFloorIndex(null);
          setFloorFocusNonce((n) => n + 1);
          void toggleDemo(!snapshot.demoMode);
        }}
        onResetCamera={() => {
          setFocusAgentId(null);
          setResetNonce((n) => n + 1);
        }}
      />

      <FloorElevator
        floors={floors}
        focusedFloorIndex={effectiveFocusedFloor}
        floorStats={floorStats}
        onSelectFloor={handleSelectFloor}
        onAddFloor={() => void handleAddFloor()}
        onRenameFloor={(id, name) => void renameFloor(id, name)}
        onDeleteFloor={(id) => void handleDeleteFloor(id)}
      />

      <InspectorDrawer
        agent={selectedAgent}
        allAgents={snapshot.agents}
        floors={floors}
        currentFloorId={selectedCluster?.floorId}
        onClose={() => setSelectedAgentId(null)}
        onFocusAgent={handleFocusAgent}
        onRenameAgent={(id, name) => void renameAgent(id, name)}
        onMoveTeamFloor={(rootId, floorId) => void handleMoveTeamFloor(rootId, floorId)}
      />

      {/* Cozy empty-state card when no recent Antigravity sessions are visible */}
      {filteredSnapshot.clusters.length === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md flex-col items-center gap-2.5 rounded-3xl border border-stone-200/90 bg-white/92 px-6 py-4 text-center shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>Kantor lagi sepi nih</span>
            </div>
            <p className="text-xs text-stone-500">
              Mulai chat dengan agent di Antigravity — mejanya akan langsung muncul di sini. Atau
              coba lihat gedung kantor bertingkatnya dulu pakai Mode Simulasi.
            </p>
            <button
              type="button"
              onClick={() => void toggleDemo(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-700"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span>Coba Mode Simulasi</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default App;
