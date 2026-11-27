import React, { useMemo, useState } from 'react';
import { Eye, FlaskConical, Sparkles } from 'lucide-react';
import { useOfficeSocket } from './hooks/useOfficeSocket';
import { OfficeCanvas } from './scene/OfficeCanvas';
import {
  computeRoomFocusPose,
  type ClusterPlacement,
  type RoomFocusPose,
} from './scene/officeLayout';
import { TopBar } from './ui/TopBar';
import { InspectorDrawer } from './ui/InspectorDrawer';
import { FloorElevator } from './ui/FloorElevator';
import { ApprovalAlerts } from './ui/ApprovalAlerts';
import { filterSnapshotForView } from './ui/filterSnapshot';

export const App: React.FC = () => {
  const {
    snapshot,
    connected,
    recency,
    setRecency,
    toggleDemo,
    renameAgent,
    renameRoom,
    hideAgent,
    unhideAllAgents,
    addFloor,
    renameFloor,
    deleteFloor,
    setFloorTheme,
    moveTeamFloor,
  } = useOfficeSocket();

  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [showLabels, setShowLabels] = useState(true);
  const [hideFinished, setHideFinished] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [roomFocusPose, setRoomFocusPose] = useState<RoomFocusPose | null>(null);
  const [roomFocusNonce, setRoomFocusNonce] = useState(0);
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

  const allAgentsList = useMemo(
    () => Object.values(filteredSnapshot.agents),
    [filteredSnapshot.agents],
  );
  const unfilteredAgentsList = useMemo(
    () => Object.values(snapshot.agents),
    [snapshot.agents],
  );
  const activeCount = allAgentsList.filter((a) => a.status !== 'idle').length;
  const pendingAgents = useMemo(
    () =>
      unfilteredAgentsList
        .filter((a) => Boolean(a.pendingApproval))
        .sort(
          (a, b) =>
            (a.pendingApproval?.startedAt ?? 0) - (b.pendingApproval?.startedAt ?? 0),
        ),
    [unfilteredAgentsList],
  );
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
    // Ensure the agent's project & floor are visible if user is filtered on another project or floor
    const cluster = snapshot.clusters.find((c) => c.agentIds.includes(id));
    if (cluster) {
      if (effectiveProject !== 'ALL' && cluster.projectName !== effectiveProject) {
        setSelectedProject('ALL');
      }
      if (effectiveFocusedFloor !== null) {
        const targetFloor = floors.find((f) => f.id === cluster.floorId);
        if (targetFloor && effectiveFocusedFloor !== targetFloor.index) {
          setFocusedFloorIndex(targetFloor.index);
        }
      }
    }
    setSelectedAgentId(id);
    setFocusAgentId(id);
    setFocusNonce((n) => n + 1);
  };

  const handleFocusRoom = (cluster: ClusterPlacement) => {
    // Cutaway hide floors above this room's floor WITHOUT bumping floorFocusNonce
    const targetFloor = floors.find((f) => f.id === cluster.floorId);
    if (targetFloor) {
      setFocusedFloorIndex(targetFloor.index);
    }
    setRoomFocusPose(computeRoomFocusPose(cluster.center));
    setRoomFocusNonce((n) => n + 1);
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

  const handleHideAgent = async (agentId: string) => {
    if (selectedAgentId === agentId) {
      setSelectedAgentId(null);
      setFocusAgentId(null);
    }
    await hideAgent(agentId);
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
        roomFocusPose={roomFocusPose}
        roomFocusNonce={roomFocusNonce}
        resetNonce={resetNonce}
        onSelectAgent={handleSelectAgent}
        onFocusFloor={(idx) => handleSelectFloor(idx)}
        onFocusRoom={handleFocusRoom}
        onRenameRoom={(rootId, name) => void renameRoom(rootId, name)}
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
        hiddenCount={snapshot.hiddenCount ?? 0}
        pendingCount={pendingAgents.length}
        onSelectProject={setSelectedProject}
        onChangeRecency={setRecency}
        onToggleLabels={() => setShowLabels((v) => !v)}
        onToggleHideFinished={() => setHideFinished((v) => !v)}
        onUnhideAll={() => void unhideAllAgents()}
        onFocusPending={() => {
          if (pendingAgents[0]) {
            handleFocusAgent(pendingAgents[0].id);
          }
        }}
        onToggleDemo={() => {
          setFocusedFloorIndex(null);
          setRoomFocusPose(null);
          setFloorFocusNonce((n) => n + 1);
          void toggleDemo(!snapshot.demoMode);
        }}
        onResetCamera={() => {
          setFocusAgentId(null);
          setRoomFocusPose(null);
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
        onChangeFloorTheme={(id, theme) => void setFloorTheme(id, theme)}
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
        onHideAgent={(id) => void handleHideAgent(id)}
      />

      <ApprovalAlerts agents={unfilteredAgentsList} onFocusAgent={handleFocusAgent} />

      {/* Cozy empty-state card when no recent Antigravity sessions are visible */}
      {filteredSnapshot.clusters.length === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md flex-col items-center gap-2.5 rounded-3xl border border-stone-200/90 bg-white/92 px-6 py-4 text-center shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>Kantor lagi sepi nih</span>
            </div>
            <p className="text-xs text-stone-500">
              {(snapshot.hiddenCount ?? 0) > 0
                ? `Ada ${snapshot.hiddenCount} meja yang sedang disembunyikan. Pulihkan untuk menampilkannya kembali di kantor.`
                : 'Mulai chat dengan agent di Antigravity — mejanya akan langsung muncul di sini. Atau coba lihat gedung kantor bertingkatnya dulu pakai Mode Simulasi.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(snapshot.hiddenCount ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => void unhideAllAgents()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 shadow-xs transition hover:bg-amber-100"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Pulihkan {snapshot.hiddenCount} Meja</span>
                </button>
              )}
              {!snapshot.demoMode && (
                <button
                  type="button"
                  onClick={() => void toggleDemo(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-700"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span>Coba Mode Simulasi</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default App;
