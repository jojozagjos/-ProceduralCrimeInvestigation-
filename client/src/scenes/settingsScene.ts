// ─── Settings Scene ──────────────────────────────────────────────────────────

import { goBack } from '../core/sceneManager.js';
import { getSettings, saveSettings, loadSettings } from '../utils/settings.js';
import { updateMusicVolume, setMute } from '../core/audioManager.js';

export function renderSettingsScene(container: HTMLElement): void {
  const s = loadSettings();

  container.innerHTML = `
    <div class="settings-screen">
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="btn btn-back" id="btn-settings-back">← Back</button>
      </div>

      <div class="settings-body">
        <div class="settings-section">
          <h3>Display</h3>
          <div class="form-row">
            <label>Display Name</label>
            <input type="text" id="set-name" class="input" value="${escHtml(s.displayName)}" maxlength="30">
          </div>
          <div class="form-row">
            <label>Film Grain</label>
            <label class="toggle"><input type="checkbox" id="set-grain" ${s.filmGrain ? 'checked' : ''}><span class="toggle-slider"></span></label>
          </div>
          <div class="form-row">
            <label>Vignette</label>
            <label class="toggle"><input type="checkbox" id="set-vignette" ${s.vignette ? 'checked' : ''}><span class="toggle-slider"></span></label>
          </div>
          <div class="form-row">
            <label>Reduced Motion</label>
            <label class="toggle"><input type="checkbox" id="set-motion" ${s.reducedMotion ? 'checked' : ''}><span class="toggle-slider"></span></label>
          </div>
        </div>

        <div class="settings-section">
          <h3>Audio</h3>
          <div class="form-row">
            <label>Mute All</label>
            <label class="toggle"><input type="checkbox" id="set-mute" ${s.muteAll ? 'checked' : ''}><span class="toggle-slider"></span></label>
          </div>
          <div class="form-row">
            <label>Ambient Volume</label>
            <input type="range" id="set-ambient" min="0" max="1" step="0.05" value="${s.ambientVolume}" class="slider">
            <span id="ambient-val">${Math.round(s.ambientVolume * 100)}%</span>
          </div>
          <div class="form-row">
            <label>Music Volume</label>
            <input type="range" id="set-music" min="0" max="1" step="0.05" value="${s.musicVolume}" class="slider">
            <span id="music-val">${Math.round(s.musicVolume * 100)}%</span>
          </div>
          <div class="form-row">
            <label>SFX Volume</label>
            <input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${s.sfxVolume}" class="slider">
            <span id="sfx-val">${Math.round(s.sfxVolume * 100)}%</span>
          </div>
        </div>

        <div class="settings-section">
          <h3>Photo Credits</h3>
          <p class="muted">Fallback avatars provided by <a href="https://dicebear.com" target="_blank" rel="noopener">DiceBear</a></p>
          <p class="muted">If configured: <a href="https://www.pexels.com" target="_blank" rel="noopener">Photos provided by Pexels</a></p>
          <p class="muted">If configured: Photos from <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a> with attribution</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-settings-back')!.addEventListener('click', () => {
    applySettings();
    goBack();
  });

  // Real-time slider labels
  const sliders: [string, string][] = [['set-ambient', 'ambient-val'], ['set-music', 'music-val'], ['set-sfx', 'sfx-val']];
  for (const [sliderId, labelId] of sliders) {
    document.getElementById(sliderId)!.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById(labelId)!.textContent = `${Math.round(val * 100)}%`;
    });
  }

  // Mute toggle
  document.getElementById('set-mute')!.addEventListener('change', (e) => {
    const muted = (e.target as HTMLInputElement).checked;
    setMute(muted);
  });
}

function applySettings(): void {
  saveSettings({
    displayName: (document.getElementById('set-name') as HTMLInputElement)?.value || '',
    filmGrain: (document.getElementById('set-grain') as HTMLInputElement)?.checked ?? true,
    vignette: (document.getElementById('set-vignette') as HTMLInputElement)?.checked ?? true,
    reducedMotion: (document.getElementById('set-motion') as HTMLInputElement)?.checked ?? false,
    muteAll: (document.getElementById('set-mute') as HTMLInputElement)?.checked ?? false,
    ambientVolume: parseFloat((document.getElementById('set-ambient') as HTMLInputElement)?.value || '0.5'),
    musicVolume: parseFloat((document.getElementById('set-music') as HTMLInputElement)?.value || '0.5'),
    sfxVolume: parseFloat((document.getElementById('set-sfx') as HTMLInputElement)?.value || '0.7'),
  });
  updateMusicVolume();
  applyVisualEffects();
}

export function applyVisualEffects(): void {
  const s = getSettings();
  document.body.classList.toggle('film-grain', s.filmGrain);
  document.body.classList.toggle('vignette', s.vignette);
  document.body.classList.toggle('reduced-motion', s.reducedMotion);
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
