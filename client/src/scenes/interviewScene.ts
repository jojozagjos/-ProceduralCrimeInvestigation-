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
    <div class="modal-overlay interview-overlay">
      <div class="interview-scene">
        <div class="interview-header">
          <img class="interview-portrait" src="${suspect.avatarUrl}" alt="${escHtml(suspect.name)}" />
          <div class="interview-suspect-info">
            <h2>${escHtml(suspect.name)}</h2>
            <p>${escHtml(suspect.occupation)} · ${suspect.age} years old</p>
            <p class="muted">${escHtml(suspect.personality)}</p>
          </div>
        </div>

        <div class="interview-body">
          <div class="interview-log" id="interview-log">
            <div class="interview-entry system">
              <em>Interview with ${escHtml(suspect.name)} has begun. Choose a line of questioning.</em>
            </div>
          </div>

          <div class="interview-questions">
            <h4>Ask about:</h4>
            <div class="question-buttons" id="question-buttons">
              ${INTERVIEW_CATEGORIES.filter(c => c.id !== 'explain_evidence').map(c => `
                <button class="btn btn-question" data-cat="${c.id}">${c.label}</button>
              `).join('')}
            </div>

            ${discoveredEvidence.length > 0 ? `
              <div class="evidence-ask">
                <h4>Explain this evidence:</h4>
                <select id="evidence-select" class="input-select">
                  <option value="">— Select evidence —</option>
                  ${discoveredEvidence.map(e => `<option value="${e.id}">${escHtml(e.title)}</option>`).join('')}
                </select>
                <button class="btn btn-sm" id="btn-ask-evidence">Ask</button>
              </div>
            ` : ''}

            <button class="btn btn-danger" id="btn-end-interview" style="margin-top:1rem;">End Interview</button>
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
  entry.innerHTML = `<div class="q">Asking: ${cat?.label || category}${evidenceId ? ' (showing evidence)' : ''}...</div>`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
