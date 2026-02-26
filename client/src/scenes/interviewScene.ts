// ─── Interview Scene ─────────────────────────────────────────────────────────

import { gameStore } from '../core/gameStore.js';
import * as net from '../network/client.js';
import { renderChat } from '../chat/chatWidget.js';
import { INTERVIEW_CATEGORIES } from '../utils/types.js';
import type { GameState, InterviewCategory, Evidence } from '../utils/types.js';

let chatCleanup: (() => void) | null = null;

export function renderInterviewScene(
  container: HTMLElement,
  suspectId: string,
  state: GameState
): void {
  const suspect = state.caseData.suspects.find(s => s.id === suspectId);
  if (!suspect) return;

  const discoveredEvidence = state.caseData.evidence.filter(
    e => state.discoveredEvidenceIds.includes(e.id)
  );

  container.innerHTML = `
    <div class="interview-fullscreen">
      <div class="interview-background"></div>
      
      <button class=\"interview-exit-btn\" id=\"btn-end-interview\" title=\"Vote to end interview\">
        <span>✕</span>
      </button>

      <div class="interview-content">
        <div class="interview-left">
          <div class="interview-portrait-container">
            <div class="portrait-glow"></div>
            <img class="interview-portrait" src="${suspect.avatarUrl}" alt="${escHtml(suspect.name)}" />
          </div>
          
          <div class="interview-suspect-info">
            <h2 class="suspect-name">${escHtml(suspect.name)}</h2>
            <p class="suspect-details">${escHtml(suspect.occupation)}</p>
            <p class="suspect-age">${suspect.age} years old</p>
            <div class="suspect-personality">
              <span class="personality-badge">${escHtml(suspect.personality)}</span>
            </div>
          </div>
          
          <div id="interview-chat-area" style="margin-top: 20px; flex: 1; min-height: 150px; border-top: 1px solid #ddd; padding-top: 10px;"></div>
        </div>

        <div class="interview-right">
          <div class="interview-log-container">
            <div class="interview-log-header">
              <h3>Interview Transcript</h3>
              <div class="recording-indicator">
                <span class="rec-dot"></span>
                <span class="rec-text">Recording</span>
              </div>
            </div>
            <div class="interview-log" id="interview-log">
              <div class="interview-entry system">
                <span class="system-icon">📋</span>
                <em>Interview with ${escHtml(suspect.name)} has begun. Choose a line of questioning.</em>
              </div>
            </div>
          </div>

          <div class="interview-questions">
            <div class="questions-header">
              <h4>🔍 Line of Questioning</h4>
            </div>
            <div class="question-buttons" id="question-buttons">
              ${INTERVIEW_CATEGORIES.filter(c => c.id !== 'explain_evidence').map(c => `
                <button class="btn btn-question" data-cat="${c.id}">
                  <span class="q-icon">💬</span>
                  <span class="q-text">${c.label}</span>
                </button>
              `).join('')}
            </div>
            
            <div class="interview-actions">
              <button class="btn btn-sm" id="btn-vote-leave-interview" title="Vote to end interview (requires all players to agree)">🚪 Vote to Leave</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Question buttons
  document.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = (btn as HTMLElement).getAttribute('data-cat') as InterviewCategory;
      if (cat) {
        net.sendInterviewAnswer(gameStore.getLobbyId(), cat);
      }
    });
  });

  // Vote to leave interview
  const voteLeaveBtn = document.getElementById('btn-vote-leave-interview');
  if (voteLeaveBtn) {
    voteLeaveBtn.addEventListener('click', () => {
      (window as any).requestInterviewEnd?.();
    });
  }

  // Exit/vote to leave button
  const endBtn = document.getElementById('btn-end-interview');
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      (window as any).requestInterviewEnd?.();
    });
  }

  // Render chat
  const chatArea = document.getElementById('interview-chat-area');
  console.log('[Interview] Chat area element:', chatArea);
  console.log('[Interview] Lobby ID:', gameStore.getLobbyId());
  if (chatArea) {
    chatCleanup = renderChat(chatArea, gameStore.getLobbyId(), false);
    console.log('[Interview] Chat widget rendered successfully');
  } else {
    console.error('[Interview] Chat area element not found!');
  }
}

export function closeInterviewChat(): void {
  if (chatCleanup) {
    chatCleanup();
    chatCleanup = null;
  }
}

function addQuestionToLog(category: InterviewCategory, evidenceId?: string): void {
  const logEl = document.getElementById('interview-log');
  if (!logEl) return;
  const cat = INTERVIEW_CATEGORIES.find(c => c.id === category);
  const entry = document.createElement('div');
  entry.className = 'interview-entry asking';
  entry.innerHTML = `
    <div class="entry-bubble investigator">
      <div class="bubble-icon">👤</div>
      <div class="bubble-content">
        <div class="bubble-label">Investigator</div>
        <div class="q">${cat?.label || category}${evidenceId ? ' (presenting evidence)' : ''}</div>
      </div>
    </div>
  `;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
