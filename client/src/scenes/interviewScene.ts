// ─── Interview Scene ─────────────────────────────────────────────────────────

import { gameStore } from '../core/gameStore.js';
import * as net from '../network/client.js';
import { INTERVIEW_CATEGORIES } from '../utils/types.js';
import type { GameState, InterviewCategory, Evidence } from '../utils/types.js';

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
      
      <button class="interview-exit-btn" id="btn-end-interview" title="End Interview">
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

            ${discoveredEvidence.length > 0 ? `
              <div class="evidence-ask">
                <h4>🔬 Present Evidence</h4>
                <div class="evidence-ask-controls">
                  <select id="evidence-select" class="input-select evidence-select">
                    <option value="">— Select evidence to present —</option>
                    ${discoveredEvidence.map(e => `<option value="${e.id}">${escHtml(e.title)}</option>`).join('')}
                  </select>
                  <button class="btn btn-evidence" id="btn-ask-evidence">Present</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // Question buttons
  document.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = (btn as HTMLElement).getAttribute('data-cat') as InterviewCategory;
      addQuestionToLog(cat);
      net.sendInterviewAnswer(gameStore.getLobbyId(), cat);
    });
  });

  // Evidence question
  const askEvBtn = document.getElementById('btn-ask-evidence');
  if (askEvBtn) {
    askEvBtn.addEventListener('click', () => {
      const sel = document.getElementById('evidence-select') as HTMLSelectElement;
      const evidenceId = sel.value;
      if (evidenceId) {
        addQuestionToLog('explain_evidence', evidenceId);
        net.sendInterviewAnswer(gameStore.getLobbyId(), 'explain_evidence', evidenceId);
      }
    });
  }

  // End interview
  document.getElementById('btn-end-interview')!.addEventListener('click', () => {
    net.endInterview(gameStore.getLobbyId());
  });
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
