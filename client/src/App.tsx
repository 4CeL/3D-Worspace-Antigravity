import React, { useMemo, useState } from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';
import type { OfficeSnapshot } from '@office/shared';
import { useOfficeSocket } from './hooks/useOfficeSocket';
import { OfficeCanvas } from './scene/OfficeCanvas';
import { TopBar } from './ui/TopBar';
import { InspectorDrawer } from './ui/InspectorDrawer';

export const App: React.FC = () => {
  const { snapshot, connected, recency, setRecency, toggleDemo } = useOfficeSocket();
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [showLabels, setShowLabels] = useState(true);
  const [hideFinished, setHideFinished] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const projects = useMemo(() => {
    const names = new Set<string>();
    for (const c of snapshot.clusters) {
      names.add(c.projectName);
    }
    return Array.from(names).sort();
  }, [snapshot.clusters]);

  const filteredSnapshot = useMemo<OfficeSnapshot>(() => {
    const clusters = snapshot.clusters
      .filter((c) => selectedProject === 'ALL' || c.projectName === selectedProject)
      .map((c) => {
        if (!hideFinished) return c;
        const activeIds = c.agentIds.filter((id) => snapshot.agents[id]?.status !== 'idle');
        return { ...c, agentIds: activeIds };
      })
      .filter((c) => c.agentIds.length > 0);

    const visibleIds = new Set(clusters.flatMap((c) => c.agentIds));
    const agents: OfficeSnapshot['agents'] = {};
    for (const id of visibleIds) {
      if (snapshot.agents[id]) {
        agents[id] = snapshot.agents[id];
      }
    }

    return {
      ...snapshot,
      clusters,
      agents,
      activePulses: snapshot.activePulses.filter(
        (p) => visibleIds.has(p.fromAgentId) && visibleIds.has(p.toAgentId),
      ),
    };
  }, [snapshot, selectedProject, hideFinished]);

  const allAgentsList = Object.values(filteredSnapshot.agents);
  const activeCount = allAgentsList.filter((a) => a.status !== 'idle').length;
  const selectedAgent = selectedAgentId ? snapshot.agents[selectedAgentId] ?? null : null;

  const handleSelectAgent = (id: string | null) => {
    setSelectedAgentId(id);
    if (id) setFocusAgentId(id);
  };

  const handleFocusAgent = (id: string) => {
    setSelectedAgentId(id);
    setFocusAgentId(id);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f4ede4]">
      <OfficeCanvas
        snapshot={filteredSnapshot}
        selectedAgentId={selectedAgentId}
        showLabels={showLabels}
        focusAgentId={focusAgentId}
        resetNonce={resetNonce}
        onSelectAgent={handleSelectAgent}
      />

      <TopBar
        activeCount={activeCount}
        totalCount={allAgentsList.length}
        connected={connected}
        hookActive={snapshot.hookActive}
        demoMode={snapshot.demoMode}
        projects={projects}
        selectedProject={selectedProject}
        recency={recency}
        showLabels={showLabels}
        hideFinished={hideFinished}
        onSelectProject={setSelectedProject}
        onChangeRecency={setRecency}
        onToggleLabels={() => setShowLabels((v) => !v)}
        onToggleHideFinished={() => setHideFinished((v) => !v)}
        onToggleDemo={() => void toggleDemo(!snapshot.demoMode)}
        onResetCamera={() => {
          setFocusAgentId(null);
          setResetNonce((n) => n + 1);
        }}
      />

      <InspectorDrawer
        agent={selectedAgent}
        allAgents={snapshot.agents}
        onClose={() => setSelectedAgentId(null)}
        onFocusAgent={handleFocusAgent}
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
              coba lihat suasana kantornya dulu pakai Mode Simulasi.
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
