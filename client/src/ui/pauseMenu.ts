// ─── Pause Menu ──────────────────────────────────────────────────────────────

import { navigateTo } from '../core/sceneManager.js';
import { gameStore } from '../core/gameStore.js';
import * as net from '../network/client.js';
import { showToast } from '../ui/toast.js';

export function renderPauseMenu(container: HTMLElement, onResume: () => void): void {
  container.innerHTML = `
    <div class="pause-overlay">
      <div class="pause-menu">
        <h2>Paused</h2>
        <button class="btn btn-play" id="pause-resume">Resume</button>
        <button class="btn btn-secondary" id="pause-settings">Settings</button>
        <button class="btn btn-secondary" id="pause-howto">How to Play</button>
        <button class="btn btn-danger" id="pause-leave">Leave Game</button>
      </div>
    </div>
  `;

  document.getElementById('pause-resume')!.addEventListener('click', onResume);

  document.getElementById('pause-settings')!.addEventListener('click', () => {
    onResume();
    navigateTo('settings');
  });

  document.getElementById('pause-howto')!.addEventListener('click', () => {
    showHowToPlay(container);
  });

  document.getElementById('pause-leave')!.addEventListener('click', () => {
    const lobbyId = gameStore.getLobbyId();
    if (lobbyId) net.leaveLobby(lobbyId);
    gameStore.clear();
    net.disconnect();
    showToast('Left game');
    onResume();
    navigateTo('play');
  });
}

function showHowToPlay(container: HTMLElement): void {
  container.innerHTML = `
    <div class="pause-overlay">
      <div class="pause-menu howto">
        <h2>How to Play</h2>
        <ul>
          <li><strong>Pan:</strong> Shift+click or middle-click drag on board</li>
          <li><strong>Zoom:</strong> Mouse wheel on board</li>
          <li><strong>Pin evidence:</strong> Open Evidence panel → Pin to Board</li>
          <li><strong>Create note:</strong> Click 📝 Note on the board toolbar</li>
          <li><strong>Edit card:</strong> Click a card on board, then use editor panel on right</li>
          <li><strong>Draw:</strong> In card editor, use the drawing canvas</li>
          <li><strong>Connect cards:</strong> Click 🔗 Connect, then click two cards</li>
          <li><strong>Interview:</strong> Open Suspects panel → Request Interview</li>
          <li><strong>Accuse:</strong> Click Accuse button when ready</li>
          <li><strong>Timeline:</strong> Open Timeline panel to see events</li>
          <li><strong>Chat:</strong> Click 💬 Chat to communicate</li>
          <li><strong>Pause:</strong> Press Escape</li>
        </ul>
        <button class="btn btn-play" id="howto-back">Back</button>
      </div>
    </div>
  `;

  document.getElementById('howto-back')!.addEventListener('click', () => {
    renderPauseMenu(container, () => { container.innerHTML = ''; container.style.display = 'none'; });
  });
}
