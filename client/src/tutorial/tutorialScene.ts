// ─── Tutorial Scene ──────────────────────────────────────────────────────────

import { goBack } from '../core/sceneManager.js';

const TUTORIAL_STEPS = [
  {
    title: '🔍 Welcome, Detective',
    text: 'Welcome to the Procedural Crime Investigation tutorial! This guide will teach you everything you need to know about solving mysteries. This tutorial runs offline — no server needed.',
  },
  {
    title: '📋 The Crime Board',
    text: 'The corkboard is your collaborative workspace for solving cases. You can pin evidence cards, create notes, add tape, draw connections, and more. Use Shift+Click+Drag to PAN the board, and scroll to ZOOM in and out.',
  },
  {
    title: '📦 Pinning Evidence',
    text: 'Open the Evidence panel (top right) to see discovered clues. Each evidence card shows its reliability, source type, and confidence score. Click "Pin to Board" to add evidence to your investigation board.',
  },
  {
    title: '📝 Creating Notes',
    text: 'Click the 📝 Note button to create a blank sticky note. Double-click any card to edit it — you can change the title, add text, choose a color, and even draw on it with the built-in drawing tools.',
  },
  {
    title: '📏 Using Tape',
    text: 'Click the 📏 Tape button to add crime scene tape to your board. Tape works just like notes — you can write on it, draw on it, move it around, and connect it to other items. Perfect for marking sections or adding dramatic flair!',
  },
  {
    title: '✏️ Drawing Mode',
    text: 'In the card editor, you\'ll find drawing tools. Use the Pen to sketch diagrams, arrows, or highlight important details. Use the Eraser to remove strokes. All drawings sync in real-time with your team!',
  },
  {
    title: '🔗 Connecting Evidence',
    text: 'Click the 🔗 Connect button, then click two cards to create an instant red string connection. Use these to show relationships, timelines, or evidence chains. Perfect for connecting suspects to locations or motives to methods!',
  },
  {
    title: '🗑️ Delete Mode',
    text: 'Click the 🗑️ Delete button to enter delete mode. Click any card, connection, or tape to remove it. A confirmation dialog will ask you to confirm before deleting — safety first!',
  },
  {
    title: '⏰ Timeline Panel',
    text: 'Open the Timeline panel to see events unfold chronologically. Time progresses through Evening → Late Night → Early Morning. New events are revealed automatically, and you can investigate hidden events for 10 points. Look for suspect and evidence connections!',
  },
  {
    title: '🎤 Interviewing Suspects',
    text: 'Open the Suspects panel and click "Request Interview" to question a person of interest. In multiplayer, all players vote. During the interview, ask about alibis, motives, conflicts, or present evidence to get reactions. The interview is now full-screen and immersive!',
  },
  {
    title: '⚖️ Team Accusation',
    text: 'When ready, click the Accuse button. ALL players submit their theory (suspect, motive, method). The team gets ONE chance — the most voted suspect becomes the team\'s accusation. Correct = case solved! Wrong = game over. No individual penalties!',
  },
  {
    title: '✅ Tutorial Complete!',
    text: 'You\'re now ready to investigate! Remember: collaborate with your team, follow the evidence, organize your board, and trust your instincts. Good luck, detective. The truth is out there!',
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
    case 0: // Welcome
      ctx.fillStyle = 'rgba(255, 220, 170, 0.2)';
      ctx.fillRect(50, 50, 400, 150);
      ctx.fillStyle = '#2a1a0a';
      ctx.font = 'bold 24px Georgia';
      ctx.fillText('🔍 Detective Training', 120, 110);
      ctx.font = '14px Georgia';
      ctx.fillText('Master the tools of investigation', 140, 140);
      break;

    case 1: // Board
      drawSampleCard(ctx, 50, 50, 'Evidence A', '#FFF8DC');
      drawSampleCard(ctx, 200, 80, 'Suspect Note', '#FFFACD');
      drawSampleCard(ctx, 350, 120, 'Timeline', '#FFE4B5');
      // Show pan/zoom hint
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(20, 180, 180, 50);
      ctx.fillStyle = '#FFC107';
      ctx.font = '12px Arial';
      ctx.fillText('Shift+Drag = Pan', 35, 200);
      ctx.fillText('Scroll = Zoom', 35, 220);
      break;

    case 2: // Evidence
      drawSampleCard(ctx, 50, 50, 'Fingerprint', '#FFF8DC');
      drawSampleCard(ctx, 200, 80, 'Phone Records', '#FFFACD');
      drawSampleCard(ctx, 350, 50, 'DNA Sample', '#FFE4B5');
      // Reliability badges
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(60, 105, 40, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '8px Arial';
      ctx.fillText('HIGH', 65, 113);
      break;

    case 3: // Notes
      drawSampleCard(ctx, 150, 60, 'My Notes', '#FFFACD');
      // Pencil icon
      ctx.fillStyle = '#2a1a0a';
      ctx.font = '24px Arial';
      ctx.fillText('✏️', 200, 110);
      break;

    case 4: // Tape
      // Crime scene tape
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.fillRect(50, 100, 400, 30);
      ctx.strokeRect(50, 100, 400, 30);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('⚠️ CRIME SCENE - DO NOT CROSS ⚠️', 80, 120);
      break;

    case 5: // Drawing
      drawSampleCard(ctx, 150, 60, 'Sketch', '#FFFACD');
      // Pen drawing on card
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(170, 80);
      ctx.lineTo(190, 100);
      ctx.lineTo(210, 85);
      ctx.lineTo(230, 105);
      ctx.stroke();
      // Tools
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(320, 70, 120, 80);
      ctx.fillStyle = '#FFC107';
      ctx.font = '12px Arial';
      ctx.fillText('✏️ Pen', 335, 95);
      ctx.fillText('🧹 Eraser', 335, 120);
      break;

    case 6: // Connections
      drawSampleCard(ctx, 50, 50, 'Suspect', '#FFF8DC');
      drawSampleCard(ctx, 300, 100, 'Location', '#FFF8DC');
      // Red string
      ctx.strokeStyle = '#CC2222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(170, 85);
      ctx.quadraticCurveTo(235, 130, 300, 135);
      ctx.stroke();
      // Pins
      ctx.fillStyle = '#CC3333';
      ctx.beginPath(); ctx.arc(170, 85, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(300, 135, 5, 0, Math.PI * 2); ctx.fill();
      break;

    case 7: // Delete mode
      drawSampleCard(ctx, 150, 80, 'Old Note', '#FFFACD');
      // X overlay
      ctx.strokeStyle = '#F44336';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(160, 90);
      ctx.lineTo(260, 140);
      ctx.moveTo(260, 90);
      ctx.lineTo(160, 140);
      ctx.stroke();
      // Trash icon
      ctx.fillStyle = '#F44336';
      ctx.font = '32px Arial';
      ctx.fillText('🗑️', 340, 130);
      break;

    case 8: // Timeline
      ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
      ctx.fillRect(20, 30, 460, 190);
      ctx.strokeStyle = '#FFC107';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 30, 460, 190);
      
      ctx.fillStyle = '#FFC107';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('Timeline of Events', 30, 50);
      
      ctx.fillStyle = '#e8d8a0';
      ctx.font = '12px Georgia';
      ctx.fillText('🌆 6:00 PM ─── Suspect arrives', 40, 80);
      ctx.fillText('🌙 9:00 PM ─── Argument heard', 40, 110);
      ctx.fillText('🌑 12:30 AM ── Crime occurs', 40, 140);
      ctx.fillText('🌅 4:00 AM ─── Scene discovered', 40, 170);
      
      // Progress bar
      ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
      ctx.fillRect(40, 190, 200, 15);
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(40, 190, 100, 15);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.fillText('3/6 events', 250, 201);
      break;

    case 9: // Interview
      // Portrait
      ctx.fillStyle = 'rgba(156, 39, 176, 0.3)';
      ctx.strokeStyle = '#9C27B0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(120, 110, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#2a1a0a';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('Interview', 85, 190);
      
      // Speech bubble
      ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
      ctx.fillRect(240, 60, 220, 100);
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.strokeRect(240, 60, 220, 100);
      
      ctx.fillStyle = '#e8d8a0';
      ctx.font = '11px Arial';
      ctx.fillText('Q: Where were you at', 250, 85);
      ctx.fillText('   midnight?', 250, 100);
      ctx.fillText('A: I was at home,', 250, 125);
      ctx.fillText('   you can check my', 250, 140);
      ctx.fillText('   alibi...', 250, 155);
      break;

    case 10: // Team Accusation
      // Vote screen mockup
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(30, 30, 440, 190);
      ctx.strokeStyle = '#FFC107';
      ctx.lineWidth = 3;
      ctx.strokeRect(30, 30, 440, 190);
      
      ctx.fillStyle = '#FFC107';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('🎯 Team Accusation', 150, 60);
      
      ctx.fillStyle = '#e8d8a0';
      ctx.font = '12px Arial';
      ctx.fillText('Player 1: Voted for Suspect A', 50, 95);
      ctx.fillText('Player 2: Voted for Suspect A', 50, 120);
      ctx.fillText('Player 3: Voted for Suspect B', 50, 145);
      
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(50, 165, 200, 35);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('Team Decision: Suspect A', 60, 188);
      break;

    case 11: // Complete
      ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
      ctx.fillRect(50, 50, 400, 150);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 50, 400, 150);
      
      ctx.fillStyle = '#2a1a0a';
      ctx.font = 'bold 26px Georgia';
      ctx.fillText('✅ Ready to Investigate!', 100, 110);
      ctx.font = '14px Georgia';
      ctx.fillText('Good luck, detective!', 170, 150);
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
