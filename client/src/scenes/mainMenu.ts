// ─── Main Menu Scene ─────────────────────────────────────────────────────────

import { navigateTo } from '../core/sceneManager.js';
import { playMusic } from '../core/audioManager.js';
import { getSettings, loadSettings, saveSettings } from '../utils/settings.js';

export function renderMainMenu(container: HTMLElement): void {
  loadSettings();
  playMusic('music_menu');

  // Particles canvas for floating dust
  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'particle-canvas';
  container.appendChild(particleCanvas);
  startParticles(particleCanvas);

  const wrapper = document.createElement('div');
  wrapper.className = 'main-menu-wrapper';

  wrapper.innerHTML = `
    <div class="main-menu-content">
      <div class="logo-area">
        <div class="logo-lamp"></div>
        <h1 class="game-title">Private<br>Investigator</h1>
        <p class="game-subtitle">A Procedural Crime Investigation</p>
      </div>
      <div class="menu-buttons">
        <button class="btn btn-play" id="btn-play">Play</button>
        <button class="btn btn-secondary" id="btn-tutorial">Tutorial</button>
        <button class="btn btn-secondary" id="btn-settings">Settings</button>
        <button class="btn btn-secondary" id="btn-credits">Credits</button>
      </div>
    </div>
  `;

  container.appendChild(wrapper);

  // Event listeners
  document.getElementById('btn-play')!.addEventListener('click', () => {
    // Check for display name
    const settings = getSettings();
    if (!settings.displayName) {
      showNamePrompt(() => navigateTo('play'));
    } else {
      navigateTo('play');
    }
  });

  document.getElementById('btn-tutorial')!.addEventListener('click', () => navigateTo('tutorial'));
  document.getElementById('btn-credits')!.addEventListener('click', () => navigateTo('credits'));
  document.getElementById('btn-settings')!.addEventListener('click', () => navigateTo('settings'));
}

function showNamePrompt(onDone: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>What's your name, detective?</h2>
      <input type="text" id="name-input" class="input" maxlength="30" placeholder="Enter display name..." />
      <button class="btn btn-play" id="name-confirm" style="margin-top:1rem;">Confirm</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('name-input') as HTMLInputElement;
  const btn = document.getElementById('name-confirm')!;
  input.focus();

  const confirm = () => {
    const name = input.value.trim();
    if (name) {
      saveSettings({ displayName: name });
      overlay.remove();
      onDone();
    }
  };

  btn.addEventListener('click', confirm);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });
}

// Floating dust particles
function startParticles(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  let animId = 0;
  const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.2 - 0.05,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
    });
  }

  function draw() {
    const settings = getSettings();
    if (settings.reducedMotion) {
      animId = requestAnimationFrame(draw);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 170, ${p.alpha})`;
      ctx.fill();
    }
    animId = requestAnimationFrame(draw);
  }
  draw();
}
