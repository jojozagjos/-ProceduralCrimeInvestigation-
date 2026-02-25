// ─── Game Scene ──────────────────────────────────────────────────────────────

import { navigateTo } from '../core/sceneManager.js';
import { playMusic, playSfx, stopMusic } from '../core/audioManager.js';
import { gameStore } from '../core/gameStore.js';
import * as net from '../network/client.js';
import { showToast } from '../ui/toast.js';
import { renderChat } from '../chat/chatWidget.js';
import { renderCorkboard } from '../board/corkboard.js';
import { renderTimeline } from '../timeline/timelinePanel.js';
import { renderCinematic } from '../scenes/cinematicScene.js';
import { renderInterviewScene } from '../scenes/interviewScene.js';
import { renderPauseMenu } from '../ui/pauseMenu.js';
import { getLobbyData } from './lobbyScene.js';
import type { ServerMessage, GameState, Player } from '../utils/types.js';

let unsub: (() => void) | null = null;
let storeSub: (() => void) | null = null;
let chatCleanup: (() => void) | null = null;
let pauseVisible = false;

export function renderGameScene(container: HTMLElement): () => void {
  const state = gameStore.getState();
  if (!state) { navigateTo('play'); return () => {}; }

  playMusic('music_investigation');

  container.innerHTML = `
    <div class="game-screen">
      <div class="game-topbar" id="game-topbar">
        <div class="topbar-left">
          <span class="case-name" id="case-name"></span>
          <span class="time-phase-badge" id="time-badge"></span>
        </div>
        <div class="topbar-right">
          <span class="score-display" id="score-display" title="Investigation Score"></span>
          <button class="btn btn-sm" id="btn-players-panel">Players</button>
          <button class="btn btn-sm" id="btn-evidence-panel">Evidence</button>
          <button class="btn btn-sm" id="btn-suspects-panel">Suspects</button>
          <button class="btn btn-sm" id="btn-timeline-panel">Timeline</button>
          <button class="btn btn-sm btn-accent" id="btn-accuse">Accuse</button>
        </div>
      </div>

      <div class="game-main" id="game-main">
        <div class="board-area" id="board-area"></div>
      </div>

      <div class="game-sidebar" id="game-sidebar">
        <div class="sidebar-panel" id="sidebar-panel" style="display:none;"></div>
        <div class="game-chat" id="game-chat-area"></div>
      </div>

      <div id="overlay-container"></div>
      <div id="pause-menu-container" style="display:none;"></div>
    </div>
  `;

  updateTopbar(state);

  // Chat
  const chatArea = document.getElementById('game-chat-area')!;
  chatCleanup = renderChat(chatArea, gameStore.getLobbyId(), true);

  // Board
  const boardArea = document.getElementById('board-area')!;
  renderCorkboard(boardArea);

  // Phase rendering
  if (state.phase === 'cinematic') {
    showCinematic(state);
  }

  // Topbar buttons
  document.getElementById('btn-players-panel')!.addEventListener('click', () => toggleSidebar('players'));
  document.getElementById('btn-evidence-panel')!.addEventListener('click', () => toggleSidebar('evidence'));
  document.getElementById('btn-suspects-panel')!.addEventListener('click', () => toggleSidebar('suspects'));
  document.getElementById('btn-timeline-panel')!.addEventListener('click', () => toggleSidebar('timeline'));
  document.getElementById('btn-accuse')!.addEventListener('click', () => showAccusationModal());

  // Keyboard
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      togglePause();
    }
  };
  document.addEventListener('keydown', keyHandler);

  // WS handler
  unsub = net.onMessage(handleGameMessage);
  storeSub = gameStore.subscribe(() => {
    const s = gameStore.getState();
    if (s) updateTopbar(s);
  });

  return () => {
    if (unsub) { unsub(); unsub = null; }
    if (storeSub) { storeSub(); storeSub = null; }
    if (chatCleanup) { chatCleanup(); chatCleanup = null; }
    document.removeEventListener('keydown', keyHandler);
    stopMusic();
  };
}

function handleGameMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'lobby:updated': {
      const lobbyData = msg.data.lobby;
      (globalThis as any).lobbyData = lobbyData;
      const panelEl = document.getElementById('sidebar-panel');
      const state = gameStore.getState();
      if (panelEl && panelEl.getAttribute('data-panel') === 'players' && state) {
        renderPlayersPanel(panelEl, state);
      }
      break;
    }

    case 'game:state':
      gameStore.setState(msg.data.gameState);
      break;

    case 'game:time_phase':
      gameStore.updateTimePhase(msg.data.phase, msg.data.index);
      showToast(`Time advances: ${msg.data.phase.replace('_', ' ')}`);
      break;

    case 'cinematic:vote_update': {
      const el = document.getElementById('cinematic-votes');
      if (el) el.textContent = `Skip votes: ${msg.data.votes.length}/${msg.data.total}`;
      break;
    }

    case 'cinematic:end':
      gameStore.updatePhase('investigation');
      hideCinematic();
      showCaseBrief();
      break;

    case 'interview:requested':
      showInterviewVote(msg.data.suspectId, msg.data.requesterName);
      break;

    case 'interview:vote_update':
      updateInterviewVote(msg.data.votes, msg.data.needed);
      break;

    case 'interview:leave_vote_update':
      updateInterviewLeaveVote(msg.data.votes, msg.data.needed);
      break;

    case 'interview:start':
      gameStore.updatePhase('interview');
      showInterview(msg.data.suspectId);
      break;

    case 'interview:response': {
      const logEl = document.getElementById('interview-log');
      if (logEl) {
        const entry = document.createElement('div');
        entry.className = 'interview-entry response';
        entry.innerHTML = `
          <div class="entry-bubble suspect">
            <div class="bubble-icon">💬</div>
            <div class="bubble-content">
              <div class="bubble-label">Suspect Response</div>
              <div class="a">${escHtml(msg.data.answer)}</div>
            </div>
          </div>
        `;
        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;
      }
      break;
    }

    case 'interview:ended':
      gameStore.updatePhase('investigation');
      hideInterview();
      break;

    case 'timeline:updated':
      gameStore.updateTimeline(msg.data.timeline, msg.data.discoveredIds, msg.data.score);
      break;

    case 'board:op_applied':
      gameStore.applyBoardOp(msg.data.op);
      break;

    case 'evidence:discovered':
      gameStore.discoverEvidence(msg.data.evidenceId, msg.data.score);
      showToast(`Evidence discovered by ${msg.data.discoveredBy}!`);
      playSfx('sfx_evidence_glow');
      break;

    case 'accusation:vote_status':
      updateAccusationVoteStatus(msg.data);
      break;

    case 'accusation:results':
      showAccusationResults(msg.data);
      break;

    case 'game:end':
      showGameEnd(msg.data);
      break;

    case 'error':
      if (msg.data.message === 'Disconnected from server.') {
        showToast('Disconnected');
        gameStore.clear();
        navigateTo('play');
      }
      break;
  }
}

function updateTopbar(state: GameState): void {
  const nameEl = document.getElementById('case-name');
  const badgeEl = document.getElementById('time-badge');
  const scoreEl = document.getElementById('score-display');
  if (nameEl) nameEl.textContent = state.caseData.caseName;
  if (badgeEl) {
    badgeEl.textContent = state.timePhase.replace('_', ' ');
    badgeEl.className = `time-phase-badge phase-${state.timePhase}`;
  }
  if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;
}

// ─── Cinematic ───────────────────────────────────────────────────────────────

function showCinematic(state: GameState): void {
  playMusic('music_cinematic');
  const overlay = document.getElementById('overlay-container')!;
  renderCinematic(overlay, state.caseData, () => {
    net.voteCinematicSkip(gameStore.getLobbyId());
  });
}

function hideCinematic(): void {
  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = '';
  playMusic('music_investigation');
}

function showCaseBrief(): void {
  const state = gameStore.getState();
  if (!state) return;
  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div class="modal-overlay">
      <div class="modal case-brief">
        <h2>Case Brief</h2>
        <p><strong>${state.caseData.caseName}</strong></p>
        <p>${escHtml(state.caseData.synopsis)}</p>
        <ul>
          <li>Victim: ${escHtml(state.caseData.victimName)}</li>
          <li>Location: ${escHtml(state.caseData.location)}</li>
          <li>Suspects: ${state.caseData.suspects.length}</li>
          <li>Type: ${state.caseData.caseType}</li>
        </ul>
        <button class="btn btn-play" id="btn-start-investigation">Begin Investigation</button>
      </div>
    </div>
  `;
  document.getElementById('btn-start-investigation')!.addEventListener('click', () => {
    overlay.innerHTML = '';
  });

  // Manual close only
}

// ─── Interview ───────────────────────────────────────────────────────────────

function showInterviewVote(suspectId: string, requesterName: string): void {
  const state = gameStore.getState();
  if (!state) return;
  const suspect = state.caseData.suspects.find(s => s.id === suspectId);
  if (!suspect) return;

  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div class="modal-overlay interview-vote-overlay">
      <div class="modal">
        <h3>Interview Request</h3>
        <p>${escHtml(requesterName)} wants to interview <strong>${escHtml(suspect.name)}</strong>.</p>
        <p>All players must agree. <span id="vote-status"></span></p>
        <div class="vote-buttons">
          <button class="btn btn-play" id="vote-yes">Yes</button>
          <button class="btn btn-danger" id="vote-no">No</button>
        </div>
        <div id="vote-timer" class="vote-timer">12s remaining</div>
      </div>
    </div>
  `;

  document.getElementById('vote-yes')!.addEventListener('click', () => {
    net.voteInterview(gameStore.getLobbyId(), true);
    disableVoteButtons();
  });
  document.getElementById('vote-no')!.addEventListener('click', () => {
    net.voteInterview(gameStore.getLobbyId(), false);
    disableVoteButtons();
  });

  // Timer
  let remaining = 12;
  const timer = setInterval(() => {
    remaining--;
    const timerEl = document.getElementById('vote-timer');
    if (timerEl) timerEl.textContent = `${remaining}s remaining`;
    if (remaining <= 0) {
      clearInterval(timer);
      // Auto-vote no if didn't vote
      net.voteInterview(gameStore.getLobbyId(), false);
      disableVoteButtons();
    }
  }, 1000);
}

function disableVoteButtons(): void {
  const yes = document.getElementById('vote-yes') as HTMLButtonElement;
  const no = document.getElementById('vote-no') as HTMLButtonElement;
  if (yes) yes.disabled = true;
  if (no) no.disabled = true;
}

function updateInterviewVote(votes: Record<string, boolean>, needed: number): void {
  const el = document.getElementById('vote-status');
  if (el) {
    const count = Object.values(votes).filter(v => v).length;
    el.textContent = `${count}/${needed} votes`;
  }
}

function updateInterviewLeaveVote(votes: Record<string, boolean>, needed: number): void {
  const el = document.getElementById('leave-vote-status');
  if (el) {
    const count = Object.values(votes).filter(v => v).length;
    el.textContent = `${count}/${needed} agreed to leave`;
  }
}

function showInterview(suspectId: string): void {
  const state = gameStore.getState();
  if (!state) return;
  playMusic('music_interview');

  const overlay = document.getElementById('overlay-container')!;
  renderInterviewScene(overlay, suspectId, state);
  
  // Setup voting to leave interview
  (window as any).requestInterviewEnd = () => {
    showInterviewLeaveVote();
  };
}

function showInterviewLeaveVote(): void {
  const overlay = document.getElementById('overlay-container');
  if (!overlay) return;
  
  const voteOverlay = document.createElement('div');
  voteOverlay.className = 'modal-overlay';
  voteOverlay.id = 'interview-leave-vote-overlay';
  voteOverlay.innerHTML = `
    <div class="modal">
      <h3>End Interview?</h3>
      <p>All players must agree to end the interview.</p>
      <p id="leave-vote-status">Waiting for votes...</p>
      <div class="vote-buttons">
        <button class="btn btn-secondary" id="vote-leave-no" disabled>No, Continue</button>
        <button class="btn btn-play" id="vote-leave-yes" disabled>Yes, End Interview</button>
      </div>
    </div>
  `;
  overlay.appendChild(voteOverlay);

  const yesBtn = document.getElementById('vote-leave-yes') as HTMLButtonElement;
  const noBtn = document.getElementById('vote-leave-no') as HTMLButtonElement;
  
  if (yesBtn) {
    yesBtn.disabled = false;
    yesBtn.addEventListener('click', () => {
      net.voteInterviewLeave(gameStore.getLobbyId(), true);
      // Disable to prevent multiple clicks
      yesBtn.disabled = true;
      if (noBtn) noBtn.disabled = true;
    });
  }
  
  if (noBtn) {
    noBtn.disabled = false;
    noBtn.addEventListener('click', () => {
      net.voteInterviewLeave(gameStore.getLobbyId(), false);
      voteOverlay.remove();
    });
  }
}

function hideInterview(): void {
  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = '';
  playMusic('music_investigation');
}

// ─── Sidebar Panels ──────────────────────────────────────────────────────────

function toggleSidebar(panel: 'evidence' | 'suspects' | 'timeline' | 'players'): void {
  const el = document.getElementById('sidebar-panel')!;
  if (el.style.display !== 'none' && el.getAttribute('data-panel') === panel) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.setAttribute('data-panel', panel);

  const state = gameStore.getState();
  if (!state) return;

  switch (panel) {
    case 'evidence': renderEvidencePanel(el, state); break;
    case 'suspects': renderSuspectsPanel(el, state); break;
    case 'timeline': renderTimeline(el, state); break;
    case 'players': renderPlayersPanel(el, state); break;
  }
}

function renderEvidencePanel(el: HTMLElement, state: GameState): void {
  const discovered = state.caseData.evidence.filter(e => state.discoveredEvidenceIds.includes(e.id));
  const undiscovered = state.caseData.evidence.filter(e => !state.discoveredEvidenceIds.includes(e.id));

  // Group by tag
  const byTag: Record<string, typeof discovered> = {};
  discovered.forEach(e => {
    const tag = e.tag || 'uncategorized';
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(e);
  });

  el.innerHTML = `
    <div class="panel evidence-panel">
      <div class="evidence-panel-header">
        <h3>Evidence Collection</h3>
        <div class="evidence-stats">
          <span class="stat-badge discovered">${discovered.length} Found</span>
          <span class="stat-badge undiscovered">${undiscovered.length} Hidden</span>
        </div>
      </div>

      <div class="evidence-search">
        <input type="text" id="evidence-search" class="input evidence-search-input" placeholder="🔍 Search evidence...">
      </div>

      <div class="evidence-filters">
        <button class="filter-btn active" data-filter="all">All (${discovered.length})</button>
        ${Object.keys(byTag).map(tag => `
          <button class="filter-btn" data-filter="${tag}">${tag} (${byTag[tag].length})</button>
        `).join('')}
      </div>

      <div class="evidence-list" id="evidence-list-container">
        ${discovered.map(e => `
          <div class="evidence-card ${e.reliability}" data-eid="${e.id}" data-tag="${e.tag}" data-title="${escHtml(e.title).toLowerCase()}" data-desc="${escHtml(e.description).toLowerCase()}">
            <div class="evidence-card-header">
              <div class="ev-tag-badge">${e.tag}</div>
              <div class="ev-rel-badge ${e.reliability}">${e.reliability}</div>
            </div>
            <div class="ev-title">
              <span class="ev-title-icon">📦</span>
              ${escHtml(e.title)}
            </div>
            <div class="ev-desc">${escHtml(e.description)}</div>
            <div class="ev-meta">
              <span class="ev-meta-item">
                <span class="meta-icon">📋</span>
                ${e.sourceType}
              </span>
              <span class="ev-meta-item">
                <span class="meta-icon">🎯</span>
                ${e.confidenceScore}% Confidence
              </span>
            </div>
            <div class="ev-actions">
              <button class="btn btn-pin" data-add-board="${e.id}">
                <span>📌</span> Pin to Board
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      ${undiscovered.length > 0 ? `
        <div class="undiscovered-section">
          <div class="undiscovered-header">
            <h4>🔒 Undiscovered Evidence</h4>
            <span class="undiscovered-count">${undiscovered.length} remaining</span>
          </div>
          <div class="evidence-list undiscovered-list">
            ${undiscovered.slice(0, 5).map(e => `
              <div class="evidence-card undiscovered" data-eid="${e.id}">
                <div class="undiscovered-content">
                  <div class="ev-mystery-icon">❓</div>
                  <div class="ev-title-mystery">Unknown ${e.sourceType} evidence</div>
                </div>
                <button class="btn btn-discover" data-discover="${e.id}">
                  <span>🔍</span> Investigate (10pts)
                </button>
              </div>
            `).join('')}
            ${undiscovered.length > 5 ? `
              <div class="more-evidence">
                <span>… and ${undiscovered.length - 5} more to discover</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Search functionality
  const searchInput = document.getElementById('evidence-search') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      const cards = el.querySelectorAll('.evidence-card:not(.undiscovered)');
      cards.forEach(card => {
        const title = (card as HTMLElement).getAttribute('data-title') || '';
        const desc = (card as HTMLElement).getAttribute('data-desc') || '';
        const matches = title.includes(query) || desc.includes(query);
        (card as HTMLElement).style.display = matches ? 'block' : 'none';
      });
    });
  }

  // Filter functionality
  el.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const filter = (btn as HTMLElement).getAttribute('data-filter');
      const cards = el.querySelectorAll('.evidence-card:not(.undiscovered)');
      cards.forEach(card => {
        if (filter === 'all') {
          (card as HTMLElement).style.display = 'block';
        } else {
          const tag = (card as HTMLElement).getAttribute('data-tag');
          (card as HTMLElement).style.display = tag === filter ? 'block' : 'none';
        }
      });
    });
  });

  // Pin to board
  el.querySelectorAll('[data-add-board]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eid = (btn as HTMLElement).getAttribute('data-add-board')!;
      const ev = state.caseData.evidence.find(e => e.id === eid);
      if (ev) {
        const card = {
          id: 'card_' + Math.random().toString(36).slice(2, 10),
          type: 'evidence' as const,
          title: ev.title,
          content: ev.description,
          x: 100 + Math.random() * 400,
          y: 100 + Math.random() * 300,
          tag: ev.tag,
          evidenceId: ev.id,
        };
        net.sendBoardOp(gameStore.getLobbyId(), { type: 'add_card', card });
        playSfx('sfx_pin_drop');
        showToast('Pinned to board');
      }
    });
  });

  // Discover
  el.querySelectorAll('[data-discover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eid = (btn as HTMLElement).getAttribute('data-discover')!;
      net.discoverEvidence(gameStore.getLobbyId(), eid);
    });
  });
}

function renderSuspectsPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = `
    <div class="panel suspects-panel">
      <h3>Suspects</h3>
      <div class="suspects-list">
        ${state.caseData.suspects.map(s => `
          <div class="suspect-card">
            <img class="suspect-avatar" src="${s.avatarUrl}" alt="${escHtml(s.name)}" />
            <div class="suspect-info">
              <div class="suspect-name">${escHtml(s.name)}, ${s.age}</div>
              <div class="suspect-occ">${escHtml(s.occupation)}</div>
              <div class="suspect-rel">Relationship: ${escHtml(s.relationship)}</div>
              ${state.interviewedSuspectIds.includes(s.id) ? '<span class="interviewed-badge">Interviewed</span>' : ''}
            </div>
            <button class="btn btn-sm" data-interview="${s.id}">Request Interview</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  el.querySelectorAll('[data-interview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = (btn as HTMLElement).getAttribute('data-interview')!;
      net.requestInterview(gameStore.getLobbyId(), sid);
      showToast('Interview requested. Waiting for votes...');
    });
  });
}

function renderPlayersPanel(el: HTMLElement, _state: GameState): void {
  const currentPlayerId = gameStore.getPlayerId();
  const { lobby } = getLobbyData();
  const players: Player[] = lobby?.players ?? [];
  const connectedPlayers = players.filter(p => p.connected);
  
  el.innerHTML = `
    <div class="panel players-panel">
      <h3>Investigators</h3>
      <div class="players-list">
        ${connectedPlayers.length === 0 ? '<div class="muted">No connected players.</div>' : ''}
        ${connectedPlayers.map(p => `
          <div class="player-card ${p.id === currentPlayerId ? 'current-player' : ''}">
            <div class="player-status connected">
              <span class="status-dot"></span>
            </div>
            <div class="player-info">
              <div class="player-name">${escHtml(p.displayName)}<span class="player-tag">${p.id === currentPlayerId ? ' (You)' : ''}</span></div>
              <div class="player-status-text">Connected</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Accusation ──────────────────────────────────────────────────────────────

function showAccusationModal(): void {
  const state = gameStore.getState();
  if (!state) return;

  const playerId = (globalThis as any).clientPlayerId || '';
  const hasVoted = (globalThis as any).accusationVoteSubmitted === true;
  const voteStatus = (globalThis as any).accusationVoteStatus || {
    votesReceived: Object.keys(state.accusationVotes || {}).length,
    votesNeeded: getLobbyPlayerCount(),
  };

  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div class="vote-screen-overlay">
      <div class="vote-screen accusation-vote-screen">
        <div class="vote-header">
          <h2>🎯 Final Accusation</h2>
          <p class="vote-subtitle">The team has one chance to solve the case!</p>
        </div>

        ${hasVoted ? `
          <div class="vote-waiting">
            <div class="vote-checkmark">✓</div>
            <h3>Vote Submitted!</h3>
            <p>Waiting for other investigators...</p>
            <div class="vote-progress">
              <div class="vote-progress-text" id="vote-status">
                ${voteStatus.votesReceived} / ${voteStatus.votesNeeded} votes
              </div>
              <div class="vote-progress-bar">
                <div class="vote-progress-fill" style="width: ${(voteStatus.votesReceived / voteStatus.votesNeeded) * 100}%"></div>
              </div>
            </div>
            <div class="vote-buttons">
              <button class="btn btn-danger" id="acc-cancel-vote">Cancel Vote</button>
            </div>
          </div>
        ` : `
          <div class="vote-form">
            <div class="form-row">
              <label>Who is the culprit?</label>
              <select id="acc-suspect" class="input-select accusation-select">
                ${state.caseData.suspects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <label>What was their motive?</label>
              <select id="acc-motive" class="input-select" required>
                <option value="">— Choose a motive —</option>
                <option value="Money / Financial Gain">Money / Financial Gain</option>
                <option value="Revenge / Jealousy">Revenge / Jealousy</option>
                <option value="Self-Defense / Protection">Self-Defense / Protection</option>
                <option value="Crime of Passion">Crime of Passion</option>
                <option value="Greed / Inheritance">Greed / Inheritance</option>
              </select>
            </div>
            <div class="form-row">
              <label>How did they commit the crime?</label>
              <select id="acc-method" class="input-select" required>
                <option value="">— Choose a method —</option>
                <option value="Poison">Poison</option>
                <option value="Blunt Force Trauma">Blunt Force Trauma</option>
                <option value="Stabbing">Stabbing</option>
                <option value="Shooting">Shooting</option>
                <option value="Accident / Negligence">Accident / Negligence</option>
              </select>
            </div>
            <div class="form-row">
              <label>Supporting Evidence (Optional)</label>
              <div class="evidence-checkboxes" id="acc-evidence">
                ${state.caseData.evidence
                  .filter(e => state.discoveredEvidenceIds.includes(e.id))
                  .map(e => `<label class="check-label"><input type="checkbox" value="${e.id}"> ${escHtml(e.title)}</label>`).join('')}
              </div>
            </div>
            <div class="vote-actions">
              <button class="btn btn-secondary" id="acc-cancel">Cancel</button>
              <button class="btn btn-vote" id="acc-submit">Submit My Vote</button>
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  if (!hasVoted) {
    const cancelBtn = document.getElementById('acc-cancel');
    const submitBtn = document.getElementById('acc-submit');
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const overlay = document.getElementById('overlay-container');
        if (overlay) overlay.innerHTML = '';
      });
    }
    
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const suspectSelect = document.getElementById('acc-suspect') as HTMLSelectElement;
        const motiveSelect = document.getElementById('acc-motive') as HTMLSelectElement;
        const methodSelect = document.getElementById('acc-method') as HTMLSelectElement;
        
        if (!suspectSelect || !motiveSelect || !methodSelect) return;
        
        const suspectId = suspectSelect.value;
        const motive = motiveSelect.value.trim();
        const method = methodSelect.value.trim();
        
        if (!motive || !method) {
          showToast('Please select both motive and method.');
          return;
        }
        
        const checkboxes = document.querySelectorAll('#acc-evidence input:checked');
        const evidenceIds = Array.from(checkboxes).map(cb => (cb as HTMLInputElement).value);

        net.submitAccusation(gameStore.getLobbyId(), suspectId, motive, method, evidenceIds);
        (globalThis as any).accusationVoteSubmitted = true;
        playSfx('sfx_ui_click');
      });
    }
  }

  const cancelVoteBtn = document.getElementById('acc-cancel-vote');
  if (cancelVoteBtn) {
    cancelVoteBtn.addEventListener('click', () => {
      net.cancelAccusationVote(gameStore.getLobbyId());
      (globalThis as any).accusationVoteSubmitted = false;
      showAccusationModal();
    });
  }
}

function getLobbyPlayerCount(): number {
  // Get from lobby state if available, fallback to 1
  const lobbyData = (globalThis as any).lobbyData;
  return lobbyData?.players?.length || 1;
}

function updateAccusationVoteStatus(data: { votesReceived: number; votesNeeded: number }): void {
  (globalThis as any).accusationVoteStatus = data;
  const statusEl = document.getElementById('vote-status');
  const fillEl = document.querySelector('.vote-progress-fill') as HTMLElement;
  
  if (statusEl) {
    statusEl.textContent = `${data.votesReceived} / ${data.votesNeeded} votes`;
  }
  if (fillEl) {
    fillEl.style.width = `${(data.votesReceived / data.votesNeeded) * 100}%`;
  }

  // Re-render the vote screen to show waiting state
  if (data.votesReceived >= 0) {
    const state = gameStore.getState();
    if (state) showAccusationModal();
  }
}

function showAccusationResults(data: { correct: boolean; score: number; culpritId: string; playerVotes: Record<string, { suspectId: string; correct: boolean }>; solution: any }): void {
  stopMusic();
  const state = gameStore.getState();
  if (!state) return;

  (globalThis as any).accusationVoteSubmitted = false;
  (globalThis as any).accusationVoteStatus = null;

  const playerId = (globalThis as any).clientPlayerId || '';
  const myVote = data.playerVotes[playerId];
  const culprit = state.caseData.suspects.find(s => s.id === data.culpritId);
  
  const overlay = document.getElementById('overlay-container');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="vote-screen-overlay results-reveal">
      <div class="vote-screen accusation-results">
        <div class="result-header ${data.correct ? 'result-success' : 'result-fail'}">
          <div class="result-icon">${data.correct ? '🎉' : '❌'}</div>
          <h2>${data.correct ? 'Case Solved!' : 'Case Unsolved'}</h2>
          <p class="result-verdict">${data.correct ? 'The team\'s consensus was correct!' : 'The team\'s conclusion was wrong.'}</p>
        </div>

        <div class="result-details">
          <div class="result-section">
            <h3>The Truth</h3>
            <div class="result-culprit">
              <strong>${escHtml(culprit?.name || 'Unknown')}</strong>
              <p class="result-muted">${escHtml(data.solution.motive)}</p>
              <p class="result-muted">${escHtml(data.solution.method)}</p>
            </div>
          </div>

          <div class="result-section">
            <h3>Your Vote</h3>
            <div class="result-vote ${myVote?.correct ? 'vote-correct' : 'vote-wrong'}">
              ${myVote ? `
                <div class="vote-badge">${myVote.correct ? '✓ Correct' : '✗ Wrong'}</div>
                <p>You suspected: <strong>${escHtml(state.caseData.suspects.find(s => s.id === myVote.suspectId)?.name || 'Unknown')}</strong></p>
              ` : '<p class="result-muted">No vote submitted</p>'}
            </div>
          </div>

          <div class="result-section">
            <h3>Team Votes</h3>
            <div class="team-votes">
              ${Object.entries(data.playerVotes).map(([pid, vote]) => {
                const suspect = state.caseData.suspects.find(s => s.id === vote.suspectId);
                return `
                  <div class="team-vote-item ${vote.correct ? 'correct' : 'wrong'}">
                    <span class="vote-icon">${vote.correct ? '✓' : '✗'}</span>
                    <span class="vote-suspect">${escHtml(suspect?.name || 'Unknown')}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="result-score">
            <h3>Final Score</h3>
            <div class="score-display">${data.score}</div>
          </div>
        </div>

        <div class="result-actions">
          <button class="btn btn-play" id="btn-return-lobby">Return to Lobby</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-return-lobby')!.addEventListener('click', () => {
    overlay.innerHTML = '';
    gameStore.clear();
    playMusic('music_investigation');
    navigateTo('play');
  });
}

// ─── Game End ────────────────────────────────────────────────────────────────

function showGameEnd(data: { won: boolean; score: number; solution: GameState['caseData']['solution'] }): void {
  stopMusic();
  const state = gameStore.getState();
  const culprit = state?.caseData.suspects.find(s => s.id === data.solution.culpritId);

  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div class="modal-overlay game-end-overlay">
      <div class="modal game-end-modal">
        <h2>${data.won ? '🎉 Case Solved!' : '❌ Case Closed'}</h2>
        <p>Final Score: <strong>${data.score}</strong></p>
        <div class="solution-reveal">
          <h3>The Truth</h3>
          <p><strong>Culprit:</strong> ${escHtml(culprit?.name || 'Unknown')}</p>
          <p><strong>Motive:</strong> ${escHtml(data.solution.motive)}</p>
          <p><strong>Method:</strong> ${escHtml(data.solution.method)}</p>
          <p><strong>Opportunity:</strong> ${escHtml(data.solution.opportunity)}</p>
        </div>
        <button class="btn btn-play" id="btn-return-menu">Return to Menu</button>
      </div>
    </div>
  `;

  document.getElementById('btn-return-menu')!.addEventListener('click', () => {
    overlay.innerHTML = '';
    gameStore.clear();
    net.disconnect();
    navigateTo('main-menu');
  });
}

// ─── Pause ───────────────────────────────────────────────────────────────────

function togglePause(): void {
  pauseVisible = !pauseVisible;
  const el = document.getElementById('pause-menu-container')!;
  if (pauseVisible) {
    el.style.display = 'block';
    renderPauseMenu(el, () => { pauseVisible = false; el.style.display = 'none'; });
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function escHtml(s: string | undefined): string {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
