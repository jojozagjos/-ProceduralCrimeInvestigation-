// ─── Play Scene ──────────────────────────────────────────────────────────────

import { navigateTo, goBack } from '../core/sceneManager.js';
import { playSfx } from '../core/audioManager.js';
import { getDisplayName, getSettings } from '../utils/settings.js';
import * as net from '../network/client.js';
import { showToast } from '../ui/toast.js';
import type { LobbyInfo } from '../utils/types.js';

let currentTab: 'public' | 'create' | 'join' | 'daily' = 'public';
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function renderPlayScene(container: HTMLElement): () => void {
  currentTab = 'public';
  container.innerHTML = `
    <div class="play-screen">
      <div class="play-header">
        <h2>Play</h2>
        <button class="btn btn-back" id="btn-back">← Back</button>
      </div>
      <div class="play-tabs">
        <button class="tab-btn active" data-tab="public">Public Lobbies</button>
        <button class="tab-btn" data-tab="create">Create Lobby</button>
        <button class="tab-btn" data-tab="join">Join Private</button>
        <button class="tab-btn" data-tab="daily">Daily Case</button>
      </div>
      <div class="play-content" id="play-content"></div>
    </div>
  `;

  document.getElementById('btn-back')!.addEventListener('click', () => {
    cleanup();
    goBack();
  });

  const tabs = container.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab') as any;
      renderTabContent();
    });
  });

  renderTabContent();

  function cleanup() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  return cleanup;
}

function renderTabContent(): void {
  const content = document.getElementById('play-content')!;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

  switch (currentTab) {
    case 'public': renderPublicLobbies(content); break;
    case 'create': renderCreateLobby(content); break;
    case 'join': renderJoinPrivate(content); break;
    case 'daily': renderDailyCase(content); break;
  }
}

// ─── PUBLIC LOBBIES ──────────────────────────────────────────────────────────

async function renderPublicLobbies(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="lobby-list">
      <div class="lobby-list-header">
        <span>Host</span><span>Players</span><span>Type</span><span>Complexity</span><span></span>
      </div>
      <div id="lobby-rows" class="lobby-rows"><p class="muted">Loading...</p></div>
    </div>
  `;

  const refresh = async () => {
    const lobbies = await net.fetchLobbies();
    const rows = document.getElementById('lobby-rows');
    if (!rows) return;
    if (lobbies.length === 0) {
      rows.innerHTML = '<p class="muted">No public lobbies available. Create one!</p>';
      return;
    }
    rows.innerHTML = lobbies.map((l: LobbyInfo) => `
      <div class="lobby-row" data-id="${l.lobbyId}">
        <span>${escHtml(l.hostDisplayName)}</span>
        <span>${l.playersCurrent}/${l.playersMax}</span>
        <span>${l.caseType}</span>
        <span>${l.complexity}</span>
        <button class="btn btn-sm" data-join="${l.lobbyId}">Join</button>
      </div>
    `).join('');

    rows.querySelectorAll('[data-join]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lobbyId = (btn as HTMLElement).getAttribute('data-join')!;
        joinPublicLobby(lobbyId);
      });
    });
  };

  await refresh();
  pollTimer = setInterval(refresh, 5000);
}

async function joinPublicLobby(lobbyId: string): Promise<void> {
  try {
    if (!net.isConnected()) await net.connect();
    const unsub = net.onMessage((msg) => {
      if (msg.type === 'lobby:joined') {
        unsub();
        navigateTo('lobby');
      } else if (msg.type === 'lobby:error') {
        unsub();
        showToast(msg.data.message);
      }
    });
    net.joinLobby(lobbyId, getDisplayName());
  } catch {
    showToast('Could not connect to server.');
  }
}

// ─── CREATE LOBBY ────────────────────────────────────────────────────────────

function renderCreateLobby(container: HTMLElement): void {
  container.innerHTML = `
    <div class="create-lobby-form">
      <div class="form-row">
        <label>Private Lobby ${tipIcon('Not listed publicly. Others join via code.')}</label>
        <label class="toggle"><input type="checkbox" id="cl-private"><span class="toggle-slider"></span></label>
      </div>
      <div class="form-row">
        <label>Max Players ${tipIcon('Limit 1–4 players.')}</label>
        <select id="cl-maxplayers" class="input-select">
          <option value="1">1</option><option value="2">2</option>
          <option value="3">3</option><option value="4" selected>4</option>
        </select>
      </div>
      <div class="form-row">
        <label>Case Type ${tipIcon('Random chooses from all types.')}</label>
        <select id="cl-casetype" class="input-select">
          <option value="random" selected>Random</option>
          <option value="murder">Murder</option>
          <option value="theft">Theft</option>
          <option value="blackmail">Blackmail</option>
          <option value="kidnapping">Kidnapping</option>
          <option value="arson">Arson</option>
        </select>
      </div>
      <div class="form-row">
        <label>Complexity ${tipIcon('Affects suspect count and clue chain length.')}</label>
        <select id="cl-complexity" class="input-select">
          <option value="simple">Simple</option>
          <option value="standard" selected>Standard</option>
          <option value="complex">Complex</option>
        </select>
      </div>
      <div class="form-row">
        <label>Enable Hints ${tipIcon('Allows hint button during investigation. Reduces score.')}</label>
        <label class="toggle"><input type="checkbox" id="cl-hints"><span class="toggle-slider"></span></label>
      </div>
      <div class="form-row">
        <label>Time Compression ${tipIcon('Time phases auto-advance. Affects availability and events.')}</label>
        <label class="toggle"><input type="checkbox" id="cl-timecomp" checked><span class="toggle-slider"></span></label>
      </div>

      <details class="custom-options">
        <summary>Custom Options</summary>
        <div class="form-row">
          <label>Custom Seed ${tipIcon('Accepts any text. Same seed recreates same case.')}</label>
          <input type="text" id="cl-seed" class="input" placeholder="e.g. my-cool-case-42" maxlength="100">
          <span class="input-example">Example: my-cool-case-42</span>
        </div>
        <div class="form-row">
          <label>Custom Case Name ${tipIcon('Overrides the generated case title.')}</label>
          <input type="text" id="cl-casename" class="input" placeholder="Optional case name" maxlength="100">
        </div>
        <div class="form-row">
          <label>Custom Victim Name ${tipIcon('Overrides the generated victim name.')}</label>
          <input type="text" id="cl-victimname" class="input" placeholder="Optional victim name" maxlength="60">
        </div>
        <div class="form-row">
          <label>Suspect Names ${tipIcon('Comma-separated list. Extra names ignored. Missing names auto-filled.')}</label>
          <input type="text" id="cl-suspects" class="input" placeholder="e.g. Alex, Jamie, Morgan, Riley" maxlength="300">
          <span class="input-example">Example: Alex, Jamie, Morgan, Riley</span>
        </div>
      </details>

      <button class="btn btn-play" id="btn-create-lobby" style="margin-top:1.5rem;">Create Lobby</button>
    </div>
  `;

  const createBtn = document.getElementById('btn-create-lobby')!;
  createBtn.addEventListener('click', createLobbyAction);
}

async function createLobbyAction(): Promise<void> {
  const btn = document.getElementById('btn-create-lobby') as HTMLButtonElement;
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Creating...';
  
  const data = {
    hostDisplayName: getDisplayName(),
    isPrivate: (document.getElementById('cl-private') as HTMLInputElement).checked,
    maxPlayers: parseInt((document.getElementById('cl-maxplayers') as HTMLSelectElement).value),
    caseType: (document.getElementById('cl-casetype') as HTMLSelectElement).value,
    complexity: (document.getElementById('cl-complexity') as HTMLSelectElement).value,
    enableHints: (document.getElementById('cl-hints') as HTMLInputElement).checked,
    timeCompression: (document.getElementById('cl-timecomp') as HTMLInputElement).checked,
    customSeed: (document.getElementById('cl-seed') as HTMLInputElement).value || undefined,
    customCaseName: (document.getElementById('cl-casename') as HTMLInputElement).value || undefined,
    customVictimName: (document.getElementById('cl-victimname') as HTMLInputElement).value || undefined,
    customSuspectNames: (document.getElementById('cl-suspects') as HTMLInputElement).value || undefined,
  };

  try {
    if (!net.isConnected()) await net.connect();
    const unsub = net.onMessage((msg) => {
      if (msg.type === 'lobby:joined') {
        unsub();
        navigateTo('lobby');
      } else if (msg.type === 'lobby:error') {
        unsub();
        showToast(msg.data.message);
        btn.disabled = false;
        btn.textContent = 'Create Lobby';
      }
    });
    net.createLobby(data);
  } catch {
    showToast('Could not connect to server.');
    btn.disabled = false;
    btn.textContent = 'Create Lobby';
  }
}

// ─── JOIN PRIVATE ────────────────────────────────────────────────────────────

function renderJoinPrivate(container: HTMLElement): void {
  container.innerHTML = `
    <div class="join-private-form">
      <h3>Join a Private Lobby</h3>
      <p class="muted">Enter the lobby code shared by the host.</p>
      <div class="form-row">
        <label>Lobby ID</label>
        <input type="text" id="jp-lobbyid" class="input" placeholder="Lobby ID">
      </div>
      <div class="form-row">
        <label>Private Code</label>
        <input type="text" id="jp-code" class="input" placeholder="Private code">
      </div>
      <button class="btn btn-play" id="btn-join-private" style="margin-top:1rem;">Join</button>
    </div>
  `;

  document.getElementById('btn-join-private')!.addEventListener('click', async () => {
    const lobbyId = (document.getElementById('jp-lobbyid') as HTMLInputElement).value.trim();
    const code = (document.getElementById('jp-code') as HTMLInputElement).value.trim();
    if (!lobbyId) { showToast('Enter a lobby ID.'); return; }

    try {
      if (!net.isConnected()) await net.connect();
      const unsub = net.onMessage((msg) => {
        if (msg.type === 'lobby:joined') {
          unsub();
          navigateTo('lobby');
        } else if (msg.type === 'lobby:error') {
          unsub();
          showToast(msg.data.message);
        }
      });
      net.joinLobby(lobbyId, getDisplayName(), code);
    } catch {
      showToast('Could not connect to server.');
    }
  });
}

// ─── DAILY CASE ──────────────────────────────────────────────────────────────

async function renderDailyCase(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p class="muted">Loading daily case...</p>';

  const daily = await net.fetchDailySeed();
  if (!daily) {
    container.innerHTML = '<p class="muted">Could not load daily case. Server may be offline.</p>';
    return;
  }

  container.innerHTML = `
    <div class="daily-case">
      <h3>🗓 Daily Case — ${daily.date}</h3>
      <p class="muted">Everyone plays the same seed today. Compare notes with friends!</p>
      <p>Seed: <code>${escHtml(daily.seed)}</code></p>
      <button class="btn btn-play" id="btn-daily-play">Play Daily Case</button>
    </div>
  `;

  document.getElementById('btn-daily-play')!.addEventListener('click', async () => {
    try {
      if (!net.isConnected()) await net.connect();
      const unsub = net.onMessage((msg) => {
        if (msg.type === 'lobby:joined') {
          unsub();
          navigateTo('lobby');
        } else if (msg.type === 'lobby:error') {
          unsub();
          showToast(msg.data.message);
        }
      });
      net.createLobby({
        hostDisplayName: getDisplayName(),
        isPrivate: false,
        maxPlayers: 4,
        caseType: 'random',
        complexity: 'standard',
        enableHints: false,
        timeCompression: true,
        customSeed: daily.seed,
      });
    } catch {
      showToast('Could not connect to server.');
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tipIcon(text: string): string {
  const safe = escHtml(text);
  return `<span class="tooltip-icon" data-tooltip="${safe}" aria-label="${safe}" tabindex="0">i</span>`;
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
