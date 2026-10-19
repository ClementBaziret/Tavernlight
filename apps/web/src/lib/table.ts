import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { CommandResult, GmTableState, PlayerTableState, TableAnnouncement, TableCommands, TableView } from "@tavernlight/shared";
import { announce } from "./announce";

type StateFor<V extends TableView> = V extends "gm" ? GmTableState : PlayerTableState;

export interface TableConnection<V extends TableView> {
  state: StateFor<V> | null;
  connected: boolean;
  error: string | null;
  /** Round-trip time of the last ping, in ms. */
  latency: number | null;
  /** Time between the server building the last snapshot and its reception, in ms. */
  syncDelay: number | null;
  command: <K extends keyof TableCommands>(name: K, payload: TableCommands[K]) => Promise<unknown>;
}

/**
 * Connects to the real-time table of a campaign. The server sends a full,
 * already filtered snapshot after every change.
 */
export function useTable<V extends TableView>(campaignId: string, view: V): TableConnection<V> {
  const [state, setState] = useState<StateFor<V> | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [syncDelay, setSyncDelay] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const clockOffset = useRef(0);

  useEffect(() => {
    const socket = io("/table", { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("table:join", { campaignId, view }, (r: CommandResult) => {
        if (!r.ok) setError(r.error);
        else setError(null);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("table:state", (s: StateFor<V>) => {
      setState(s);
      setSyncDelay(Math.max(0, Date.now() + clockOffset.current - s.perf.sentAt));
    });
    socket.on("table:announce", (a: TableAnnouncement) => announce(a.text));
    socket.on("table:error", (e: { message: string }) => setError(e.message));
    const ping = setInterval(() => {
      const at = Date.now();
      socket.emit("table:ping", { at }, (r: { at: number; serverAt: number }) => {
        const now = Date.now();
        setLatency(now - at);
        clockOffset.current = r.serverAt - (at + (now - at) / 2);
      });
    }, 5000);
    return () => {
      clearInterval(ping);
      socket.disconnect();
    };
  }, [campaignId, view]);

  const command = useCallback(<K extends keyof TableCommands>(name: K, payload: TableCommands[K]) => {
    return new Promise<unknown>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) return reject(new Error("Not connected"));
      socket.emit("table:command", { name, payload }, (r: CommandResult) => {
        if (r.ok) resolve(r.data);
        else reject(new Error(r.error));
      });
    });
  }, []);

  return { state, connected, error, latency, syncDelay, command };
}
