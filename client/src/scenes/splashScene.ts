// ─── Splash Screen Scene ──────────────────────────────────────────────────────
// Initial click-to-continue splash to enable audio and set user intent

import { navigateTo } from '../core/sceneManager.js';

export function renderSplashScene(container: HTMLElement): void {
  container.innerHTML = `
    <div class="splash-container">
      <div class="splash-content">
        <h1 class="splash-title">Private Investigator</h1>
        <p class="splash-subtitle">A Procedural Crime Investigation</p>
        <div class="splash-click-prompt">
          <p>Click anywhere to continue</p>
          <div class="splash-click-indicator">⬇</div>
        </div>
      </div>
    </div>
  `;

  const container_el = container.querySelector('.splash-container') as HTMLElement;
  
  const handleClick = () => {
    container_el.removeEventListener('click', handleClick);
    document.removeEventListener('keydown', handleKeydown);
    navigateTo('main-menu', false);
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      container_el.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
      navigateTo('main-menu', false);
    }
  };

  container_el.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
}
