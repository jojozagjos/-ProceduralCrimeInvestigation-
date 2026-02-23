import seedrandom from 'seedrandom';
import { generateCase, generateInterviewResponse } from '../case/caseGenerator.js';
import { genId } from '../utils/helpers.js';
import { getLobby } from '../lobby/lobbyManager.js';
import type {
  GameState, LobbyInfo, BoardOp, BoardCard, BoardConnection,
  InterviewCategory, TimePhase, Evidence,
} from '../utils/types.js';
import { TIME_PHASES } from '../utils/types.js';

const games = new Map<string, GameState>();
const timePhaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

const TIME_PHASE_DURATION_MS = 120_000; // 2 minutes per phase

export function createGame(lobby: LobbyInfo): GameState {
  const seed = lobby.customSeed || `${lobby.lobbyId}-${Date.now()}`;
  const caseData = generateCase({
    seed,
    caseType: lobby.caseType,
    complexity: lobby.complexity,
    customCaseName: lobby.customCaseName,
    customVictimName: lobby.customVictimName,
    customSuspectNames: lobby.customSuspectNames,
  });

  const state: GameState = {
    phase: 'cinematic',
    timePhase: 'evening',
    timePhaseIndex: 0,
    caseData,
    board: { cards: [], connections: [] },
    discoveredEvidenceIds: [],
    discoveredTimelineIds: caseData.timeline.filter(t => t.discovered).map(t => t.id),
    interviewedSuspectIds: [],
    cinematicSkipVotes: [],
    currentInterviewSuspectId: undefined,
    interviewVotes: {},
    interviewLog: [],
    accusations: [],
    accusationVotes: {},
    accusationSubmitted: false,
    hintsUsed: 0,
    score: 1000,
    startedAt: Date.now(),
  };

  games.set(lobby.lobbyId, state);
  return state;
}

export function getGame(lobbyId: string): GameState | undefined {
  return games.get(lobbyId);
}

export function updateGame(lobbyId: string, updater: (state: GameState) => void): GameState | undefined {
  const state = games.get(lobbyId);
  if (!state) return undefined;
  updater(state);
  return state;
}

export function voteCinematicSkip(lobbyId: string, playerId: string, totalPlayers: number): { done: boolean; votes: string[] } {
  const state = games.get(lobbyId);
  if (!state) return { done: false, votes: [] };
  if (!state.cinematicSkipVotes.includes(playerId)) {
    state.cinematicSkipVotes.push(playerId);
  }
  const done = state.cinematicSkipVotes.length >= totalPlayers;
  if (done) {
    state.phase = 'investigation';
  }
  return { done, votes: state.cinematicSkipVotes };
}

export function endCinematic(lobbyId: string): GameState | undefined {
  return updateGame(lobbyId, s => { s.phase = 'investigation'; });
}

export function startTimeCompression(
  lobbyId: string,
  onPhaseChange: (lobbyId: string, phase: TimePhase, index: number) => void
): void {
  const state = games.get(lobbyId);
  if (!state) return;

  const advancePhase = () => {
    const s = games.get(lobbyId);
    if (!s || s.phase === 'results') {
      clearTimers(lobbyId);
      return;
    }

    if (s.timePhaseIndex < TIME_PHASES.length - 1) {
      s.timePhaseIndex++;
      s.timePhase = TIME_PHASES[s.timePhaseIndex];
      onPhaseChange(lobbyId, s.timePhase, s.timePhaseIndex);

      // Note: Timeline events are now discovered through manual investigation only,
      // not automatically when time advances. This allows players to strategically
      // investigate events in each phase rather than having all events revealed.

      if (s.timePhaseIndex < TIME_PHASES.length - 1) {
        timePhaseTimers.set(lobbyId, setTimeout(advancePhase, TIME_PHASE_DURATION_MS));
      }
    }
  };

  timePhaseTimers.set(lobbyId, setTimeout(advancePhase, TIME_PHASE_DURATION_MS));
}

function clearTimers(lobbyId: string) {
  const timer = timePhaseTimers.get(lobbyId);
  if (timer) {
    clearTimeout(timer);
    timePhaseTimers.delete(lobbyId);
  }
}

export function discoverEvidence(lobbyId: string, evidenceId: string, playerId: string): Evidence | undefined {
  const state = games.get(lobbyId);
  if (!state) return undefined;
  if (state.discoveredEvidenceIds.includes(evidenceId)) return undefined;

  const ev = state.caseData.evidence.find(e => e.id === evidenceId);
  if (!ev) return undefined;

  state.discoveredEvidenceIds.push(evidenceId);
  ev.discoveredBy = playerId;
  return ev;
}

export function requestInterview(lobbyId: string, suspectId: string): boolean {
  const state = games.get(lobbyId);
  if (!state) return false;
  if (state.phase !== 'investigation') return false;

  state.currentInterviewSuspectId = suspectId;
  state.interviewVotes = {};
  return true;
}

export function voteInterview(lobbyId: string, playerId: string, vote: boolean, totalPlayers: number): { passed: boolean; allVoted: boolean; votes: Record<string, boolean> } {
  const state = games.get(lobbyId);
  if (!state) return { passed: false, allVoted: false, votes: {} };

  state.interviewVotes[playerId] = vote;
  const voteValues = Object.values(state.interviewVotes);
  const allVoted = voteValues.length >= totalPlayers;

  if (allVoted) {
    const passed = voteValues.every(v => v);
    if (passed) {
      state.phase = 'interview';
      if (state.currentInterviewSuspectId) {
        state.interviewedSuspectIds.push(state.currentInterviewSuspectId);
      }
    } else {
      state.currentInterviewSuspectId = undefined;
      state.interviewVotes = {};
    }
    return { passed, allVoted: true, votes: state.interviewVotes };
  }

  return { passed: false, allVoted: false, votes: state.interviewVotes };
}

export function conductInterview(
  lobbyId: string,
  category: InterviewCategory,
  evidenceId?: string
): { question: string; answer: string } | undefined {
  const state = games.get(lobbyId);
  if (!state || !state.currentInterviewSuspectId) return undefined;

  const suspect = state.caseData.suspects.find(s => s.id === state.currentInterviewSuspectId);
  if (!suspect) return undefined;

  const rng = seedrandom(`${lobbyId}-${state.interviewLog.length}`);
  const answer = generateInterviewResponse(suspect, category, state.caseData, evidenceId, rng);

  const questionText = category === 'explain_evidence' && evidenceId
    ? `Explain this evidence: ${state.caseData.evidence.find(e => e.id === evidenceId)?.title || 'unknown'}`
    : category === 'whereabouts'
      ? `Where were you during the ${state.timePhase}?`
      : category === 'alibi' ? 'Can you tell us about your alibi?'
        : category === 'relationship' ? `What was your relationship with ${state.caseData.victimName}?`
          : category === 'conflicts' ? 'Were there any recent conflicts?'
            : 'Tell us about your financial situation.';

  const entry = { question: questionText, answer, category };
  state.interviewLog.push(entry);
  return { question: questionText, answer };
}

export function endInterview(lobbyId: string): void {
  updateGame(lobbyId, s => {
    s.phase = 'investigation';
    s.currentInterviewSuspectId = undefined;
    s.interviewVotes = {};
  });
}

export function applyBoardOp(lobbyId: string, op: BoardOp): BoardOp | undefined {
  const state = games.get(lobbyId);
  if (!state) return undefined;

  switch (op.type) {
    case 'add_card':
      state.board.cards.push(op.card);
      break;
    case 'move_card': {
      const card = state.board.cards.find(c => c.id === op.cardId);
      if (card) { card.x = op.x; card.y = op.y; }
      break;
    }
    case 'update_card': {
      const card = state.board.cards.find(c => c.id === op.cardId);
      if (card) {
        card.content = op.content;
        if (op.title) card.title = op.title;
        if (op.tag) card.tag = op.tag;
        if (op.imageUrl !== undefined) card.imageUrl = op.imageUrl || undefined;
        if (op.noteColor !== undefined) card.noteColor = op.noteColor || undefined;
        if (op.textItems !== undefined) card.textItems = op.textItems || undefined;
        if (op.imageItems !== undefined) card.imageItems = op.imageItems || undefined;
      }
      break;
    }
    case 'remove_card':
      state.board.cards = state.board.cards.filter(c => c.id !== op.cardId);
      state.board.connections = state.board.connections.filter(
        conn => conn.fromCardId !== op.cardId && conn.toCardId !== op.cardId
      );
      break;
    case 'add_connection':
      if (!state.board.connections.some(c =>
        (c.fromCardId === op.connection.fromCardId && c.toCardId === op.connection.toCardId)
        || (c.fromCardId === op.connection.toCardId && c.toCardId === op.connection.fromCardId)
      )) {
        state.board.connections.push(op.connection);
      } else {
        return undefined;
      }
      break;
    case 'remove_connection':
      state.board.connections = state.board.connections.filter(c => c.id !== op.connectionId);
      break;
    case 'add_tape':
      if (!state.board.tapes) state.board.tapes = [];
      state.board.tapes.push(op.tape);
      break;
    case 'move_tape':
      if (state.board.tapes) {
        const tape = state.board.tapes.find(t => t.id === op.tapeId);
        if (tape) {
          tape.x = op.x;
          tape.y = op.y;
        }
      }
      break;
    case 'remove_tape':
      if (state.board.tapes) {
        state.board.tapes = state.board.tapes.filter(t => t.id !== op.tapeId);
      }
      break;
    case 'update_tape': {
      if (state.board.tapes) {
        const tape = state.board.tapes.find(t => t.id === op.tapeId);
        if (tape) {
          if (op.textItems !== undefined) tape.textItems = op.textItems;
          if (op.drawingStrokes !== undefined) tape.drawingStrokes = op.drawingStrokes;
        }
      }
      break;
    }
    case 'draw_tape_stroke': {
      if (state.board.tapes) {
        const tape = state.board.tapes.find(t => t.id === op.tapeId);
        if (tape) {
          if (!tape.drawingStrokes) tape.drawingStrokes = [];
          tape.drawingStrokes.push(op.stroke);
        }
      }
      break;
    }
    case 'erase_tape_strokes': {
      if (state.board.tapes) {
        const tape = state.board.tapes.find(t => t.id === op.tapeId);
        if (tape) tape.drawingStrokes = [];
      }
      break;
    }
    case 'lock_card': {
      const card = state.board.cards.find(c => c.id === op.cardId);
      if (card) card.lockedBy = op.playerId;
      break;
    }
    case 'unlock_card': {
      const card = state.board.cards.find(c => c.id === op.cardId);
      if (card) card.lockedBy = undefined;
      break;
    }
    case 'draw_stroke': {
      const card = state.board.cards.find(c => c.id === op.cardId);
      if (card) {
        if (!card.drawingStrokes) card.drawingStrokes = [];
        card.drawingStrokes.push(op.stroke);
      }
      break;
    }
    case 'erase_strokes': {
      const card = state.board.cards.find(c => c.id === op.cardId);
      if (card) card.drawingStrokes = [];
      break;
    }
    case 'undo':
    case 'redo':
      // Undo/redo are handled client-side with local history
      break;
  }

  return op;
}

export function submitAccusation(
  lobbyId: string,
  playerId: string,
  suspectId: string,
  motive: string,
  method: string,
  evidenceIds: string[],
): { votesNeeded: number; votesReceived: number } | undefined {
  const state = games.get(lobbyId);
  if (!state || state.accusationSubmitted) return undefined;

  // Store player's vote
  state.accusationVotes[playerId] = { suspectId, motive, method, evidenceIds };

  const lobby = getLobby(lobbyId);
  if (!lobby) return undefined;

  const totalPlayers = lobby.players.length;
  const votesReceived = Object.keys(state.accusationVotes).length;

  return { votesNeeded: totalPlayers, votesReceived };
}

export function checkAccusationResults(
  lobbyId: string,
): { correct: boolean; score: number; culpritId: string; playerVotes: Record<string, { suspectId: string; correct: boolean }> } | undefined {
  const state = games.get(lobbyId);
  if (!state || state.accusationSubmitted) return undefined;

  const lobby = getLobby(lobbyId);
  if (!lobby) return undefined;

  // Check if all players have voted
  const totalPlayers = lobby.players.length;
  const votesReceived = Object.keys(state.accusationVotes).length;
  if (votesReceived < totalPlayers) return undefined;

  // Determine consensus (most voted suspect)
  const voteCounts: Record<string, number> = {};
  for (const vote of Object.values(state.accusationVotes)) {
    voteCounts[vote.suspectId] = (voteCounts[vote.suspectId] || 0) + 1;
  }

  const consensusSuspectId = Object.entries(voteCounts).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const correct = consensusSuspectId === state.caseData.solution.culpritId;

  // Build player vote results
  const playerVotes: Record<string, { suspectId: string; correct: boolean }> = {};
  for (const [playerId, vote] of Object.entries(state.accusationVotes)) {
    playerVotes[playerId] = {
      suspectId: vote.suspectId,
      correct: vote.suspectId === state.caseData.solution.culpritId,
    };
  }

  // Update game state
  state.accusationSubmitted = true;
  state.phase = 'results';
  clearTimers(lobbyId);

  return {
    correct,
    score: state.score,
    culpritId: state.caseData.solution.culpritId,
    playerVotes,
  };
}

export function removeGame(lobbyId: string): void {
  games.delete(lobbyId);
  clearTimers(lobbyId);
}
