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
import { renderInterviewScene, closeInterviewChat } from '../scenes/interviewScene.js';
import { renderPauseMenu } from '../ui/pauseMenu.js';
import { getLobbyData } from './lobbyScene.js';
import type { ServerMessage, GameState, Player } from '../utils/types.js';

let unsub: (() => void) | null = null;
let storeSub: (() => void) | null = null;
let chatCleanup: (() => void) | null = null;
let pauseVisible = false;
let interviewVoteTimer: ReturnType<typeof setInterval> | null = null;

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
  document.getElementById('btn-accuse')!.addEventListener('click', () => net.initiateAccusation(gameStore.getLobbyId()));

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

    case 'interview:request_leave':
      // Show the leave vote modal for all players when someone requests to end
      showInterviewLeaveVote();
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
        // Add question immediately
        const questionEntry = document.createElement('div');
        questionEntry.className = 'interview-entry asking';
        questionEntry.innerHTML = `
          <div class="entry-bubble investigator">
            <div class="bubble-icon">👤</div>
            <div class="bubble-content">
              <div class="bubble-label">Investigator</div>
              <div class="q">${escHtml(msg.data.question || 'Question')}</div>
            </div>
          </div>
        `;
        logEl.appendChild(questionEntry);
        logEl.scrollTop = logEl.scrollHeight;
        
        // Add answer after delay with typewriter effect
        setTimeout(() => {
          const answerEntry = document.createElement('div');
          answerEntry.className = 'interview-entry response';
          answerEntry.innerHTML = `
            <div class="entry-bubble suspect">
              <div class="bubble-icon">💬</div>
              <div class="bubble-content">
                <div class="bubble-label">Suspect Response</div>
                <div class="a"></div>
              </div>
            </div>
          `;
          logEl.appendChild(answerEntry);
          logEl.scrollTop = logEl.scrollHeight;
          
          // Typewriter effect
          const answerText = msg.data.answer;
          const answerDiv = answerEntry.querySelector('.a') as HTMLDivElement;
          let charIndex = 0;
          const typeSpeed = 30; // ms per character
          
          const typeInterval = setInterval(() => {
            if (charIndex < answerText.length) {
              answerDiv.textContent = answerText.substring(0, charIndex + 1);
              charIndex++;
              logEl.scrollTop = logEl.scrollHeight;
            } else {
              clearInterval(typeInterval);
            }
          }, typeSpeed);
        }, 1200); // 1.2 second delay before response starts
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
      refreshCurrentPanel();
      break;

    case 'accusation:vote_status':
      // This is no longer used, vote status is tracked in accusation:final_votes
      break;

    case 'accusation:opened':
      (globalThis as any).accusationInitiatorId = msg.data.initiatorId;
      (globalThis as any).accusationFinalVote = undefined; // Reset vote status
      gameStore.setState({ ...gameStore.getState()!, accusationDraft: msg.data.draft, accusationFinalVotes: {} });
      showCollaborativeAccusation(msg.data.initiatorId, msg.data.draft);
      break;

    case 'accusation:draft_update':
      updateAccusationDraft(msg.data);
      break;

    case 'accusation:final_votes':
      updateAccusationFinalVotes(msg.data.votes, msg.data.needed);
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

  // Clear any existing timer
  if (interviewVoteTimer) {
    clearInterval(interviewVoteTimer);
    interviewVoteTimer = null;
  }

  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div class="modal-overlay interview-vote-overlay" id="interview-vote-overlay">
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
  let hasAutoVoted = false;
  interviewVoteTimer = setInterval(() => {
    remaining--;
    const timerEl = document.getElementById('vote-timer');
    if (timerEl) timerEl.textContent = `${remaining}s remaining`;
    if (remaining <= 0) {
      if (interviewVoteTimer) clearInterval(interviewVoteTimer);
      interviewVoteTimer = null;
      // Auto-vote no if didn't vote (only once)
      if (!hasAutoVoted) {
        hasAutoVoted = true;
        const yesBtn = document.getElementById('vote-yes') as HTMLButtonElement;
        const noBtn = document.getElementById('vote-no') as HTMLButtonElement;
        // Only auto-vote if buttons are still enabled (player hasn't voted)
        if (yesBtn && !yesBtn.disabled) {
          net.voteInterview(gameStore.getLobbyId(), false);
          disableVoteButtons();
        }
      }
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
  const voteValues = Object.values(votes);
  const count = voteValues.filter(v => v).length;
  
  // If votes are empty (reset after someone voted no or timeout), remove the modal and clear timer
  if (voteValues.length === 0) {
    const existingOverlay = document.getElementById('interview-vote-overlay');
    if (existingOverlay) existingOverlay.remove();
    if (interviewVoteTimer) {
      clearInterval(interviewVoteTimer);
      interviewVoteTimer = null;
    }
    return;
  }
  
  const el = document.getElementById('vote-status');
  if (el) {
    el.textContent = `${count}/${needed} votes`;
  }
}

function updateInterviewLeaveVote(votes: Record<string, boolean>, needed: number): void {
  const voteValues = Object.values(votes);
  const count = voteValues.filter(v => v).length;
  
  // If votes are empty (reset after someone voted no), remove the modal
  if (voteValues.length === 0) {
    const existingOverlay = document.getElementById('interview-leave-vote-overlay');
    if (existingOverlay) existingOverlay.remove();
    return;
  }
  
  // Show the modal if it doesn't exist yet
  if (!document.getElementById('interview-leave-vote-overlay')) {
    showInterviewLeaveVote();
  }
  
  const el = document.getElementById('leave-vote-status');
  if (el) {
    el.textContent = `${count}/${needed} agreed to leave`;
  }
  
  // If player already voted, disable buttons
  const playerId = gameStore.getPlayerId();
  if (votes[playerId] !== undefined) {
    const yesBtn = document.getElementById('vote-leave-yes') as HTMLButtonElement;
    const noBtn = document.getElementById('vote-leave-no') as HTMLButtonElement;
    if (yesBtn) yesBtn.disabled = true;
    if (noBtn) noBtn.disabled = true;
  }
}

function showInterview(suspectId: string): void {
  const state = gameStore.getState();
  if (!state) return;
  playMusic('music_interview');

  const overlay = document.getElementById('overlay-container')!;
  renderInterviewScene(overlay, suspectId, state);
  
  // Setup voting to leave interview - send message so all players see the vote modal
  (window as any).requestInterviewEnd = () => {
    // Send message to server to initiate the vote for all players
    net.sendRaw({ type: 'interview:request_leave', data: { lobbyId: gameStore.getLobbyId() } });
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
      // Don't remove locally - wait for server to send update with reset votes
      yesBtn.disabled = true;
      noBtn.disabled = true;
    });
  }
}

function hideInterview(): void {
  closeInterviewChat();
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

function refreshCurrentPanel(): void {
  const el = document.getElementById('sidebar-panel');
  if (!el || el.style.display === 'none') return;
  
  const currentPanel = el.getAttribute('data-panel') as 'evidence' | 'suspects' | 'timeline' | 'players' | null;
  if (!currentPanel) return;

  const state = gameStore.getState();
  if (!state) return;

  switch (currentPanel) {
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

function getLobbyPlayerCount(): number {
  // Get from lobby state if available, fallback to 1
  const lobbyData = (globalThis as any).lobbyData;
  return lobbyData?.players?.length || 1;
}

function showCollaborativeAccusation(initiatorId: string, draft: { suspectId: string; motive: string; method: string; evidenceIds: string[] }): void {
  const state = gameStore.getState();
  if (!state) return;

  const playerId = (globalThis as any).clientPlayerId || '';
  const initiatorName = state.players?.find(p => p.id === initiatorId)?.displayName || 'A player';
  const playerVote = (globalThis as any).accusationFinalVote;
  const finalVotes = state.accusationFinalVotes || {};
  const totalPlayers = state.players?.length || 1;

  // Count votes
  const submitVotes = Object.values(finalVotes).filter(v => v === 'submit').length;
  const cancelVotes = Object.values(finalVotes).filter(v => v === 'cancel').length;
  const pendingVotes = totalPlayers - Object.keys(finalVotes).length;

  const overlay = document.getElementById('overlay-container')!;
  overlay.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="width: 90%; max-width: 700px; max-height: 90vh; background: #1a1a1a; 
                  border: 2px solid var(--accent); border-radius: 8px; padding: 24px; 
                  overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
        <h2 style="margin: 0 0 8px 0; color: var(--accent);">🎯 Final Accusation</h2>
        <p style="margin: 0 0 20px 0; color: var(--text-muted); font-size: 14px;">
          ${escHtml(initiatorName)} initiated the accusation. All investigators can edit the details and vote.
        </p>

        <!-- Form Section -->
        <form id="accusation-form" style="margin-bottom: 24px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--text); font-weight: 600;">Who is the culprit?</label>
            <select id="acc-suspect" style="width: 100%; padding: 8px; background: #2a2a2a; color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-size: 14px;">
              ${state.caseData.suspects.map(s => `<option value="${s.id}" ${s.id === draft.suspectId ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('')}
            </select>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--text); font-weight: 600;">What was their motive?</label>
            <select id="acc-motive" style="width: 100%; padding: 8px; background: #2a2a2a; color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-size: 14px;">
              <option value="">— Choose a motive —</option>
              <option value="Money / Financial Gain" ${draft.motive === 'Money / Financial Gain' ? 'selected' : ''}>Money / Financial Gain</option>
              <option value="Revenge / Jealousy" ${draft.motive === 'Revenge / Jealousy' ? 'selected' : ''}>Revenge / Jealousy</option>
              <option value="Self-Defense / Protection" ${draft.motive === 'Self-Defense / Protection' ? 'selected' : ''}>Self-Defense / Protection</option>
              <option value="Crime of Passion" ${draft.motive === 'Crime of Passion' ? 'selected' : ''}>Crime of Passion</option>
              <option value="Greed / Inheritance" ${draft.motive === 'Greed / Inheritance' ? 'selected' : ''}>Greed / Inheritance</option>
            </select>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--text); font-weight: 600;">How did they commit the crime?</label>
            <select id="acc-method" style="width: 100%; padding: 8px; background: #2a2a2a; color: var(--text); border: 1px solid var(--border); border-radius: 4px; font-size: 14px;">
              <option value="">— Choose a method —</option>
              <option value="Poison" ${draft.method === 'Poison' ? 'selected' : ''}>Poison</option>
              <option value="Blunt Force Trauma" ${draft.method === 'Blunt Force Trauma' ? 'selected' : ''}>Blunt Force Trauma</option>
              <option value="Stabbing" ${draft.method === 'Stabbing' ? 'selected' : ''}>Stabbing</option>
              <option value="Shooting" ${draft.method === 'Shooting' ? 'selected' : ''}>Shooting</option>
              <option value="Accident / Negligence" ${draft.method === 'Accident / Negligence' ? 'selected' : ''}>Accident / Negligence</option>
            </select>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--text); font-weight: 600;">Supporting Evidence (Optional)</label>
            <div id="acc-evidence" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              ${state.caseData.evidence
                .filter(e => state.discoveredEvidenceIds.includes(e.id))
                .map(e => `<label style="display: flex; align-items: center; color: var(--text); cursor: pointer; font-size: 13px;">
                  <input type="checkbox" value="${e.id}" ${draft.evidenceIds.includes(e.id) ? 'checked' : ''} style="margin-right: 6px; cursor: pointer;"> 
                  ${escHtml(e.title)}
                </label>`).join('')}
            </div>
          </div>
        </form>

        <!-- Vote Section at Bottom -->
        <div style="border-top: 1px solid var(--border); padding-top: 20px; padding-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; font-size: 13px;">
            <div style="padding: 12px; background: #2a2a2a; border-radius: 4px; border-left: 3px solid #4CAF50; text-align: center;">
              <div style="color: var(--accent); font-weight: 700; font-size: 18px;">${submitVotes}</div>
              <div style="color: var(--text-muted);">Vote to Submit</div>
            </div>
            <div style="padding: 12px; background: #2a2a2a; border-radius: 4px; border-left: 3px solid #f44336; text-align: center;">
              <div style="color: var(--accent); font-weight: 700; font-size: 18px;">${cancelVotes}</div>
              <div style="color: var(--text-muted);">Vote to Cancel</div>
            </div>
          </div>
          <div style="padding: 12px; background: #252525; border-radius: 4px; text-align: center; color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            ${pendingVotes} investigator${pendingVotes !== 1 ? 's' : ''} pending
          </div>

          <!-- Vote Buttons -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <button id="acc-cancel" style="padding: 10px; background: #2a2a2a; color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s;">
              Close
            </button>
            <button id="acc-vote-submit" style="padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; ${playerVote === 'submit' ? 'opacity: 0.5; cursor: not-allowed;' : 'hover {background: #45a049;}'}"
              ${playerVote === 'submit' ? 'disabled' : ''}>
              ${playerVote === 'submit' ? '✓ Voted Submit' : 'Vote Submit'}
            </button>
            <button id="acc-vote-cancel" style="padding: 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; ${playerVote === 'cancel' ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
              ${playerVote === 'cancel' ? 'disabled' : ''}>
              ${playerVote === 'cancel' ? '✓ Voted Cancel' : 'Vote Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Set up event listeners for form changes
  const suspectSelect = document.getElementById('acc-suspect') as HTMLSelectElement;
  const motiveSelect = document.getElementById('acc-motive') as HTMLSelectElement;
  const methodSelect = document.getElementById('acc-method') as HTMLSelectElement;
  const evidenceCheckboxes = document.querySelectorAll('#acc-evidence input[type="checkbox"]');

  const updateOnChange = () => {
    const newDraft = {
      suspectId: suspectSelect?.value || draft.suspectId,
      motive: motiveSelect?.value || draft.motive,
      method: methodSelect?.value || draft.method,
      evidenceIds: Array.from(evidenceCheckboxes)
        .filter((cb: Element) => (cb as HTMLInputElement).checked)
        .map((cb: Element) => (cb as HTMLInputElement).value),
    };
    net.updateAccusationDraft(gameStore.getLobbyId(), newDraft);
  };

  suspectSelect?.addEventListener('change', updateOnChange);
  motiveSelect?.addEventListener('change', updateOnChange);
  methodSelect?.addEventListener('change', updateOnChange);
  evidenceCheckboxes.forEach(cb => cb.addEventListener('change', updateOnChange));

  // Close button
  const closeBtn = document.getElementById('acc-cancel');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      net.cancelAccusationVote(gameStore.getLobbyId());
      const overlay = document.getElementById('overlay-container');
      if (overlay) overlay.innerHTML = '';
      (globalThis as any).accusationFinalVote = undefined;
    });
  }

  // Vote to submit button
  const voteSubmitBtn = document.getElementById('acc-vote-submit');
  if (voteSubmitBtn) {
    voteSubmitBtn.addEventListener('click', () => {
      net.voteOnAccusation(gameStore.getLobbyId(), 'submit');
      (globalThis as any).accusationFinalVote = 'submit';
      showCollaborativeAccusation(initiatorId, draft);
    });
  }

  // Vote to cancel button
  const voteCancelBtn = document.getElementById('acc-vote-cancel');
  if (voteCancelBtn) {
    voteCancelBtn.addEventListener('click', () => {
      net.voteOnAccusation(gameStore.getLobbyId(), 'cancel');
      (globalThis as any).accusationFinalVote = 'cancel';
      showCollaborativeAccusation(initiatorId, draft);
    });
  }
}

function updateAccusationDraft(draft: { suspectId: string; motive: string; method: string; evidenceIds: string[] }): void {
  // Update the form elements in real-time as other players edit
  const suspectSelect = document.getElementById('acc-suspect') as HTMLSelectElement;
  const motiveSelect = document.getElementById('acc-motive') as HTMLSelectElement;
  const methodSelect = document.getElementById('acc-method') as HTMLSelectElement;

  if (suspectSelect) suspectSelect.value = draft.suspectId;
  if (motiveSelect) motiveSelect.value = draft.motive;
  if (methodSelect) methodSelect.value = draft.method;

  // Update checkboxes
  const evidenceCheckboxes = document.querySelectorAll('#acc-evidence input[type="checkbox"]');
  evidenceCheckboxes.forEach(cb => {
    (cb as HTMLInputElement).checked = draft.evidenceIds.includes((cb as HTMLInputElement).value);
  });
}

function updateAccusationFinalVotes(votes: Record<string, 'submit' | 'cancel'>, needed: number): void {
  // Update the vote counts at bottom of accusation modal
  const submitCount = Object.values(votes).filter(v => v === 'submit').length;
  const cancelCount = Object.values(votes).filter(v => v === 'cancel').length;
  const pendingCount = needed - Object.keys(votes).length;

  // Update vote displays if they exist
  const voteCountElements = document.querySelectorAll('#acc-vote-submit, #acc-vote-cancel');
  
  // Force re-render the entire accusation screen if it's open
  const form = document.getElementById('accusation-form');
  if (form) {
    // Get the current draft from state
    const state = gameStore.getState();
    if (state && state.accusationDraft) {
      // Find the initiator ID (it's the one who started it, could be in state)
      const initiatorId = (globalThis as any).accusationInitiatorId || '';
      showCollaborativeAccusation(initiatorId, state.accusationDraft);
    }
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
