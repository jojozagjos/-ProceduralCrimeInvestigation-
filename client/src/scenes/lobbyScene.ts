// ─── Lobby Scene ─────────────────────────────────────────────────────────────

import { navigateTo } from '../core/sceneManager.js';
import { playSfx } from '../core/audioManager.js';
import * as net from '../network/client.js';
import { showToast } from '../ui/toast.js';
import { getDisplayName } from '../utils/settings.js';
import { renderChat } from '../chat/chatWidget.js';
import { gameStore } from '../core/gameStore.js';
import type { LobbyInfo, ChatMessage, ServerMessage } from '../utils/types.js';

let lobby: LobbyInfo | null = null;
let playerId: string = '';
let unsub: (() => void) | null = null;
let chatCleanup: (() => void) | null = null;

export function setLobbyData(l: LobbyInfo, pid: string): void {
  lobby = l;
  playerId = pid;
}

export function getLobbyData(): { lobby: LobbyInfo | null; playerId: string } {
  return { lobby, playerId };
}

export function renderLobbyScene(container: HTMLElement): () => void {
  if (!lobby) {
    navigateTo('play');
    return () => {};
  }

  const isHost = lobby.hostId === playerId;

  container.innerHTML = `
    <div class="lobby-screen">
      <div class="lobby-header">
        <h2>Lobby</h2>
        <button class="btn btn-back" id="btn-leave-lobby">← Leave</button>
      </div>

      <div class="lobby-info-bar">
        <span class="lobby-code">Lobby: <code>${lobby.lobbyId}</code></span>
        ${lobby.isPrivate && lobby.privateCode ? `<span class="lobby-code">Code: <code>${lobby.privateCode}</code></span>` : ''}
        <span>${lobby.caseType} | ${lobby.complexity} | ${lobby.playersMax} max</span>
      </div>

      <div class="lobby-body">
        <div class="lobby-players" id="lobby-players">
          <h3>Players</h3>
          <ul id="player-list"></ul>
        </div>
        <div class="lobby-chat" id="lobby-chat-area"></div>
      </div>

      <div class="lobby-footer">
        ${isHost ? '<button class="btn btn-play" id="btn-start-game">Start Case</button>' : '<p class="muted">Waiting for host to start...</p>'}
      </div>
    </div>
  `;

  updatePlayerList();

  // Chat widget
  const chatArea = document.getElementById('lobby-chat-area')!;
  chatCleanup = renderChat(chatArea, lobby.lobbyId);

  // Leave button
  document.getElementById('btn-leave-lobby')!.addEventListener('click', () => {
    if (lobby) net.leaveLobby(lobby.lobbyId);
  });

  // Start button (host only)
  if (isHost) {
    document.getElementById('btn-start-game')!.addEventListener('click', () => {
      if (lobby) net.startGame(lobby.lobbyId);
    });
  }

  // WS handler
  unsub = net.onMessage(handleLobbyMessage);

  return () => {
    if (unsub) { unsub(); unsub = null; }
    if (chatCleanup) { chatCleanup(); chatCleanup = null; }
  };
}

function handleLobbyMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'lobby:updated':
      lobby = msg.data.lobby;
      updatePlayerList();
      break;

    case 'lobby:left':
      lobby = null;
      if (unsub) { unsub(); unsub = null; }
      showToast('Left lobby');
      navigateTo('play');
      break;

    case 'lobby:error':
      showToast(msg.data.message);
      break;

    case 'game:init':
      if (unsub) { unsub(); unsub = null; }
      if (chatCleanup) { chatCleanup(); chatCleanup = null; }
      gameStore.setState(msg.data.gameState);
      gameStore.setLobbyId(lobby?.lobbyId || '');
      gameStore.setPlayerId(playerId);
      navigateTo('game');
      break;

    case 'error':
      if (msg.data.message === 'Disconnected from server.') {
        lobby = null;
        if (unsub) { unsub(); unsub = null; }
        showToast('Disconnected');
        navigateTo('play');
      }
      break;
  }
}

function updatePlayerList(): void {
  const ul = document.getElementById('player-list');
  if (!ul || !lobby) return;
  ul.innerHTML = lobby.players.map(p => `
    <li class="player-item ${p.connected ? '' : 'disconnected'}">
      <span class="player-dot ${p.connected ? 'online' : 'offline'}"></span>
      ${escHtml(p.displayName)}
      ${p.id === lobby!.hostId ? ' <span class="host-badge">HOST</span>' : ''}
      ${p.id === playerId ? ' <span class="you-badge">YOU</span>' : ''}
    </li>
  `).join('');
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
