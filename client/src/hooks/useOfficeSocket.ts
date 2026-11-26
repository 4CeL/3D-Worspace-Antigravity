import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  OfficeSnapshot,
  RecencyWindow,
  ServerMessage,
} from '@office/shared';

const EMPTY_SNAPSHOT: OfficeSnapshot = {
  generatedAt: Date.now(),
  hookActive: false,
  lastHookAt: null,
  demoMode: false,
  floors: [{ id: 'floor-1', index: 1, name: 'Lantai 1' }],
  clusters: [],
  agents: {},
  activePulses: [],
};

export interface UseOfficeSocketResult {
  snapshot: OfficeSnapshot;
  connected: boolean;
  recency: RecencyWindow;
  setRecency: (next: RecencyWindow) => void;
  toggleDemo: (enabled: boolean) => Promise<void>;
  renameAgent: (agentId: string, name: string | null) => Promise<void>;
  addFloor: (name?: string) => Promise<{ id: string; index: number; name: string } | null>;
  renameFloor: (floorId: string, name: string) => Promise<void>;
  deleteFloor: (floorId: string) => Promise<void>;
  moveTeamFloor: (rootId: string, floorId: string) => Promise<void>;
}

export function useOfficeSocket(): UseOfficeSocketResult {
  const [snapshot, setSnapshot] = useState<OfficeSnapshot>(EMPTY_SNAPSHOT);
  const [connected, setConnected] = useState(false);
  const [recency, setRecencyState] = useState<RecencyWindow>('30m');
  const recencyRef = useRef<RecencyWindow>('30m');
  const wsRef = useRef<WebSocket | null>(null);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const setRecency = useCallback(
    (next: RecencyWindow) => {
      recencyRef.current = next;
      setRecencyState(next);
      sendMessage({ type: 'set_recency', recency: next });
    },
    [sendMessage],
  );

  const toggleDemo = useCallback(async (enabled: boolean) => {
    try {
      await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      // ignore transient network errors; WS reconnect will sync
    }
  }, []);

  const renameAgent = useCallback(async (agentId: string, name: string | null) => {
    try {
      await fetch('/api/agent-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, name }),
      });
    } catch {
      // ignore transient network errors
    }
  }, []);

  const addFloor = useCallback(async (name?: string) => {
    try {
      const res = await fetch('/api/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { floor?: { id: string; index: number; name: string } };
      return body.floor ?? null;
    } catch {
      return null;
    }
  }, []);

  const renameFloor = useCallback(async (floorId: string, name: string) => {
    try {
      await fetch('/api/floors/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorId, name }),
      });
    } catch {
      // ignore transient network errors
    }
  }, []);

  const deleteFloor = useCallback(async (floorId: string) => {
    try {
      await fetch('/api/floors/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorId }),
      });
    } catch {
      // ignore transient network errors
    }
  }, []);

  const moveTeamFloor = useCallback(async (rootId: string, floorId: string) => {
    try {
      await fetch('/api/team-floor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId, floorId }),
      });
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        attempt = 0;
        setConnected(true);
        const sub: ClientMessage = { type: 'subscribe', recency: recencyRef.current };
        ws.send(JSON.stringify(sub));
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          if (msg.type === 'snapshot') {
            setSnapshot(msg.payload);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setConnected(false);
        wsRef.current = null;
        if (!closed) {
          const delay = Math.min(5000, 600 * Math.pow(1.6, attempt));
          attempt += 1;
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, []);

  return {
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
  };
}
