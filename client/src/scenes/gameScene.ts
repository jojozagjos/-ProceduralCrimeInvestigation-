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
import type { ServerMessage, GameState } from '../utils/types.js';

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
          <span class="score-display" id="score-display"></span>
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

    case 'interview:start':
      gameStore.updatePhase('interview');
      showInterview(msg.data.suspectId);
      break;

    case 'interview:response': {
      const logEl = document.getElementById('interview-log');
      if (logEl) {
        const entry = document.createElement('div');
        entry.className = 'interview-entry';
        entry.innerHTML = `<div class="q">Q: ${escHtml(msg.data.question)}</div><div class="a">${escHtml(msg.data.answer)}</div>`;
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
      gameStore.updateTimeline(msg.data.timeline, msg.data.discoveredIds);
      break;

    case 'board:op_applied':
      gameStore.applyBoardOp(msg.data.op);
      break;

    case 'evidence:discovered':
      gameStore.discoverEvidence(msg.data.evidenceId);
      showToast(`Evidence discovered by ${msg.data.discoveredBy}!`);
      playSfx('sfx_evidence_glow');
      break;

    case 'accusation:result':
      if (msg.data.correct) {
        showToast('Correct accusation! Case solved!');
      } else {
        showToast('Wrong accusation. Score penalty applied.');
      }
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
    // Auto-discover first few evidence pieces
    const undiscovered = state.caseData.evidence.filter(e => !state.discoveredEvidenceIds.includes(e.id));
    const toDiscover = undiscovered.slice(0, 3);
    for (const ev of toDiscover) {
      net.discoverEvidence(gameStore.getLobbyId(), ev.id);
    }
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

function showInterview(suspectId: string): void {
  const state = gameStore.getState();
  if (!state) return;
  playMusic('music_interview');

  const overlay = document.getElementById('overlay-container')!;
  renderInterviewScene(overlay, suspectId, state);
}

function hideInterview(): void {
  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = '';
  playMusic('music_investigation');
}

// ─── Sidebar Panels ──────────────────────────────────────────────────────────

function toggleSidebar(panel: 'evidence' | 'suspects' | 'timeline'): void {
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
  }
}

function renderEvidencePanel(el: HTMLElement, state: GameState): void {
  const discovered = state.caseData.evidence.filter(e => state.discoveredEvidenceIds.includes(e.id));
  const undiscovered = state.caseData.evidence.filter(e => !state.discoveredEvidenceIds.includes(e.id));

  el.innerHTML = `
    <div class="panel evidence-panel">
      <h3>Evidence (${discovered.length}/${state.caseData.evidence.length})</h3>
      <div class="evidence-list">
        ${discovered.map(e => `
          <div class="evidence-card ${e.reliability}" data-eid="${e.id}">
            <div class="ev-title">${escHtml(e.title)}</div>
            <div class="ev-desc">${escHtml(e.description)}</div>
            <div class="ev-meta">
              <span class="ev-rel ${e.reliability}">${e.reliability}</span>
              <span class="ev-src">${e.sourceType}</span>
              <span class="ev-conf">Confidence: ${e.confidenceScore}%</span>
            </div>
            <div class="ev-actions">
              <button class="btn btn-xs" data-add-board="${e.id}">Pin to Board</button>
            </div>
          </div>
        `).join('')}
      </div>
      ${undiscovered.length > 0 ? `
        <h4>Undiscovered (${undiscovered.length})</h4>
        <div class="evidence-list">
          ${undiscovered.slice(0, 5).map(e => `
            <div class="evidence-card undiscovered" data-eid="${e.id}">
              <div class="ev-title">??? ${e.sourceType} evidence</div>
              <button class="btn btn-xs" data-discover="${e.id}">Investigate</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

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

// ─── Accusation ──────────────────────────────────────────────────────────────

function showAccusationModal(): void {
  const state = gameStore.getState();
  if (!state) return;

  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div class="modal-overlay">
      <div class="modal accusation-modal">
        <h2>Make an Accusation</h2>
        <p class="muted">Choose carefully — wrong accusations cost 200 points!</p>
        <div class="form-row">
          <label>Suspect</label>
          <select id="acc-suspect" class="input-select">
            ${state.caseData.suspects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Motive</label>
          <input type="text" id="acc-motive" class="input" placeholder="What was their motive?">
        </div>
        <div class="form-row">
          <label>Method</label>
          <input type="text" id="acc-method" class="input" placeholder="How did they do it?">
        </div>
        <div class="form-row">
          <label>Supporting Evidence</label>
          <div class="evidence-checkboxes" id="acc-evidence">
            ${state.caseData.evidence
              .filter(e => state.discoveredEvidenceIds.includes(e.id))
              .map(e => `<label class="check-label"><input type="checkbox" value="${e.id}"> ${escHtml(e.title)}</label>`).join('')}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-danger" id="acc-cancel">Cancel</button>
          <button class="btn btn-play" id="acc-submit">Submit Accusation</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('acc-cancel')!.addEventListener('click', () => { overlay.innerHTML = ''; });
  document.getElementById('acc-submit')!.addEventListener('click', () => {
    const suspectId = (document.getElementById('acc-suspect') as HTMLSelectElement).value;
    const motive = (document.getElementById('acc-motive') as HTMLInputElement).value;
    const method = (document.getElementById('acc-method') as HTMLInputElement).value;
    const checkboxes = document.querySelectorAll('#acc-evidence input:checked');
    const evidenceIds = Array.from(checkboxes).map(cb => (cb as HTMLInputElement).value);

    net.submitAccusation(gameStore.getLobbyId(), suspectId, motive, method, evidenceIds);
    overlay.innerHTML = '';
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

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
