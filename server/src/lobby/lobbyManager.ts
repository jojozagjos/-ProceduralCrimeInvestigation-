import { genId, VERSION } from '../utils/helpers.js';
import type { LobbyInfo, Player, LobbyStatus } from '../utils/types.js';

const lobbies = new Map<string, LobbyInfo>();

export function createLobby(opts: {
  hostId: string;
  hostDisplayName: string;
  isPrivate: boolean;
  maxPlayers: number;
  caseType: LobbyInfo['caseType'];
  complexity: LobbyInfo['complexity'];
  enableHints: boolean;
  timeCompression: boolean;
  customSeed?: string;
  customCaseName?: string;
  customVictimName?: string;
  customSuspectNames?: string;
}): LobbyInfo {
  const lobbyId = genId('lob');
  const privateCode = opts.isPrivate ? genId('code') : undefined;

  const lobby: LobbyInfo = {
    lobbyId,
    hostDisplayName: opts.hostDisplayName,
    hostId: opts.hostId,
    playersCurrent: 1,
    playersMax: opts.maxPlayers,
    status: 'waiting',
    caseType: opts.caseType,
    complexity: opts.complexity,
    isPrivate: opts.isPrivate,
    privateCode,
    enableHints: opts.enableHints,
    timeCompression: opts.timeCompression,
    customSeed: opts.customSeed,
    customCaseName: opts.customCaseName,
    customVictimName: opts.customVictimName,
    customSuspectNames: opts.customSuspectNames,
    createdAt: Date.now(),
    version: VERSION,
    players: [
      { id: opts.hostId, displayName: opts.hostDisplayName, connected: true },
    ],
  };

  lobbies.set(lobbyId, lobby);
  return lobby;
}

export function joinLobby(lobbyId: string, player: Player, privateCode?: string): LobbyInfo | string {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return 'Lobby not found.';
  if (lobby.status === 'in_game') return 'Cannot join a game in progress.';
  if (lobby.playersCurrent >= lobby.playersMax) return 'Lobby is full.';
  if (lobby.isPrivate && lobby.privateCode !== privateCode) return 'Invalid private code.';
  if (lobby.players.find(p => p.id === player.id)) return 'Already in lobby.';

  lobby.players.push(player);
  lobby.playersCurrent = lobby.players.length;
  return lobby;
}

export function leaveLobby(lobbyId: string, playerId: string): LobbyInfo | null {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return null;

  lobby.players = lobby.players.filter(p => p.id !== playerId);
  lobby.playersCurrent = lobby.players.length;

  if (lobby.playersCurrent === 0) {
    lobbies.delete(lobbyId);
    return null;
  }

  // Transfer host if host left
  if (lobby.hostId === playerId && lobby.players.length > 0) {
    lobby.hostId = lobby.players[0].id;
    lobby.hostDisplayName = lobby.players[0].displayName;
  }

  return lobby;
}

export function getLobby(lobbyId: string): LobbyInfo | undefined {
  return lobbies.get(lobbyId);
}

export function getPublicLobbies(): LobbyInfo[] {
  return Array.from(lobbies.values()).filter(
    l => !l.isPrivate && l.status === 'waiting'
  ).map(l => ({ ...l, privateCode: undefined }));
}

export function setLobbyStatus(lobbyId: string, status: LobbyStatus): void {
  const lobby = lobbies.get(lobbyId);
  if (lobby) lobby.status = status;
}

export function disconnectPlayer(lobbyId: string, playerId: string): LobbyInfo | null {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return null;
  const player = lobby.players.find(p => p.id === playerId);
  if (player) player.connected = false;

  // If all disconnected, clean up
  if (lobby.players.every(p => !p.connected)) {
    lobbies.delete(lobbyId);
    return null;
  }
  return lobby;
}

export function getConnectedPlayerCount(lobbyId: string): number {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return 0;
  return lobby.players.filter(p => p.connected).length;
}
