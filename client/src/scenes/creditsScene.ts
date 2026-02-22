// ─── Credits Scene ───────────────────────────────────────────────────────────

import { goBack } from '../core/sceneManager.js';

export function renderCreditsScene(container: HTMLElement): void {
  container.innerHTML = `
    <div class="credits-screen">
      <div class="credits-header">
        <h2>Credits</h2>
        <button class="btn btn-back" id="btn-credits-back">← Back</button>
      </div>
      <div class="credits-content">
        <div class="credits-section">
          <h3>Private Investigator</h3>
          <p>A Procedural Crime Investigation Game</p>
          <p>Version 1.0.0</p>
        </div>
        <div class="credits-section">
          <h3>Technology</h3>
          <ul>
            <li>TypeScript + Vite</li>
            <li>PixiJS — 2D Rendering</li>
            <li>Node.js + Express + ws</li>
            <li>seedrandom — Deterministic RNG</li>
            <li>@faker-js/faker — Procedural data</li>
            <li>zod — Schema validation</li>
            <li>nanoid — ID generation</li>
          </ul>
        </div>
        <div class="credits-section">
          <h3>Art & Assets</h3>
          <ul>
            <li>DiceBear Avatars — <a href="https://dicebear.com" target="_blank" rel="noopener">dicebear.com</a></li>
            <li>Pexels (optional) — <a href="https://www.pexels.com" target="_blank" rel="noopener">Photos provided by Pexels</a></li>
            <li>Unsplash (optional) — <a href="https://unsplash.com" target="_blank" rel="noopener">unsplash.com</a></li>
          </ul>
        </div>
        <div class="credits-section">
          <h3>Audio</h3>
          <p class="muted">Audio files are placeholders. Replace with your own music and SFX.</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-credits-back')!.addEventListener('click', () => goBack());
}
