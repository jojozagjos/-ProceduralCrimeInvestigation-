// ─── Timeline Panel ──────────────────────────────────────────────────────────

import { gameStore } from '../core/gameStore.js';
import * as net from '../network/client.js';
import type { GameState, TimelineEvent } from '../utils/types.js';

export function renderTimeline(container: HTMLElement, state: GameState): void {
  const timeline = state.caseData.timeline;
  const discoveredIds = state.discoveredTimelineIds;

  container.innerHTML = `
    <div class="panel timeline-panel">
      <h3>Timeline</h3>
      <div class="timeline-phases">
        <span class="phase-label ${state.timePhase === 'evening' ? 'active' : ''}">Evening</span>
        <span class="phase-label ${state.timePhase === 'late_night' ? 'active' : ''}">Late Night</span>
        <span class="phase-label ${state.timePhase === 'early_morning' ? 'active' : ''}">Early Morning</span>
      </div>
      <div class="timeline-events">
        ${timeline.map(evt => {
          const discovered = discoveredIds.includes(evt.id);
          return `
            <div class="timeline-event ${discovered ? 'discovered' : 'hidden'} phase-${evt.phase}">
              <div class="tl-time">${evt.time}</div>
              <div class="tl-dot"></div>
              <div class="tl-content">
                ${discovered
                  ? `<p>${escHtml(evt.description)}</p>`
                  : `<p class="muted">??? Undiscovered event</p>
                     <button class="btn btn-xs" data-tl-discover="${evt.id}">Investigate</button>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-tl-discover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId = (btn as HTMLElement).getAttribute('data-tl-discover')!;
      net.sendTimelineOp(gameStore.getLobbyId(), eventId);
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
