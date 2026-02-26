// ─── Network Client ──────────────────────────────────────────────────────────

import type { ServerMessage, BoardOp, InterviewCategory, EvidenceTag } from '../utils/types.js';

type MessageHandler = (msg: ServerMessage) => void;

// Dynamically construct URLs based on environment
function getWsUrl(): string {
  if ((import.meta as any).env?.VITE_WS_URL) {
    return (import.meta as any).env.VITE_WS_URL;
  }
  
  // Localhost development: connect to port 4000
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:4000';
  }
  
  // Production: convert https to wss, use current host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
}

function getApiUrl(): string {
  if ((import.meta as any).env?.VITE_API_URL) {
    return (import.meta as any).env.VITE_API_URL;
  }
  
  // Localhost development: use port 4000
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  
  // Production: use current origin
  return window.location.origin;
}

const WS_URL = getWsUrl();
const API_URL = getApiUrl();

let ws: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;

export function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    intentionalClose = false;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      reject(e);
      return;
    }

    ws.onopen = () => {
      console.log('[WS] Connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      resolve();
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        for (const h of handlers) h(msg);
      } catch (e) {
        console.error('[WS] Parse error', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      ws = null;
      if (!intentionalClose) {
        for (const h of handlers) {
          h({ type: 'error', data: { message: 'Disconnected from server.' } });
        }
      }
    };

    ws.onerror = () => {
      reject(new Error('WebSocket connection failed'));
    };
  });
}

export function disconnect(): void {
  intentionalClose = true;
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter(h => h !== handler);
  };
}

export function clearHandlers(): void {
  handlers = [];
}

function sendRaw(data: any): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export { sendRaw };

// ─── API calls ───────────────────────────────────────────────────────────────

export function sendPing(): void {
  sendRaw({ type: 'ping' });
}

export function createLobby(data: {
  hostDisplayName: string;
  isPrivate: boolean;
  maxPlayers: number;
  caseType: string;
  complexity: string;
  enableHints: boolean;
  timeCompression: boolean;
  customSeed?: string;
  customCaseName?: string;
  customVictimName?: string;
  customSuspectNames?: string;
}): void {
  sendRaw({ type: 'lobby:create', data });
}

export function joinLobby(lobbyId: string, displayName: string, privateCode?: string): void {
  sendRaw({ type: 'lobby:join', data: { lobbyId, displayName, privateCode } });
}

export function leaveLobby(lobbyId: string): void {
  sendRaw({ type: 'lobby:leave', data: { lobbyId } });
}

export function startGame(lobbyId: string): void {
  sendRaw({ type: 'lobby:start', data: { lobbyId } });
}

export function sendChat(lobbyId: string, text: string): void {
  sendRaw({ type: 'chat:send', data: { lobbyId, text } });
}

export function voteCinematicSkip(lobbyId: string): void {
  sendRaw({ type: 'cinematic:vote_skip', data: { lobbyId } });
}

export function requestInterview(lobbyId: string, suspectId: string): void {
  sendRaw({ type: 'interview:request', data: { lobbyId, suspectId } });
}

export function voteInterview(lobbyId: string, vote: boolean): void {
  sendRaw({ type: 'interview:vote', data: { lobbyId, vote } });
}

export function sendInterviewAnswer(lobbyId: string, category: InterviewCategory, evidenceId?: string): void {
  sendRaw({ type: 'interview:answer', data: { lobbyId, category, evidenceId } });
}

export function endInterview(lobbyId: string): void {
  sendRaw({ type: 'interview:end', data: { lobbyId } });
}

export function voteInterviewLeave(lobbyId: string, vote: boolean): void {
  sendRaw({ type: 'interview:leave_vote', data: { lobbyId, vote } });
}

export function discoverEvidence(lobbyId: string, evidenceId: string): void {
  sendRaw({ type: 'evidence:discover', data: { lobbyId, evidenceId } });
}

export function sendTimelineOp(lobbyId: string, eventId: string): void {
  sendRaw({ type: 'timeline:op', data: { lobbyId, op: 'discover', eventId } });
}

export function sendBoardOp(lobbyId: string, op: BoardOp): void {
  sendRaw({ type: 'board:op', data: { lobbyId, op } });
}

export function submitAccusation(lobbyId: string, suspectId: string, motive: string, method: string, evidenceIds: string[]): void {
  sendRaw({ type: 'accusation:submit', data: { lobbyId, accusation: { suspectId, motive, method, evidenceIds } } });
}

export function initiateAccusation(lobbyId: string): void {
  sendRaw({ type: 'accusation:open', data: { lobbyId } });
}

export function updateAccusationDraft(lobbyId: string, draft: { suspectId: string; motive: string; method: string; evidenceIds: string[] }): void {
  sendRaw({ type: 'accusation:update_draft', data: { lobbyId, draft } });
}

export function voteOnAccusation(lobbyId: string, vote: 'submit' | 'cancel' | null): void {
  sendRaw({ type: 'accusation:vote_final', data: { lobbyId, vote } });
}

export function cancelAccusationVote(lobbyId: string): void {
  sendRaw({ type: 'accusation:cancel', data: { lobbyId } });
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

export async function fetchLobbies(): Promise<any[]> {
  try {
    const res = await fetch(`${API_URL}/api/lobbies`);
    const data = await res.json();
    return data.lobbies || [];
  } catch {
    return [];
  }
}

export async function fetchDailySeed(): Promise<{ seed: string; date: string } | null> {
  try {
    const res = await fetch(`${API_URL}/api/daily-seed`);
    return await res.json();
  } catch {
    return null;
  }
}
