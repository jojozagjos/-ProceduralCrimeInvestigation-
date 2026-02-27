import { WebSocket, WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import * as lobbyMgr from '../lobby/lobbyManager.js';
import * as chatMgr from '../chat/chatManager.js';
import * as gameMgr from '../game/gameManager.js';
import { ImageProvider } from '../images/imageProvider.js';
import { LobbyCreateSchema, LobbyJoinSchema, ChatSendSchema, AccusationSchema } from '../utils/types.js';
import type { ClientMessage, ServerMessage } from '../utils/types.js';

interface ClientSocket extends WebSocket {
  playerId: string;
  displayName: string;
  lobbyId?: string;
}

const clients = new Map<string, ClientSocket>();
const imageProvider = new ImageProvider(process.env.PEXELS_API_KEY, process.env.UNSPLASH_API_KEY);
const cinematicTimers = new Map<string, ReturnType<typeof setTimeout>>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(lobbyId: string, msg: ServerMessage, excludeId?: string): void {
  const lobby = lobbyMgr.getLobby(lobbyId);
  if (!lobby) return;
  for (const player of lobby.players) {
    if (player.id === excludeId) continue;
    const client = clients.get(player.id);
    if (client) send(client, msg);
  }
}

function broadcastAll(lobbyId: string, msg: ServerMessage): void {
  broadcast(lobbyId, msg);
}

function broadcastLobbyUpdate(lobbyId: string): void {
  const lobby = lobbyMgr.getLobby(lobbyId);
  if (!lobby) return;
  broadcastAll(lobbyId, { type: 'lobby:updated', data: { lobby: sanitizeLobby(lobby) } });
}

function scheduleCinematicEnd(lobbyId: string, totalMs: number): void {
  const existing = cinematicTimers.get(lobbyId);
  if (existing) {
    clearTimeout(existing);
    cinematicTimers.delete(lobbyId);
  }

  const timer = setTimeout(() => {
    const state = gameMgr.getGame(lobbyId);
    if (!state || state.phase !== 'cinematic') return;
    gameMgr.endCinematic(lobbyId);
    broadcastAll(lobbyId, { type: 'cinematic:end' });
  }, totalMs + 500);
  cinematicTimers.set(lobbyId, timer);
}

function sanitizeLobby(lobby: ReturnType<typeof lobbyMgr.getLobby>): NonNullable<typeof lobby> {
  if (!lobby) throw new Error('No lobby');
  return { ...lobby, privateCode: lobby.isPrivate ? lobby.privateCode : undefined };
}

function systemMessage(lobbyId: string, text: string): void {
  const msg = chatMgr.addMessage(lobbyId, 'system', 'System', text, true);
  if (typeof msg !== 'string') {
    broadcastAll(lobbyId, { type: 'chat:message', data: msg });
  }
}

async function enrichCaseImages(caseData: { location: string; locationImageUrl: string; cinematicPanels: { imageDesc: string; imageUrl?: string }[] }, seed: string): Promise<void> {
  try {
    const locationImage = await imageProvider.getLocation(`${seed}-${caseData.location}`);
    caseData.locationImageUrl = locationImage.url;
  } catch {
    // Keep existing fallback if image fetch fails.
  }

  const sceneQueries: Record<string, string> = {
    exterior_night: 'noir city night street rain',
    dim_hallway: 'dim hallway moody light',
    crime_scene: 'crime scene police tape night',
    detective_desk: 'detective desk noir office lamp',
  };

  for (const panel of caseData.cinematicPanels) {
    const query = sceneQueries[panel.imageDesc] || 'noir city night';
    try {
      const img = await imageProvider.getScene(query, `${seed}-${panel.imageDesc}`);
      panel.imageUrl = img.url;
    } catch {
      // Leave imageUrl undefined to allow client gradients.
    }
  }
}

export function setupWebSocket(server: import('http').Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    const playerId = `player_${nanoid(10)}`;
    const client = ws as ClientSocket;
    client.playerId = playerId;
    client.displayName = 'Unknown';
    clients.set(playerId, client);

    ws.on('message', (raw) => {
      try {
        const message: ClientMessage = JSON.parse(raw.toString());
        handleMessage(client, message);
      } catch (e) {
        send(ws, { type: 'error', data: { message: 'Invalid message format.' } });
      }
    });

    ws.on('close', () => {
      handleDisconnect(client);
      clients.delete(playerId);
    });

    ws.on('error', () => {
      handleDisconnect(client);
      clients.delete(playerId);
    });
  });

  return wss;
}

function handleDisconnect(client: ClientSocket): void {
  if (client.lobbyId) {
    const lobbyId = client.lobbyId;
    const lobby = lobbyMgr.getLobby(lobbyId);
    if (lobby) {
      if (lobby.status === 'waiting') {
        const updated = lobbyMgr.leaveLobby(lobbyId, client.playerId);
        if (updated) {
          systemMessage(lobbyId, `${client.displayName} disconnected.`);
          broadcastLobbyUpdate(lobbyId);
        }
      } else {
        lobbyMgr.disconnectPlayer(lobbyId, client.playerId);
        systemMessage(lobbyId, `${client.displayName} disconnected.`);
        broadcastLobbyUpdate(lobbyId);
      }
    }
  }
}

async function handleMessage(client: ClientSocket, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case 'ping':
      send(client, { type: 'pong' });
      break;

    case 'lobby:create': {
      const parsed = LobbyCreateSchema.safeParse(message.data);
      if (!parsed.success) {
        send(client, { type: 'lobby:error', data: { message: 'Invalid lobby settings.' } });
        return;
      }
      const d = parsed.data;
      client.displayName = d.hostDisplayName;
      const lobby = lobbyMgr.createLobby({
        hostId: client.playerId,
        hostDisplayName: d.hostDisplayName,
        isPrivate: d.isPrivate,
        maxPlayers: d.maxPlayers,
        caseType: d.caseType,
        complexity: d.complexity,
        enableHints: d.enableHints,
        timeCompression: d.timeCompression,
        customSeed: d.customSeed,
        customCaseName: d.customCaseName,
        customVictimName: d.customVictimName,
        customSuspectNames: d.customSuspectNames,
      });
      client.lobbyId = lobby.lobbyId;
      chatMgr.initChat(lobby.lobbyId);
      send(client, { type: 'lobby:created', data: { lobby: sanitizeLobby(lobby) } });
      send(client, { type: 'lobby:joined', data: { lobby: sanitizeLobby(lobby), playerId: client.playerId } });
      systemMessage(lobby.lobbyId, `${client.displayName} created the lobby.`);
      break;
    }

    case 'lobby:join': {
      const parsed = LobbyJoinSchema.safeParse(message.data);
      if (!parsed.success) {
        send(client, { type: 'lobby:error', data: { message: 'Invalid join data.' } });
        return;
      }
      const d = parsed.data;
      client.displayName = d.displayName;
      const result = lobbyMgr.joinLobby(
        d.lobbyId,
        { id: client.playerId, displayName: d.displayName, connected: true },
        d.privateCode
      );
      if (typeof result === 'string') {
        send(client, { type: 'lobby:error', data: { message: result } });
        return;
      }
      client.lobbyId = d.lobbyId;
      send(client, { type: 'lobby:joined', data: { lobby: sanitizeLobby(result), playerId: client.playerId } });
      systemMessage(d.lobbyId, `${d.displayName} joined the lobby.`);
      broadcastLobbyUpdate(d.lobbyId);
      break;
    }

    case 'lobby:leave': {
      const lobbyId = message.data.lobbyId;
      const updated = lobbyMgr.leaveLobby(lobbyId, client.playerId);
      send(client, { type: 'lobby:left', data: { lobbyId } });
      client.lobbyId = undefined;
      if (updated) {
        systemMessage(lobbyId, `${client.displayName} left the lobby.`);
        broadcastLobbyUpdate(lobbyId);
      }
      break;
    }

    case 'lobby:start': {
      const lobbyId = message.data.lobbyId;
      const lobby = lobbyMgr.getLobby(lobbyId);
      if (!lobby) {
        send(client, { type: 'lobby:error', data: { message: 'Lobby not found.' } });
        return;
      }
      if (lobby.hostId !== client.playerId) {
        send(client, { type: 'lobby:error', data: { message: 'Only the host can start.' } });
        return;
      }
      lobbyMgr.setLobbyStatus(lobbyId, 'in_game');
      const gameState = gameMgr.createGame(lobby);
      await enrichCaseImages(gameState.caseData, lobbyId);
      broadcastAll(lobbyId, { type: 'game:init', data: { gameState } });
      systemMessage(lobbyId, 'The case has begun!');

      const speedFactor = 1.6; // Match client-side cinematic speed factor
      const totalCinematicMs = gameState.caseData.cinematicPanels
        .reduce((sum, panel) => sum + panel.duration * speedFactor, 0);
      scheduleCinematicEnd(lobbyId, totalCinematicMs);

      // Start time compression if enabled
      if (lobby.timeCompression) {
        gameMgr.startTimeCompression(lobbyId, (lid, phase, index) => {
          broadcastAll(lid, { type: 'game:time_phase', data: { phase, index } });
          systemMessage(lid, `Time advances to ${phase.replace('_', ' ')}...`);

          // Update board with discovered timeline data
          const game = gameMgr.getGame(lid);
          if (game) {
            broadcastAll(lid, { type: 'timeline:updated', data: { timeline: game.caseData.timeline, discoveredIds: game.discoveredTimelineIds } });
          }
        });
      }
      break;
    }

    case 'chat:send': {
      const parsed = ChatSendSchema.safeParse(message.data);
      if (!parsed.success) return;
      const d = parsed.data;
      const msg = chatMgr.addMessage(d.lobbyId, client.playerId, client.displayName, d.text);
      if (typeof msg === 'string') {
        send(client, { type: 'error', data: { message: msg } });
        return;
      }
      broadcastAll(d.lobbyId, { type: 'chat:message', data: msg });
      break;
    }

    case 'cinematic:vote_skip': {
      const lobbyId = message.data.lobbyId;
      const total = lobbyMgr.getConnectedPlayerCount(lobbyId);
      const result = gameMgr.voteCinematicSkip(lobbyId, client.playerId, total);
      broadcastAll(lobbyId, { type: 'cinematic:vote_update', data: { votes: result.votes, total } });
      if (result.done) {
        const timer = cinematicTimers.get(lobbyId);
        if (timer) {
          clearTimeout(timer);
          cinematicTimers.delete(lobbyId);
        }
        broadcastAll(lobbyId, { type: 'cinematic:end' });
      }
      break;
    }

    case 'interview:request': {
      const { lobbyId, suspectId } = message.data;
      const ok = gameMgr.requestInterview(lobbyId, suspectId);
      if (!ok) {
        send(client, { type: 'error', data: { message: 'Cannot request interview now.' } });
        return;
      }
      broadcastAll(lobbyId, {
        type: 'interview:requested',
        data: { suspectId, requesterId: client.playerId, requesterName: client.displayName },
      });
      break;
    }

    case 'interview:vote': {
      const { lobbyId, vote } = message.data;
      const total = lobbyMgr.getConnectedPlayerCount(lobbyId);
      const result = gameMgr.voteInterview(lobbyId, client.playerId, vote, total);
      broadcastAll(lobbyId, { type: 'interview:vote_update', data: { votes: result.votes, needed: total } });
      if (result.allVoted && result.passed) {
        const game = gameMgr.getGame(lobbyId);
        if (game?.currentInterviewSuspectId) {
          broadcastAll(lobbyId, { type: 'interview:start', data: { suspectId: game.currentInterviewSuspectId } });
        }
      }
      break;
    }

    case 'interview:answer': {
      const { lobbyId, category, evidenceId } = message.data;
      const result = gameMgr.conductInterview(lobbyId, category, evidenceId);
      if (result) {
        broadcastAll(lobbyId, { type: 'interview:response', data: { ...result, category } });
      }
      break;
    }

    case 'interview:end': {
      const { lobbyId } = message.data;
      gameMgr.endInterview(lobbyId);
      broadcastAll(lobbyId, { type: 'interview:ended' });
      break;
    }

    case 'interview:request_leave': {
      const { lobbyId } = message.data;
      // Broadcast to all players to show the vote modal
      broadcastAll(lobbyId, { type: 'interview:request_leave' });
      break;
    }

    case 'interview:leave_vote': {
      const { lobbyId, vote } = message.data;
      const total = lobbyMgr.getConnectedPlayerCount(lobbyId);
      const result = gameMgr.voteInterviewLeave(lobbyId, client.playerId, vote, total);
      broadcastAll(lobbyId, { type: 'interview:leave_vote_update', data: { votes: result.votes, needed: total } });
      if (result.allVoted && result.passed) {
        broadcastAll(lobbyId, { type: 'interview:ended' });
      }
      break;
    }

    case 'evidence:discover': {
      const { lobbyId, evidenceId } = message.data;
      const ev = gameMgr.discoverEvidence(lobbyId, evidenceId, client.playerId);
      if (ev) {
        // Deduct 10 points for investigation
        gameMgr.updateGame(lobbyId, (state) => {
          state.score = Math.max(0, state.score - 10);
        });
        const game = gameMgr.getGame(lobbyId);
        const score = game?.score ?? 0;
        broadcastAll(lobbyId, { type: 'evidence:discovered', data: { evidenceId, discoveredBy: client.displayName, score } });
      }
      break;
    }

    case 'timeline:op': {
      const { lobbyId, eventId } = message.data;
      const game = gameMgr.getGame(lobbyId);
      if (game) {
        if (!game.discoveredTimelineIds.includes(eventId)) {
          game.discoveredTimelineIds.push(eventId);
          const evt = game.caseData.timeline.find(t => t.id === eventId);
          if (evt) evt.discovered = true;
          // Deduct 10 points for investigation
          game.score = Math.max(0, game.score - 10);
        }
        broadcastAll(lobbyId, { type: 'timeline:updated', data: { timeline: game.caseData.timeline, discoveredIds: game.discoveredTimelineIds, score: game.score } });
      }
      break;
    }

    case 'board:op': {
      const { lobbyId, op } = message.data;
      const applied = gameMgr.applyBoardOp(lobbyId, op);
      if (applied) {
        broadcastAll(lobbyId, { type: 'board:op_applied', data: { op: applied } });
      }
      break;
    }

    case 'accusation:submit': {
      const { lobbyId, accusation } = message.data;
      const parsed = AccusationSchema.safeParse(accusation);
      if (!parsed.success) {
        send(client, { type: 'error', data: { message: 'Invalid accusation.' } });
        return;
      }
      const a = parsed.data;
      const voteStatus = gameMgr.submitAccusation(lobbyId, client.playerId, a.suspectId, a.motive, a.method, a.evidenceIds);
      if (voteStatus) {
        // Broadcast vote status to all players
        broadcastAll(lobbyId, {
          type: 'accusation:vote_status',
          data: { votesReceived: voteStatus.votesReceived, votesNeeded: voteStatus.votesNeeded },
        });

        // Check if all players have voted
        const results = gameMgr.checkAccusationResults(lobbyId);
        if (results) {
          const game = gameMgr.getGame(lobbyId);
          if (game) {
            broadcastAll(lobbyId, {
              type: 'accusation:results',
              data: { 
                correct: results.correct, 
                score: results.score, 
                culpritId: results.culpritId, 
                playerVotes: results.playerVotes,
                solution: game.caseData.solution,
              },            });
          }
        }
      }
      break;
    }

    case 'accusation:open': {
      const { lobbyId } = message.data;
      const game = gameMgr.getGame(lobbyId);
      if (game) {
        // Initialize draft accusation
        game.accusationDraft = {
          suspectId: game.caseData.suspects[0].id,
          motive: '',
          method: '',
          evidenceIds: [],
          initiatorId: client.playerId,
        };
        game.accusationFinalVotes = {};
        broadcastAll(lobbyId, {
          type: 'accusation:opened',
          data: { initiatorId: client.playerId, draft: game.accusationDraft },
        });
      }
      break;
    }

    case 'accusation:update_draft': {
      const { lobbyId, draft } = message.data;
      const game = gameMgr.getGame(lobbyId);
      if (game && game.accusationDraft) {
        game.accusationDraft = { ...draft, initiatorId: game.accusationDraft.initiatorId };
        broadcastAll(lobbyId, {
          type: 'accusation:draft_update',
          data: draft,
        });
      }
      break;
    }

    case 'accusation:vote_final': {
      const { lobbyId, vote } = message.data;
      const game = gameMgr.getGame(lobbyId);
      if (game) {
        if (vote === null) {
          delete game.accusationFinalVotes[client.playerId];
        } else {
          game.accusationFinalVotes[client.playerId] = vote;
        }

        const lobby = lobbyMgr.getLobby(lobbyId);
        const total = lobby ? lobby.players.length : lobbyMgr.getConnectedPlayerCount(lobbyId);
        
        broadcastAll(lobbyId, {
          type: 'accusation:final_votes',
          data: { votes: game.accusationFinalVotes, needed: total },
        });

        // Check if all players have voted
        const votedCount = Object.keys(game.accusationFinalVotes).length;
        if (votedCount >= total) {
          // All voted - check the result
          const submitVotes = Object.values(game.accusationFinalVotes).filter(v => v === 'submit').length;
          if (submitVotes >= Math.ceil(total / 2)) {
            // Majority voted to submit
            if (game.accusationDraft) {
              if (lobby) {
                for (const player of lobby.players) {
                  game.accusationVotes[player.id] = {
                    suspectId: game.accusationDraft.suspectId,
                    motive: game.accusationDraft.motive,
                    method: game.accusationDraft.method,
                    evidenceIds: game.accusationDraft.evidenceIds,
                  };
                }
              } else {
                game.accusationVotes[game.accusationDraft.initiatorId] = {
                  suspectId: game.accusationDraft.suspectId,
                  motive: game.accusationDraft.motive,
                  method: game.accusationDraft.method,
                  evidenceIds: game.accusationDraft.evidenceIds,
                };
              }

              const results = gameMgr.checkAccusationResults(lobbyId);
              if (results) {
                broadcastAll(lobbyId, {
                  type: 'accusation:results',
                  data: {
                    correct: results.correct,
                    score: results.score,
                    culpritId: results.culpritId,
                    playerVotes: results.playerVotes,
                    solution: game.caseData.solution,
                  },
                });
              }
            }
          } else {
            // Majority voted to cancel - reset draft
            game.accusationDraft = undefined;
            game.accusationFinalVotes = {};
            broadcastAll(lobbyId, {
              type: 'accusation:closed',
              data: { reason: 'cancelled' },
            });
          }
        }
      }
      break;
    }

    case 'accusation:cancel': {
      const { lobbyId } = message.data;
      const voteStatus = gameMgr.cancelAccusationVote(lobbyId, client.playerId);
      if (voteStatus) {
        broadcastAll(lobbyId, {
          type: 'accusation:vote_status',
          data: { votesReceived: voteStatus.votesReceived, votesNeeded: voteStatus.votesNeeded },
        });
      }
      break;
    }
  }
}