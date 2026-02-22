// ─── Timeline Panel ──────────────────────────────────────────────────────────

import { gameStore } from '../core/gameStore.js';
import * as net from '../network/client.js';
import { playSfx } from '../core/audioManager.js';
import type { GameState, TimelineEvent } from '../utils/types.js';

export function renderTimeline(container: HTMLElement, state: GameState): void {
  const timeline = state.caseData.timeline;
  const discoveredIds = state.discoveredTimelineIds;
  const discoveredCount = timeline.filter(t => discoveredIds.includes(t.id)).length;
  const totalCount = timeline.length;

  container.innerHTML = `
    <div class="panel timeline-panel">
      <div class="timeline-header">
        <h3>Timeline of Events</h3>
        <div class="timeline-progress">
          <div class="timeline-progress-bar" style="width: ${(discoveredCount / totalCount) * 100}%"></div>
          <span class="timeline-progress-text">${discoveredCount}/${totalCount} events</span>
        </div>
      </div>
      <div class="timeline-phases">
        <span class="phase-label ${state.timePhase === 'evening' ? 'active' : ''}">
          🌆 Evening
        </span>
        <span class="phase-label ${state.timePhase === 'late_night' ? 'active' : ''}">
          🌙 Late Night
        </span>
        <span class="phase-label ${state.timePhase === 'early_morning' ? 'active' : ''}">
          🌅 Early Morning
        </span>
      </div>
      <div class="timeline-events">
        ${timeline.map((evt, index) => {
          const discovered = discoveredIds.includes(evt.id);
          const suspects = state.caseData.suspects.filter(s => evt.relatedSuspectIds.includes(s.id));
          const evidence = state.caseData.evidence.filter(e => evt.relatedEvidenceIds.includes(e.id));
          const isCurrentPhase = evt.phase === state.timePhase;
          
          return `
            <div class="timeline-event ${discovered ? 'discovered' : 'hidden'} ${isCurrentPhase ? 'current-phase' : ''} phase-${evt.phase}" 
                 data-event-id="${evt.id}" 
                 style="animation-delay: ${index * 0.05}s">
              <div class="tl-time">${evt.time}</div>
              <div class="tl-dot"></div>
              <div class="tl-content">
                ${discovered
                  ? `
                    <p class="tl-description">${escHtml(evt.description)}</p>
                    ${suspects.length > 0 || evidence.length > 0 ? `
                      <div class="tl-relations">
                        ${suspects.length > 0 ? `
                          <div class="tl-suspects">
                            <span class="tl-label">Involves:</span>
                            ${suspects.map(s => `<span class="tl-suspect-tag">${escHtml(s.name)}</span>`).join('')}
                          </div>
                        ` : ''}
                        ${evidence.length > 0 && state.discoveredEvidenceIds.some(id => evt.relatedEvidenceIds.includes(id)) ? `
                          <div class="tl-evidence">
                            <span class="tl-label">Evidence:</span>
                            ${evidence.filter(e => state.discoveredEvidenceIds.includes(e.id))
                              .map(e => `<span class="tl-evidence-tag">${escHtml(e.title)}</span>`).join('')}
                          </div>
                        ` : ''}
                      </div>
                    ` : ''}
                  `
                  : `
                    <p class="tl-undiscovered">
                      <span class="tl-mystery-icon">❓</span>
                      Unknown event
                    </p>
                    <button class="btn btn-xs btn-discover" data-tl-discover="${evt.id}">
                      🔍 Investigate (Cost: 10pts)
                    </button>
                  `
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="timeline-hint">
        <small class="muted">💡 Time progresses automatically. New events unlock as the night unfolds.</small>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-tl-discover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId = (btn as HTMLElement).getAttribute('data-tl-discover')!;
      net.sendTimelineOp(gameStore.getLobbyId(), eventId);
      playSfx('sfx_ui_click');
      
      // Animate the discovery
      const eventEl = container.querySelector(`[data-event-id="${eventId}"]`);
      if (eventEl) {
        eventEl.classList.add('discovering');
        setTimeout(() => {
          eventEl.classList.remove('discovering');
        }, 600);
      }
    });
  });

  // Auto-refresh on store changes
  const unsub = gameStore.subscribe(() => {
    const newState = gameStore.getState();
    if (newState && container.querySelector('.timeline-panel')) {
      renderTimeline(container, newState);
      unsub();
    }
  });
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
