// ─── Tutorial Scene ──────────────────────────────────────────────────────────

import { goBack } from '../core/sceneManager.js';

const TUTORIAL_STEPS = [
  {
    title: 'Welcome, Detective',
    text: 'This tutorial will walk you through the basics of investigating a case. No server needed — this is all local.',
  },
  {
    title: 'The Crime Board',
    text: 'The corkboard is your workspace. You can pin evidence cards, create notes, and connect them with red string. Try shift+click drag to PAN the board, and scroll to ZOOM.',
  },
  {
    title: 'Pinning Evidence',
    text: 'Open the Evidence panel (top right) to see discovered clues. Click "Pin to Board" to add an evidence card to the corkboard.',
  },
  {
    title: 'Creating Notes',
    text: 'Click the 📝 Note button on the board toolbar to create a blank note. Double-click any card to edit its title, content, and even draw on it.',
  },
  {
    title: 'Drawing on Notes',
    text: 'In the card editor, you\'ll find a drawing canvas. Use the ✏️ Pen tool to sketch, and 🧹 Erase to clear. Drawings are synced to all players.',
  },
  {
    title: 'Connecting Cards',
    text: 'Click the 🔗 Connect button, then click two cards to create a red string connection. This helps visualize relationships between pieces of evidence.',
  },
  {
    title: 'Timeline',
    text: 'Open the Timeline panel to see the sequence of events. Time advances automatically through Evening → Late Night → Early Morning. New events are revealed as time progresses.',
  },
  {
    title: 'Interviewing Suspects',
    text: 'Open the Suspects panel to see all persons of interest. Click "Request Interview" — in multiplayer, all players must vote yes. During interviews, ask about alibis, motives, conflicts, and show evidence.',
  },
  {
    title: 'Making an Accusation',
    text: 'When you\'re confident, click the Accuse button. Select a suspect, describe their motive and method, and submit. Correct = case solved! Wrong = -200 points.',
  },
  {
    title: 'Tutorial Complete!',
    text: 'You\'re ready to investigate. Remember: work together, follow the evidence, question everything, and trust no one. Good luck, detective.',
  },
];

export function renderTutorialScene(container: HTMLElement): void {
  let step = 0;

  function render(): void {
    const s = TUTORIAL_STEPS[step];
    container.innerHTML = `
      <div class="tutorial-screen">
        <div class="tutorial-header">
          <h2>Tutorial</h2>
          <button class="btn btn-back" id="btn-tut-back">← Back to Menu</button>
        </div>
        <div class="tutorial-content">
          <div class="tutorial-step">
            <div class="tutorial-progress">Step ${step + 1} / ${TUTORIAL_STEPS.length}</div>
            <h3>${s.title}</h3>
            <p>${s.text}</p>
          </div>
          <div class="tutorial-nav">
            ${step > 0 ? '<button class="btn btn-secondary" id="tut-prev">← Previous</button>' : ''}
            ${step < TUTORIAL_STEPS.length - 1
              ? '<button class="btn btn-play" id="tut-next">Next →</button>'
              : '<button class="btn btn-play" id="tut-done">Finish</button>'
            }
          </div>
          <div class="tutorial-visual" id="tutorial-visual"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-tut-back')!.addEventListener('click', () => goBack());
    document.getElementById('tut-prev')?.addEventListener('click', () => { step--; render(); });
    document.getElementById('tut-next')?.addEventListener('click', () => { step++; render(); });
    document.getElementById('tut-done')?.addEventListener('click', () => goBack());

    renderVisual(step);
  }

  render();
}

function renderVisual(step: number): void {
  const visual = document.getElementById('tutorial-visual');
  if (!visual) return;

  // Draw simple illustrative diagrams for each step
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 250;
  visual.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  // Corkboard background
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(0, 0, 500, 250);

  // Texture
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = 'rgba(122, 92, 16, 0.3)';
    ctx.beginPath();
    ctx.arc(Math.random() * 500, Math.random() * 250, Math.random() * 2 + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  switch (step) {
    case 1: // Board
    case 2: // Evidence
      drawSampleCard(ctx, 50, 50, 'Witness Report', '#FFF8DC');
      drawSampleCard(ctx, 250, 80, 'Phone Records', '#FFFACD');
      break;
    case 3: // Notes
      drawSampleCard(ctx, 150, 60, 'My Notes', '#FFFACD');
      break;
    case 5: // Connections
      drawSampleCard(ctx, 50, 50, 'Card A', '#FFF8DC');
      drawSampleCard(ctx, 300, 100, 'Card B', '#FFF8DC');
      // Red string
      ctx.strokeStyle = '#CC2222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(170, 85);
      ctx.quadraticCurveTo(235, 130, 300, 135);
      ctx.stroke();
      // Pins
      ctx.fillStyle = '#CC3333';
      ctx.beginPath(); ctx.arc(170, 85, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(300, 135, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 6: // Timeline
      ctx.fillStyle = '#e8d8a0';
      ctx.fillRect(20, 30, 460, 190);
      ctx.fillStyle = '#2a1a0a';
      ctx.font = '12px Georgia';
      ctx.fillText('6:00 PM ─── Suspect arrives at location', 40, 60);
      ctx.fillText('9:00 PM ─── Heated argument overheard', 40, 90);
      ctx.fillText('12:30 AM ── The crime occurs', 40, 120);
      ctx.fillText('4:00 AM ─── Scene discovered', 40, 150);
      ctx.fillText('6:30 AM ─── Police arrive', 40, 180);
      break;
    default:
      ctx.fillStyle = 'rgba(255, 220, 170, 0.1)';
      ctx.fillRect(0, 0, 500, 250);
  }
}

function drawSampleCard(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, 120, 70);
  ctx.strokeRect(x, y, 120, 70);

  // Pin
  ctx.fillStyle = '#CC3333';
  ctx.beginPath();
  ctx.arc(x + 60, y + 5, 5, 0, Math.PI * 2);
  ctx.fill();

  // Title
  ctx.fillStyle = '#2a1a0a';
  ctx.font = 'bold 11px Georgia';
  ctx.fillText(title, x + 5, y + 30);
}
