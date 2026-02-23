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

  // Physics light canvas
  const lightCanvas = document.createElement('canvas');
  lightCanvas.className = 'physics-light-canvas';
  container.appendChild(lightCanvas);
  startPhysicsLight(lightCanvas);

  const wrapper = document.createElement('div');
  wrapper.className = 'main-menu-wrapper';

  wrapper.innerHTML = `
    <div class="main-menu-content">
      <div class="logo-area">
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

// Physics-based hanging light with Verlet integration
function startPhysicsLight(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  let animId = 0;
  
  // Chain/rope configuration
  const chainLength = 14;
  const segmentLength = 25;
  const gravity = 0.5;
  const friction = 0.99;
  const bulbRadius = 35;
  const bulbLength = bulbRadius * 2; // Length of bulb rigid body
  
  interface Point {
    x: number;
    y: number;
    oldX: number;
    oldY: number;
    pinned: boolean;
  }
  
  let ropePoints: Point[] = [];
  let bulbTop: Point = { x: 0, y: 0, oldX: 0, oldY: 0, pinned: false };
  let bulbBottom: Point = { x: 0, y: 0, oldX: 0, oldY: 0, pinned: false };
  let mouseX = 0;
  let mouseY = 0;
  let isDragging = false;
  
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initChain();
  }
  
  function initChain() {
    const anchorX = canvas.width / 2;
    const anchorY = -50;
    
    // Initialize rope points
    ropePoints = [];
    for (let i = 0; i < chainLength; i++) {
      ropePoints.push({
        x: anchorX,
        y: anchorY + i * segmentLength,
        oldX: anchorX,
        oldY: anchorY + i * segmentLength,
        pinned: i === 0, // First point is pinned to ceiling
      });
    }
    
    // Initialize bulb physics points (top and bottom for rigid body rotation)
    const lastRopeY = anchorY + (chainLength - 1) * segmentLength;
    bulbTop = {
      x: anchorX,
      y: lastRopeY + segmentLength,
      oldX: anchorX,
      oldY: lastRopeY + segmentLength,
      pinned: false,
    };
    bulbBottom = {
      x: anchorX,
      y: lastRopeY + segmentLength + bulbLength,
      oldX: anchorX,
      oldY: lastRopeY + segmentLength + bulbLength,
      pinned: false,
    };
  }
  
  resize();
  window.addEventListener('resize', resize);
  
  // Global mouse tracking to enable pointer events only over the bulb
  let globalMouseX = 0;
  let globalMouseY = 0;
  
  function updatePointerEvents() {
    const rect = canvas.getBoundingClientRect();
    const canvasMouseX = globalMouseX - rect.left;
    const canvasMouseY = globalMouseY - rect.top;
    
    // Check distance to bulb center
    const bulbCenterX = (bulbTop.x + bulbBottom.x) / 2;
    const bulbCenterY = (bulbTop.y + bulbBottom.y) / 2;
    const dist = Math.sqrt((canvasMouseX - bulbCenterX) ** 2 + (canvasMouseY - bulbCenterY) ** 2);
    if (dist < bulbRadius + 20) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.pointerEvents = 'none';
      canvas.style.cursor = 'default';
    }
  }
  
  window.addEventListener('mousemove', (e) => {
    globalMouseX = e.clientX;
    globalMouseY = e.clientY;
    updatePointerEvents();
  });
  
  // Mouse interaction
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    
    const bulbCenterX = (bulbTop.x + bulbBottom.x) / 2;
    const bulbCenterY = (bulbTop.y + bulbBottom.y) / 2;
    const dist = Math.sqrt((mouseX - bulbCenterX) ** 2 + (mouseY - bulbCenterY) ** 2);
    if (dist < bulbRadius + 20) {
      isDragging = true;
      e.stopPropagation();
    }
  });
  
  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
  });
  
  function updatePhysics() {
    const settings = getSettings();
    if (settings.reducedMotion) return;
    
    // Verlet integration for rope points
    for (let i = 0; i < ropePoints.length; i++) {
      const p = ropePoints[i];
      if (p.pinned) continue;
      
      const vx = (p.x - p.oldX) * friction;
      const vy = (p.y - p.oldY) * friction;
      
      p.oldX = p.x;
      p.oldY = p.y;
      
      p.x += vx;
      p.y += vy + gravity;
    }
    
    // Verlet integration for bulb points (with more mass/inertia)
    if (isDragging) {
      // When dragging, move both bulb points to maintain angle
      const currentAngle = Math.atan2(bulbBottom.x - bulbTop.x, bulbBottom.y - bulbTop.y);
      bulbTop.x = mouseX - Math.sin(currentAngle) * bulbLength / 2;
      bulbTop.y = mouseY - Math.cos(currentAngle) * bulbLength / 2;
      bulbBottom.x = mouseX + Math.sin(currentAngle) * bulbLength / 2;
      bulbBottom.y = mouseY + Math.cos(currentAngle) * bulbLength / 2;
      bulbTop.oldX = bulbTop.x;
      bulbTop.oldY = bulbTop.y;
      bulbBottom.oldX = bulbBottom.x;
      bulbBottom.oldY = bulbBottom.y;
    } else {
      // Apply physics to bulb top
      const vx1 = (bulbTop.x - bulbTop.oldX) * friction;
      const vy1 = (bulbTop.y - bulbTop.oldY) * friction;
      bulbTop.oldX = bulbTop.x;
      bulbTop.oldY = bulbTop.y;
      bulbTop.x += vx1;
      bulbTop.y += vy1 + gravity * 0.5; // Less gravity on top
      
      // Apply physics to bulb bottom (heavier)
      const vx2 = (bulbBottom.x - bulbBottom.oldX) * friction;
      const vy2 = (bulbBottom.y - bulbBottom.oldY) * friction;
      bulbBottom.oldX = bulbBottom.x;
      bulbBottom.oldY = bulbBottom.y;
      bulbBottom.x += vx2;
      bulbBottom.y += vy2 + gravity * 1.5; // More gravity on bottom (heavier)
    }
    
    // Constraint solving (multiple iterations for stability)
    for (let iter = 0; iter < 5; iter++) {
      // Rope segment constraints
      for (let i = 0; i < ropePoints.length - 1; i++) {
        const p1 = ropePoints[i];
        const p2 = ropePoints[i + 1];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const diff = (segmentLength - dist) / dist;
        
        const offsetX = dx * diff * 0.5;
        const offsetY = dy * diff * 0.5;
        
        if (!p1.pinned) {
          p1.x -= offsetX;
          p1.y -= offsetY;
        }
        if (!p2.pinned) {
          p2.x += offsetX;
          p2.y += offsetY;
        }
      }
      
      // Connect last rope point to bulb top
      const lastRope = ropePoints[ropePoints.length - 1];
      const dx1 = bulbTop.x - lastRope.x;
      const dy1 = bulbTop.y - lastRope.y;
      const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const diff1 = (segmentLength - dist1) / dist1;
      const offsetX1 = dx1 * diff1 * 0.5;
      const offsetY1 = dy1 * diff1 * 0.5;
      
      lastRope.x -= offsetX1;
      lastRope.y -= offsetY1;
      bulbTop.x += offsetX1;
      bulbTop.y += offsetY1;
      
      // Maintain bulb rigid body (fixed distance between top and bottom)
      const dx2 = bulbBottom.x - bulbTop.x;
      const dy2 = bulbBottom.y - bulbTop.y;
      const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const diff2 = (bulbLength - dist2) / dist2;
      const offsetX2 = dx2 * diff2 * 0.5;
      const offsetY2 = dy2 * diff2 * 0.5;
      
      bulbTop.x -= offsetX2;
      bulbTop.y -= offsetY2;
      bulbBottom.x += offsetX2;
      bulbBottom.y += offsetY2;
    }
  }
  
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const settings = getSettings();
    if (!settings.reducedMotion) {
      updatePhysics();
    }
    
    // Calculate bulb rotation angle from the two physics points
    const dx = bulbBottom.x - bulbTop.x;
    const dy = bulbBottom.y - bulbTop.y;
    const angle = -Math.atan2(dx, dy); // Negated to fix swing direction
    
    // Bulb center for rendering
    const bulbCenterX = (bulbTop.x + bulbBottom.x) / 2;
    const bulbCenterY = (bulbTop.y + bulbBottom.y) / 2;
    
    // Calculate the VISUAL top of the metal base (where rope should connect)
    // Metal base is drawn at y = -bulbRadius in local space
    // Transform to world coordinates
    const visualTopX = bulbCenterX + Math.sin(angle) * bulbRadius;
    const visualTopY = bulbCenterY - Math.cos(angle) * bulbRadius;
    
    // Draw chain/rope
    ctx.strokeStyle = 'rgba(100, 80, 60, 0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(ropePoints[0].x, ropePoints[0].y);
    for (let i = 1; i < ropePoints.length; i++) {
      ctx.lineTo(ropePoints[i].x, ropePoints[i].y);
    }
    // Connect rope to the visual top of the metal base
    ctx.lineTo(visualTopX, visualTopY);
    ctx.stroke();
    
    // Save context and apply rotation
    ctx.save();
    ctx.translate(bulbCenterX, bulbCenterY);
    ctx.rotate(angle);
    
    // Glow effect (centered at origin after translation)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
    gradient.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
    gradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();
    
    // Light bulb shape (pear-shaped) - drawn before metal base so rope goes behind it
    ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
    ctx.beginPath();
    ctx.ellipse(0, 8, bulbRadius * 0.85, bulbRadius, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Metal base at top (drawn on top so rope connects to it)
    ctx.fillStyle = 'rgba(120, 120, 120, 0.9)';
    ctx.fillRect(-12, -bulbRadius, 24, 12);
    
    // Base grooves
    ctx.strokeStyle = 'rgba(80, 80, 80, 0.8)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const yPos = -bulbRadius + 3 + i * 2;
      ctx.beginPath();
      ctx.moveTo(-12, yPos);
      ctx.lineTo(12, yPos);
      ctx.stroke();
    }
    
    // Bulb highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(-8, -5, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Filament
    ctx.strokeStyle = 'rgba(255, 180, 80, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(0, 15);
    ctx.stroke();
    
    ctx.restore();
    
    animId = requestAnimationFrame(draw);
  }
  
  draw();
}
