// ─── Shared Protocol Types ───────────────────────────────────────────────────
import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type CaseType = 'random' | 'murder' | 'theft' | 'blackmail' | 'kidnapping' | 'arson';
export const CASE_TYPES: CaseType[] = ['random', 'murder', 'theft', 'blackmail', 'kidnapping', 'arson'];

export type Complexity = 'simple' | 'standard' | 'complex';
export const COMPLEXITIES: Complexity[] = ['simple', 'standard', 'complex'];

export type LobbyStatus = 'waiting' | 'in_game';

export type TimePhase = 'evening' | 'late_night' | 'early_morning';
export const TIME_PHASES: TimePhase[] = ['evening', 'late_night', 'early_morning'];

export type EvidenceReliability = 'high' | 'medium' | 'low';
export type EvidenceSourceType = 'forensic' | 'witness' | 'digital' | 'rumor';
export type EvidenceTag = 'motive' | 'means' | 'opportunity' | 'alibi' | 'red_herring';

export type InterviewCategory =
  | 'alibi'
  | 'relationship'
  | 'conflicts'
  | 'financial'
  | 'whereabouts'
  | 'explain_evidence';

export const INTERVIEW_CATEGORIES: { id: InterviewCategory; label: string }[] = [
  { id: 'alibi', label: 'Alibi' },
  { id: 'relationship', label: 'Relationship to victim' },
  { id: 'conflicts', label: 'Recent conflicts' },
  { id: 'financial', label: 'Financial motive' },
  { id: 'whereabouts', label: 'Where were you at [time phase]?' },
  { id: 'explain_evidence', label: 'Explain this evidence' },
];

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const LobbyCreateSchema = z.object({
  hostDisplayName: z.string().min(1).max(30),
  isPrivate: z.boolean().default(false),
  maxPlayers: z.number().int().min(1).max(4).default(4),
  caseType: z.enum(['random', 'murder', 'theft', 'blackmail', 'kidnapping', 'arson']).default('random'),
  complexity: z.enum(['simple', 'standard', 'complex']).default('standard'),
  enableHints: z.boolean().default(false),
  timeCompression: z.boolean().default(true),
  customSeed: z.string().max(100).optional(),
  customCaseName: z.string().max(100).optional(),
  customVictimName: z.string().max(60).optional(),
  customSuspectNames: z.string().max(300).optional(),
});

export const LobbyJoinSchema = z.object({
  lobbyId: z.string(),
  displayName: z.string().min(1).max(30),
  privateCode: z.string().optional(),
});

export const ChatSendSchema = z.object({
  lobbyId: z.string(),
  text: z.string().min(1).max(250),
});

export const AccusationSchema = z.object({
  suspectId: z.string(),
  motive: z.string(),
  method: z.string(),
  evidenceIds: z.array(z.string()),
});

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  displayName: string;
  connected: boolean;
}

export interface LobbyInfo {
  lobbyId: string;
  hostDisplayName: string;
  hostId: string;
  playersCurrent: number;
  playersMax: number;
  status: LobbyStatus;
  caseType: CaseType;
  complexity: Complexity;
  isPrivate: boolean;
  privateCode?: string;
  enableHints: boolean;
  timeCompression: boolean;
  customSeed?: string;
  customCaseName?: string;
  customVictimName?: string;
  customSuspectNames?: string;
  createdAt: number;
  version: string;
  players: Player[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  system: boolean;
  timestamp: number;
}

export interface Suspect {
  id: string;
  name: string;
  age: number;
  occupation: string;
  relationship: string;
  personality: string;
  isGuilty: boolean;
  alibi: string;
  alibiPhase: TimePhase;
  motive: string;
  avatarUrl: string;
}

export interface Evidence {
  id: string;
  title: string;
  description: string;
  reliability: EvidenceReliability;
  sourceType: EvidenceSourceType;
  confidenceScore: number;
  tag?: EvidenceTag;
  discoveredBy?: string;
  timePhase: TimePhase;
  linkedSuspectId?: string;
  isRedHerring: boolean;
}

export interface TimelineEvent {
  id: string;
  time: string;
  phase: TimePhase;
  description: string;
  relatedSuspectIds: string[];
  relatedEvidenceIds: string[];
  discovered: boolean;
  order: number;
}

export interface ClueChain {
  id: string;
  steps: Evidence[];
  category: 'motive' | 'means' | 'opportunity';
}

export interface CaseData {
  caseId: string;
  seed: string;
  caseName: string;
  caseType: CaseType;
  complexity: Complexity;
  victimName: string;
  victimAge: number;
  victimOccupation: string;
  location: string;
  locationImageUrl: string;
  synopsis: string;
  suspects: Suspect[];
  evidence: Evidence[];
  timeline: TimelineEvent[];
  clueChains: ClueChain[];
  solution: {
    culpritId: string;
    motive: string;
    method: string;
    opportunity: string;
  };
  cinematicPanels: CinematicPanel[];
}

export interface CinematicPanel {
  id: string;
  imageDesc: string;
  imageUrl?: string;
  caption: string;
  duration: number;
}

export interface NoteTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  size?: number;
  color?: string;
  rotation?: number;
}

export interface NoteImageItem {
  id: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface BoardCard {
  id: string;
  type: 'evidence' | 'note' | 'testimony' | 'image';
  title: string;
  content: string;
  imageUrl?: string;
  noteColor?: string;
  textItems?: NoteTextItem[];
  imageItems?: NoteImageItem[];
  x: number;
  y: number;
  tag?: EvidenceTag;
  evidenceId?: string;
  drawingStrokes?: DrawingStroke[];
  lockedBy?: string;
}

export interface DrawingStroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface BoardConnection {
  id: string;
  fromCardId: string;
  toCardId: string;
  label?: string;
}

export interface BoardTape {
  id: string;
  x: number;
  y: number;
  rotation: number;
  color?: string;
  textItems?: NoteTextItem[];
  drawingStrokes?: DrawingStroke[];
  lockedBy?: string;
}

export interface BoardState {
  cards: BoardCard[];
  connections: BoardConnection[];
  tapes?: BoardTape[];
}

export interface GameState {
  phase: 'cinematic' | 'investigation' | 'interview' | 'accusation' | 'results';
  timePhase: TimePhase;
  timePhaseIndex: number;
  caseData: CaseData;
  board: BoardState;
  discoveredEvidenceIds: string[];
  discoveredTimelineIds: string[];
  interviewedSuspectIds: string[];
  cinematicSkipVotes: string[];
  currentInterviewSuspectId?: string;
  interviewVotes: Record<string, boolean>;
  interviewLeaveVotes: Record<string, boolean>;
  interviewLog: { question: string; answer: string; category: InterviewCategory }[];
  accusations: { playerId: string; suspectId: string; correct: boolean }[];
  accusationVotes: Record<string, { suspectId: string; motive: string; method: string; evidenceIds: string[] }>;
  accusationSubmitted: boolean;
  accusationDraft?: { suspectId: string; motive: string; method: string; evidenceIds: string[]; initiatorId: string };
  accusationFinalVotes: Record<string, 'submit' | 'cancel'>;
  hintsUsed: number;
  score: number;
  startedAt: number;
}

// ─── WebSocket Message Types ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'lobby:create'; data: z.infer<typeof LobbyCreateSchema> }
  | { type: 'lobby:join'; data: z.infer<typeof LobbyJoinSchema> }
  | { type: 'lobby:leave'; data: { lobbyId: string } }
  | { type: 'lobby:start'; data: { lobbyId: string } }
  | { type: 'chat:send'; data: z.infer<typeof ChatSendSchema> }
  | { type: 'cinematic:vote_skip'; data: { lobbyId: string } }
  | { type: 'interview:request'; data: { lobbyId: string; suspectId: string } }
  | { type: 'interview:vote'; data: { lobbyId: string; vote: boolean } }
  | { type: 'interview:answer'; data: { lobbyId: string; category: InterviewCategory; evidenceId?: string } }
  | { type: 'interview:end'; data: { lobbyId: string } }
  | { type: 'interview:request_leave'; data: { lobbyId: string } }
  | { type: 'interview:leave_vote'; data: { lobbyId: string; vote: boolean } }
  | { type: 'timeline:op'; data: { lobbyId: string; op: 'discover'; eventId: string } }
  | { type: 'board:op'; data: { lobbyId: string; op: BoardOp } }
  | { type: 'accusation:open'; data: { lobbyId: string } }
  | { type: 'accusation:update_draft'; data: { lobbyId: string; draft: { suspectId: string; motive: string; method: string; evidenceIds: string[] } } }
  | { type: 'accusation:vote_final'; data: { lobbyId: string; vote: 'submit' | 'cancel' | null } }
  | { type: 'accusation:submit'; data: { lobbyId: string; accusation: z.infer<typeof AccusationSchema> } }
  | { type: 'accusation:cancel'; data: { lobbyId: string } }
  | { type: 'evidence:discover'; data: { lobbyId: string; evidenceId: string } }
  | { type: 'ping' };

export type BoardOp =
  | { type: 'add_card'; card: BoardCard }
  | { type: 'move_card'; cardId: string; x: number; y: number }
  | { type: 'update_card'; cardId: string; content: string; title?: string; tag?: EvidenceTag; imageUrl?: string; noteColor?: string; textItems?: NoteTextItem[]; imageItems?: NoteImageItem[] }
  | { type: 'remove_card'; cardId: string }
  | { type: 'add_connection'; connection: BoardConnection }
  | { type: 'remove_connection'; connectionId: string }
  | { type: 'add_tape'; tape: BoardTape }
  | { type: 'move_tape'; tapeId: string; x: number; y: number }
  | { type: 'update_tape'; tapeId: string; textItems?: NoteTextItem[]; drawingStrokes?: DrawingStroke[] }
  | { type: 'remove_tape'; tapeId: string }
  | { type: 'lock_card'; cardId: string; playerId: string }
  | { type: 'unlock_card'; cardId: string }
  | { type: 'lock_tape'; tapeId: string; playerId: string }
  | { type: 'unlock_tape'; tapeId: string }
  | { type: 'draw_stroke'; cardId: string; stroke: DrawingStroke }
  | { type: 'erase_strokes'; cardId: string }
  | { type: 'draw_tape_stroke'; tapeId: string; stroke: DrawingStroke }
  | { type: 'erase_tape_strokes'; tapeId: string }
  | { type: 'undo' }
  | { type: 'redo' };

export type ServerMessage =
  | { type: 'lobby:created'; data: { lobby: LobbyInfo } }
  | { type: 'lobby:joined'; data: { lobby: LobbyInfo; playerId: string } }
  | { type: 'lobby:updated'; data: { lobby: LobbyInfo } }
  | { type: 'lobby:left'; data: { lobbyId: string } }
  | { type: 'lobby:error'; data: { message: string } }
  | { type: 'chat:message'; data: ChatMessage }
  | { type: 'game:init'; data: { gameState: GameState } }
  | { type: 'game:state'; data: { gameState: GameState } }
  | { type: 'game:time_phase'; data: { phase: TimePhase; index: number } }
  | { type: 'cinematic:vote_update'; data: { votes: string[]; total: number } }
  | { type: 'cinematic:end' }
  | { type: 'interview:requested'; data: { suspectId: string; requesterId: string; requesterName: string } }
  | { type: 'interview:vote_update'; data: { votes: Record<string, boolean>; needed: number } }
  | { type: 'interview:leave_vote_update'; data: { votes: Record<string, boolean>; needed: number } }
  | { type: 'interview:request_leave' }
  | { type: 'interview:start'; data: { suspectId: string } }
  | { type: 'interview:response'; data: { question: string; answer: string; category: InterviewCategory } }
  | { type: 'interview:ended' }
  | { type: 'timeline:updated'; data: { timeline: TimelineEvent[]; discoveredIds: string[]; score?: number } }
  | { type: 'board:updated'; data: { board: BoardState } }
  | { type: 'board:op_applied'; data: { op: BoardOp } }
  | { type: 'evidence:discovered'; data: { evidenceId: string; discoveredBy: string; score?: number } }
  | { type: 'accusation:vote_status'; data: { votesReceived: number; votesNeeded: number } }
  | { type: 'accusation:opened'; data: { initiatorId: string; draft: { suspectId: string; motive: string; method: string; evidenceIds: string[] } } }
  | { type: 'accusation:draft_update'; data: { suspectId: string; motive: string; method: string; evidenceIds: string[] } }
  | { type: 'accusation:final_votes'; data: { votes: Record<string, 'submit' | 'cancel'>; needed: number } }
  | { type: 'accusation:closed'; data: { reason: 'cancelled' } }
  | { type: 'accusation:results'; data: { correct: boolean; score: number; culpritId: string; playerVotes: Record<string, { suspectId: string; correct: boolean }>; solution: GameState['caseData']['solution'] } }
  | { type: 'game:end'; data: { won: boolean; score: number; solution: GameState['caseData']['solution'] } }
  | { type: 'error'; data: { message: string } }
  | { type: 'pong' };
