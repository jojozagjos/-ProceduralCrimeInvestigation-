// ─── Cinematic Intro Scene ───────────────────────────────────────────────────

import type { CaseData } from '../utils/types.js';
import { getSettings } from '../utils/settings.js';

export function renderCinematic(
  container: HTMLElement,
  caseData: CaseData,
  onVoteSkip: () => void
): void {
  const panels = caseData.cinematicPanels;
  let currentPanel = 0;
  let skipVoted = false;
  let typeTimer: number | null = null;
  let typeDelayTimer: number | null = null;

  container.innerHTML = `
    <div class="cinematic-overlay">
      <div class="cinematic-panel" id="cinematic-panel">
        <div class="cinematic-image active" id="cin-image-a"></div>
        <div class="cinematic-image" id="cin-image-b"></div>
        <div class="cinematic-caption" id="cin-caption"></div>
      </div>
      <div class="cinematic-controls">
        <span id="cinematic-votes" class="cinematic-votes"></span>
        <button class="btn btn-sm" id="cin-skip">Vote to Skip</button>
      </div>
      <div class="cinematic-progress">
        <div class="cinematic-bar" id="cin-bar"></div>
      </div>
    </div>
  `;

  const captionEl = document.getElementById('cin-caption')!;
  const imageA = document.getElementById('cin-image-a')!;
  const imageB = document.getElementById('cin-image-b')!;
  const barEl = document.getElementById('cin-bar')!;
  const skipBtn = document.getElementById('cin-skip')!;
  let activeImage = imageA;

  skipBtn.addEventListener('click', () => {
    if (!skipVoted) {
      skipVoted = true;
      skipBtn.textContent = 'Skip Voted ✓';
      skipBtn.classList.add('voted');
      onVoteSkip();
    }
  });

  function showPanel(index: number): void {
    if (index >= panels.length) return;
    const p = panels[index];
    const settings = getSettings();

    // Image placeholder - gradient background
    const gradients: Record<string, string> = {
      'exterior_night': 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
      'dim_hallway': 'linear-gradient(135deg, #2d1b00, #4a2c0a, #1a1000)',
      'crime_scene': 'linear-gradient(135deg, #3d0000, #1a0000, #2d0a0a)',
      'detective_desk': 'linear-gradient(135deg, #2d2006, #4a3510, #1a1200)',
    };
    const applyImage = (el: HTMLElement) => {
      const background = p.imageUrl
        ? `url('${p.imageUrl}')`
        : (gradients[p.imageDesc] || 'linear-gradient(135deg, #1a1a2e, #2d2006)');
      el.style.backgroundImage = background;
      el.style.backgroundColor = '#0a0a0a';
      el.style.backgroundSize = p.imageUrl ? 'contain' : 'cover';
    };

    if (index === 0) {
      applyImage(activeImage);
      activeImage.classList.add('active');
    } else {
      const nextImage = activeImage === imageA ? imageB : imageA;
      applyImage(nextImage);
      nextImage.classList.add('active');
      activeImage.classList.remove('active');
      activeImage = nextImage;
    }

    // Animate caption with a typewriter effect (slower by default)
    captionEl.style.opacity = '0';
    if (typeTimer) {
      window.clearInterval(typeTimer);
      typeTimer = null;
    }
    if (typeDelayTimer) {
      window.clearTimeout(typeDelayTimer);
      typeDelayTimer = null;
    }
    // Speed factor applied to panel duration and typing pacing
    const speedFactor = 1.6; // >1 slows the cinematic; adjust as needed

    const delay = settings.reducedMotion ? 0 : 500;
    typeDelayTimer = window.setTimeout(() => {
      captionEl.textContent = '';
      captionEl.style.opacity = '1';
      if (settings.reducedMotion) {
        captionEl.textContent = p.caption;
        return;
      }
      let i = 0;
      const charInterval = 44; // milliseconds per character (slower)
      typeTimer = window.setInterval(() => {
        i += 1;
        captionEl.textContent = p.caption.slice(0, i);
        if (i >= p.caption.length) {
          if (typeTimer) window.clearInterval(typeTimer);
          typeTimer = null;
        }
      }, charInterval);
    }, delay);

    // Progress bar
    // Apply the same speedFactor to visual progress so bar matches timing
    const totalDuration = panels.reduce((sum, pp) => sum + pp.duration * speedFactor, 0);
    const elapsed = panels.slice(0, index).reduce((sum, pp) => sum + pp.duration * speedFactor, 0);
    const panelEffective = p.duration * speedFactor;
    barEl.style.width = `${((elapsed + panelEffective) / totalDuration) * 100}%`;
    barEl.style.transition = `width ${panelEffective}ms linear`;

    // Next panel
    if (index < panels.length - 1) {
      setTimeout(() => {
        currentPanel++;
        showPanel(currentPanel);
      }, p.duration * speedFactor);
    }
  }

  showPanel(0);
}
