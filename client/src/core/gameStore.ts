// ─── Game Store ──────────────────────────────────────────────────────────────
// Central client-side state for the active game session.

import type { GameState, BoardState, TimelineEvent, TimePhase, BoardOp } from '../utils/types.js';

type Listener = () => void;

class GameStore {
  private state: GameState | null = null;
  private lobbyId = '';
  private playerId = '';
  private listeners: Listener[] = [];

  setState(gs: GameState): void {
    this.state = gs;
    this.notify();
  }

  getState(): GameState | null {
    return this.state;
  }

  setLobbyId(id: string): void { this.lobbyId = id; }
  getLobbyId(): string { return this.lobbyId; }
  setPlayerId(id: string): void { this.playerId = id; }
  getPlayerId(): string { return this.playerId; }

  updatePhase(phase: GameState['phase']): void {
    if (this.state) { this.state.phase = phase; this.notify(); }
  }

  updateTimePhase(phase: TimePhase, index: number): void {
    if (this.state) { this.state.timePhase = phase; this.state.timePhaseIndex = index; this.notify(); }
  }

  updateBoard(board: BoardState): void {
    if (this.state) { this.state.board = board; this.notify(); }
  }

  applyBoardOp(op: BoardOp): void {
    if (!this.state) return;
    const b = this.state.board;
    switch (op.type) {
      case 'add_card': b.cards.push(op.card); break;
      case 'move_card': {
        const c = b.cards.find(c => c.id === op.cardId);
        if (c) { c.x = op.x; c.y = op.y; }
        break;
      }
      case 'update_card': {
        const c = b.cards.find(c => c.id === op.cardId);
        if (c) {
          c.content = op.content;
          if (op.title) c.title = op.title;
          if (op.tag) c.tag = op.tag;
          if (op.imageUrl !== undefined) c.imageUrl = op.imageUrl || undefined;
          if (op.noteColor !== undefined) c.noteColor = op.noteColor || undefined;
          if (op.textItems !== undefined) c.textItems = op.textItems || undefined;
          if (op.imageItems !== undefined) c.imageItems = op.imageItems || undefined;
        }
        break;
      }
      case 'remove_card':
        b.cards = b.cards.filter(c => c.id !== op.cardId);
        b.connections = b.connections.filter(c => c.fromCardId !== op.cardId && c.toCardId !== op.cardId);
        break;
      case 'add_connection': b.connections.push(op.connection); break;
      case 'remove_connection': b.connections = b.connections.filter(c => c.id !== op.connectionId); break;
      case 'lock_card': {
        const c = b.cards.find(c => c.id === op.cardId);
        if (c) c.lockedBy = op.playerId;
        break;
      }
      case 'unlock_card': {
        const c = b.cards.find(c => c.id === op.cardId);
        if (c) c.lockedBy = undefined;
        break;
      }
      case 'draw_stroke': {
        const c = b.cards.find(c => c.id === op.cardId);
        if (c) { if (!c.drawingStrokes) c.drawingStrokes = []; c.drawingStrokes.push(op.stroke); }
        break;
      }
      case 'erase_strokes': {
        const c = b.cards.find(c => c.id === op.cardId);
        if (c) c.drawingStrokes = [];
        break;
      }
    }
    this.notify();
  }

  updateTimeline(timeline: TimelineEvent[], discoveredIds: string[]): void {
    if (this.state) {
      this.state.caseData.timeline = timeline;
      this.state.discoveredTimelineIds = discoveredIds;
      this.notify();
    }
  }

  discoverEvidence(evidenceId: string): void {
    if (this.state && !this.state.discoveredEvidenceIds.includes(evidenceId)) {
      this.state.discoveredEvidenceIds.push(evidenceId);
      this.notify();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  clear(): void {
    this.state = null;
    this.lobbyId = '';
    this.playerId = '';
    this.listeners = [];
  }
}

export const gameStore = new GameStore();
