// ─── Corkboard Renderer (PixiJS + Verlet Rope Physics) ───────────────────────

import * as PIXI from 'pixi.js';
import { gameStore } from '../core/gameStore.js';
import { playSfx } from '../core/audioManager.js';
import * as net from '../network/client.js';
import { showToast } from '../ui/toast.js';
import type { BoardCard, BoardConnection, BoardState, BoardOp, DrawingStroke, NoteTextItem, NoteImageItem, BoardTape } from '../utils/types.js';

let app: PIXI.Application | null = null;
let boardContainer: PIXI.Container;
let ropeGraphics: PIXI.Graphics;
let pinOverlay: PIXI.Graphics;
let tapeContainer: PIXI.Container;
let cardSprites: Map<string, PIXI.Container> = new Map();
let tapeSprites: Map<string, PIXI.Container> = new Map();
let ropeSimulations: Map<string, VerletRope> = new Map();
let isDragging = false;
let dragTarget: PIXI.Container | null = null;
let dragOffset = { x: 0, y: 0 };
let connectMode = false;
let connectFromId: string | null = null;
let deleteMode = false;
let dragItem: { cardId: string; type: 'text' | 'image'; itemId: string; offsetX: number; offsetY: number } | null = null;
let selectedCardId: string | null = null;
let clipboardCard: BoardCard | null = null;

// Card physics tracking
const cardPhysics = new Map<string, { 
  vx: number; 
  vy: number;
  oldX: number;
  oldY: number;
  rotation: number; 
  targetRotation: number;
  angularVelocity: number;
  lastX: number;
  lastY: number;
  targetX?: number;
  targetY?: number;
  isDeleting?: boolean;
  deleteStartTime?: number;
  pinPhysics?: { x: number; y: number; oldX: number; oldY: number; rotation: number; vr: number };
}>();

// Tape physics tracking
const tapePhysics = new Map<string, {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  rotation: number;
  vr: number;
  isDeleting?: boolean;
  deleteStartTime?: number;
}>();

const HISTORY_LIMIT = 50;
const undoStack: BoardState[] = [];
const redoStack: BoardState[] = [];

const CARD_W = 120;
const CARD_H = 120;
const PIN_X = CARD_W / 2;
const PIN_Y = 6;
const PIN_HEAD_Y = PIN_Y - 4;
const NOTE_CANVAS_W = 360;
const NOTE_CANVAS_H = 360;
const CARD_TITLE_X = 5;
const CARD_TITLE_Y = 16;
const CARD_TITLE_SIZE = 10;
const CARD_TITLE_WRAP = CARD_W - 10;

function cloneBoardState(board: BoardState): BoardState {
  return {
    cards: board.cards.map(card => ({
      ...card,
      textItems: card.textItems?.map(item => ({ ...item })),
      imageItems: card.imageItems?.map(item => ({ ...item })),
      drawingStrokes: card.drawingStrokes?.map(stroke => ({
        ...stroke,
        points: stroke.points.map(p => ({ ...p })),
      })),
    })),
    connections: board.connections.map(conn => ({ ...conn })),
  };
}

function sanitizeCard(card: BoardCard): BoardCard {
  const clone = {
    ...card,
    lockedBy: undefined,
    textItems: card.textItems?.map(item => ({ ...item })),
    imageItems: card.imageItems?.map(item => ({ ...item })),
    drawingStrokes: card.drawingStrokes?.map(stroke => ({
      ...stroke,
      points: stroke.points.map(p => ({ ...p })),
    })),
  };
  return clone;
}

function pushHistory(): void {
  const state = gameStore.getState();
  if (!state) return;
  undoStack.push(cloneBoardState(state.board));
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function sendBoardOpWithHistory(op: BoardOp): void {
  pushHistory();
  net.sendBoardOp(gameStore.getLobbyId(), op);
}

function applyBoardSnapshot(snapshot: BoardState): void {
  const state = gameStore.getState();
  if (!state) return;
  const current = state.board;
  const targetCards = new Map(snapshot.cards.map(card => [card.id, card]));
  const currentCards = new Map(current.cards.map(card => [card.id, card]));
  const targetConnIds = new Set(snapshot.connections.map(conn => conn.id));

  for (const card of current.cards) {
    if (!targetCards.has(card.id)) {
      net.sendBoardOp(gameStore.getLobbyId(), { type: 'remove_card', cardId: card.id });
    }
  }

  for (const card of snapshot.cards) {
    const currentCard = currentCards.get(card.id);
    const cleanCard = sanitizeCard(card);
    if (!currentCard) {
      net.sendBoardOp(gameStore.getLobbyId(), { type: 'add_card', card: cleanCard });
      continue;
    }
    if (currentCard.x !== card.x || currentCard.y !== card.y) {
      net.sendBoardOp(gameStore.getLobbyId(), { type: 'move_card', cardId: card.id, x: card.x, y: card.y });
    }
    net.sendBoardOp(gameStore.getLobbyId(), {
      type: 'update_card',
      cardId: card.id,
      content: card.content,
      title: card.title,
      tag: card.tag,
      imageUrl: card.imageUrl,
      noteColor: card.noteColor,
      textItems: card.textItems ?? [],
      imageItems: card.imageItems ?? [],
    });

    const currStrokes = currentCard.drawingStrokes?.length || 0;
    const targetStrokes = card.drawingStrokes?.length || 0;
    if (currStrokes || targetStrokes) {
      net.sendBoardOp(gameStore.getLobbyId(), { type: 'erase_strokes', cardId: card.id });
      for (const stroke of card.drawingStrokes || []) {
        net.sendBoardOp(gameStore.getLobbyId(), { type: 'draw_stroke', cardId: card.id, stroke });
      }
    }
  }

  for (const conn of current.connections) {
    if (!targetConnIds.has(conn.id)) {
      net.sendBoardOp(gameStore.getLobbyId(), { type: 'remove_connection', connectionId: conn.id });
    }
  }

  for (const conn of snapshot.connections) {
    const exists = current.connections.some(c => c.id === conn.id);
    if (!exists) {
      net.sendBoardOp(gameStore.getLobbyId(), { type: 'add_connection', connection: conn });
    }
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, textarea, [contenteditable="true"]');
}

function validateImageUrl(url: string, onValid: () => void, onInvalid: () => void): void {
  const img = new Image();
  img.onload = () => onValid();
  img.onerror = () => onInvalid();
  img.src = url;
}
const IMAGE_CARD_ITEM = { x: 0, y: 0, w: NOTE_CANVAS_W, h: NOTE_CANVAS_H };

// ─── Verlet Rope Physics ─────────────────────────────────────────────────────

interface VerletPoint {
  x: number; y: number;
  oldX: number; oldY: number;
  pinned: boolean;
}

interface VerletRope {
  points: VerletPoint[];
  segments: number;
  length: number;
  fromCardId: string;
  toCardId: string;
  connectionId: string;
  breaking?: boolean;
  breakIndex?: number;
  breakStart?: number;
  fallDelay?: number;
  despawnDelay?: number;
  falling?: boolean;
}

function createRope(x1: number, y1: number, x2: number, y2: number, connectionId: string, fromId: string, toId: string): VerletRope {
  const segments = 12;
  const points: VerletPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const sag = Math.sin(t * Math.PI) * 20; // Natural sag
    points.push({
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t + sag,
      oldX: x1 + (x2 - x1) * t,
      oldY: y1 + (y2 - y1) * t + sag,
      pinned: i === 0 || i === segments,
    });
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const totalLen = Math.sqrt(dx * dx + dy * dy);
  return { points, segments, length: totalLen / segments, fromCardId: fromId, toCardId: toId, connectionId };
}

function updateRope(rope: VerletRope, gravity = 0.3, damping = 0.98): void {
  // Verlet integration
  for (const p of rope.points) {
    if (p.pinned) continue;
    const vx = (p.x - p.oldX) * damping;
    const vy = (p.y - p.oldY) * damping;
    p.oldX = p.x;
    p.oldY = p.y;
    p.x += vx;
    p.y += vy + gravity;
  }

  // Constraint solving
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < rope.points.length - 1; i++) {
      if (rope.breakIndex !== undefined && i === rope.breakIndex) continue;
      const a = rope.points[i];
      const b = rope.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const diff = (rope.length - dist) / dist * 0.5;
      const ox = dx * diff;
      const oy = dy * diff;
      if (!a.pinned) { a.x -= ox; a.y -= oy; }
      if (!b.pinned) { b.x += ox; b.y += oy; }
    }
  }
}

// ─── Board Rendering ─────────────────────────────────────────────────────────

export function renderCorkboard(container: HTMLElement): void {
  // Cleanup
  if (app) {
    app.destroy(true);
    app = null;
  }
  cardSprites.clear();
  ropeSimulations.clear();

  app = new PIXI.Application({
    width: container.clientWidth || 900,
    height: container.clientHeight || 600,
    backgroundColor: 0x8B6914,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  container.appendChild(app.view as HTMLCanvasElement);

  // Corkboard background
  const bg = new PIXI.Graphics();
  bg.beginFill(0x8B6914);
  bg.drawRect(0, 0, app.screen.width, app.screen.height);
  bg.endFill();

  // Texture pattern
  for (let i = 0; i < 200; i++) {
    bg.beginFill(0x7A5C10, 0.3);
    bg.drawCircle(Math.random() * app.screen.width, Math.random() * app.screen.height, Math.random() * 3 + 1);
    bg.endFill();
  }
  app.stage.addChild(bg);

  boardContainer = new PIXI.Container();
  boardContainer.sortableChildren = true;
  app.stage.addChild(boardContainer);

  ropeGraphics = new PIXI.Graphics();
  ropeGraphics.zIndex = 200;
  boardContainer.addChild(ropeGraphics);
  
  tapeContainer = new PIXI.Container();
  tapeContainer.zIndex = 1000;
  boardContainer.addChild(tapeContainer);

  pinOverlay = new PIXI.Graphics();
  pinOverlay.zIndex = 300;
  boardContainer.addChild(pinOverlay);

  let connectionLabelsContainer = new PIXI.Container();
  connectionLabelsContainer.zIndex = 310;
  boardContainer.addChild(connectionLabelsContainer);

  // Pan & zoom
  let panOffset = { x: 0, y: 0 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  const canvas = app.view as HTMLCanvasElement;

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const scale = boardContainer.scale.x;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.45, Math.min(3, scale * delta));
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - boardContainer.x) / scale;
    const worldY = (mouseY - boardContainer.y) / scale;
    boardContainer.scale.set(newScale);
    boardContainer.x = mouseX - worldX * newScale;
    boardContainer.y = mouseY - worldY * newScale;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && (e.target as HTMLElement) === canvas && !isDragging) {
      isPanning = true;
      panStart = { x: e.clientX - boardContainer.x, y: e.clientY - boardContainer.y };
    }
    if (e.button === 1) {
      isPanning = true;
      panStart = { x: e.clientX - boardContainer.x, y: e.clientY - boardContainer.y };
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    // Don't pan if in delete mode or dragging items
    if (isPanning && !deleteMode) {
      boardContainer.x = e.clientX - panStart.x;
      boardContainer.y = e.clientY - panStart.y;
    }
    if (dragItem) {
      const local = boardContainer.toLocal(new PIXI.Point(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top));
      const card = cardSprites.get(dragItem.cardId);
      if (card) {
        const relX = local.x - card.x - dragItem.offsetX;
        const relY = local.y - card.y - dragItem.offsetY;
        updateNoteItemPosition(dragItem.cardId, dragItem.type, dragItem.itemId, relX, relY);
      }
      return;
    }
    if (isDragging && dragTarget) {
      const local = boardContainer.toLocal(new PIXI.Point(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top));
      const targetX = local.x + dragOffset.x;
      const targetY = local.y + dragOffset.y;
      
      // Direct following without rotation
      dragTarget.x = targetX;
      dragTarget.y = targetY;

      // Update rope endpoints with current position (for cards)
      const cardId = dragTarget.name;
      if (cardId && !cardId.startsWith('tape_')) {
        updateRopeEndpoints(cardId, dragTarget.x, dragTarget.y);
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    isPanning = false;
    if (dragItem) {
      commitNoteItemPosition(dragItem.cardId);
      dragItem = null;
      return;
    }
    if (isDragging && dragTarget) {
      const tapeId = dragTarget.name;
      if (tapeId && tapeId.startsWith('tape_')) {
        // Save tape position
        sendBoardOpWithHistory({ 
          type: 'move_tape', 
          tapeId: tapeId,
          x: dragTarget.x,
          y: dragTarget.y
        });
      } else {
        // Card dragging
        const cardId = dragTarget.name;
        if (cardId) {
          sendBoardOpWithHistory({ type: 'move_card', cardId, x: dragTarget.x - PIN_X, y: dragTarget.y - PIN_HEAD_Y });
        }
      }
      isDragging = false;
      dragTarget = null;
    }
  });
  
  // Global mouseup to always clear drag state (prevents stuck dragging)
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      dragTarget = null;
    }
    isPanning = false;
  });

  // Connect mode button (HTML overlay)
  const toolbar = document.createElement('div');
  toolbar.className = 'board-toolbar';
  toolbar.innerHTML = `
    <button class="btn btn-sm" id="btn-add-note" title="Add Note">📝 Note</button>
    <button class="btn btn-sm" id="btn-add-image-card" title="Add Image Card">🖼️ Image</button>
    <button class="btn btn-sm" id="btn-add-tape" title="Add Tape">📎 Tape</button>
    <button class="btn btn-sm" id="btn-connect" title="Connect or Cut">🔗 Connect</button>
    <button class="btn btn-sm" id="btn-duplicate" title="Duplicate">📌 Duplicate</button>
    <button class="btn btn-sm" id="btn-delete" title="Delete Selected">🗑️ Delete</button>
    <button class="btn btn-sm" id="btn-undo" title="Undo">↩ Undo</button>
    <button class="btn btn-sm" id="btn-redo" title="Redo">↪ Redo</button>
  `;
  container.appendChild(toolbar);

  const rightToolbar = document.createElement('div');
  rightToolbar.className = 'board-toolbar-right';
  rightToolbar.innerHTML = `
    <button class="btn btn-sm" id="btn-recenter" title="Recenter Board">🎯 Recenter</button>
  `;
  container.appendChild(rightToolbar);

  document.getElementById('btn-add-note')!.addEventListener('click', () => {
    const card: BoardCard = {
      id: 'card_' + Math.random().toString(36).slice(2, 10),
      type: 'note',
      title: 'Note',
      content: '',
      noteColor: '#fffacd',
      textItems: [],
      imageItems: [],
      x: 200 + Math.random() * 300,
      y: 200 + Math.random() * 200,
    };
    sendBoardOpWithHistory({ type: 'add_card', card });
    playSfx('sfx_pin_drop');
  });

  document.getElementById('btn-add-image-card')!.addEventListener('click', () => {
    openModal('Add Image', `
      <div class="form-row">
        <input type="text" id="modal-image-url" class="input" placeholder="Image URL" />
      </div>
    `, 'Add', (overlay) => {
      const input = overlay.querySelector('#modal-image-url') as HTMLInputElement | null;
      const url = input?.value.trim() || '';
      if (!url) return;
      validateImageUrl(url, () => {
        const card: BoardCard = {
          id: 'card_' + Math.random().toString(36).slice(2, 10),
          type: 'image',
          title: '',
          content: '',
          noteColor: undefined,
          textItems: [],
          imageItems: [{ id: `img_${Math.random().toString(36).slice(2, 8)}`, url, ...IMAGE_CARD_ITEM, rotation: 0 }],
          x: 220 + Math.random() * 280,
          y: 200 + Math.random() * 200,
        };
        sendBoardOpWithHistory({ type: 'add_card', card });
        playSfx('sfx_pin_drop');
        overlay.remove();
      }, () => {
        showToast('Invalid image URL.');
      });
    });
  });

  document.getElementById('btn-add-tape')!.addEventListener('click', () => {
    const tape: BoardTape = {
      id: 'tape_' + Math.random().toString(36).slice(2, 10),
      x: 300 + Math.random() * 400,
      y: 250 + Math.random() * 250,
      rotation: (Math.random() - 0.5) * 30, // -15 to +15 degrees
      color: Math.random() > 0.5 ? '#f5deb3' : '#ffffff', // tan or white
    };
    sendBoardOpWithHistory({ type: 'add_tape', tape });
    playSfx('sfx_ui_click');
  });

  document.getElementById('btn-connect')!.addEventListener('click', () => {
    connectMode = !connectMode;
    connectFromId = null;
    const btn = document.getElementById('btn-connect')!;
    btn.classList.toggle('active', connectMode);
  });

  document.getElementById('btn-duplicate')!.addEventListener('click', () => {
    if (!selectedCardId) {
      showToast('Select a card to duplicate.');
      return;
    }
    const state = gameStore.getState();
    const card = state?.board.cards.find(c => c.id === selectedCardId);
    if (!card) return;
    const duplicate = sanitizeCard(card);
    duplicate.id = 'card_' + Math.random().toString(36).slice(2, 10);
    duplicate.x = card.x + 20;
    duplicate.y = card.y + 20;
    sendBoardOpWithHistory({ type: 'add_card', card: duplicate });
  });

  document.getElementById('btn-delete')!.addEventListener('click', () => {
    deleteMode = !deleteMode;
    const btn = document.getElementById('btn-delete')!;
    btn.classList.toggle('active', deleteMode);
    if (deleteMode) {
      // Clear drag state when entering delete mode
      isDragging = false;
      dragTarget = null;
      showToast('Click a card to delete it.');
    }
  });

  document.getElementById('btn-undo')!.addEventListener('click', () => {
    const state = gameStore.getState();
    if (!state || undoStack.length === 0) return;
    const snapshot = undoStack.pop()!;
    redoStack.push(cloneBoardState(state.board));
    applyBoardSnapshot(snapshot);
  });

  document.getElementById('btn-redo')!.addEventListener('click', () => {
    const state = gameStore.getState();
    if (!state || redoStack.length === 0) return;
    const snapshot = redoStack.pop()!;
    undoStack.push(cloneBoardState(state.board));
    applyBoardSnapshot(snapshot);
  });

  document.getElementById('btn-recenter')!.addEventListener('click', () => {
    boardContainer.position.set(0, 0);
    boardContainer.scale.set(1);
  });

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 'c') {
      if (!selectedCardId) return;
      const state = gameStore.getState();
      const card = state?.board.cards.find(c => c.id === selectedCardId);
      if (!card) return;
      clipboardCard = sanitizeCard(card);
      return;
    }
    if (e.key.toLowerCase() === 'v') {
      if (!clipboardCard) return;
      const pasted = sanitizeCard(clipboardCard);
      pasted.id = 'card_' + Math.random().toString(36).slice(2, 10);
      pasted.x = (clipboardCard.x || 0) + 20;
      pasted.y = (clipboardCard.y || 0) + 20;
      sendBoardOpWithHistory({ type: 'add_card', card: pasted });
      return;
    }
    if (e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        document.getElementById('btn-redo')?.dispatchEvent(new MouseEvent('click'));
      } else {
        document.getElementById('btn-undo')?.dispatchEvent(new MouseEvent('click'));
      }
    }
    if (e.key.toLowerCase() === 'y') {
      document.getElementById('btn-redo')?.dispatchEvent(new MouseEvent('click'));
    }
  });

  boardContainer.x = app.screen.width / 2 - 450;
  boardContainer.y = app.screen.height / 2 - 350;

  // Subscribe to store updates
  const unsub = gameStore.subscribe(() => syncBoard());
  syncBoard();

  let currentTextResolution = Math.min(8, Math.max(2, window.devicePixelRatio || 1));

  // Animation loop for ropes
  app.ticker.add(() => {
    const nextTextResolution = Math.min(
      8,
      Math.max(2, (window.devicePixelRatio || 1) / Math.max(0.3, boardContainer.scale.x))
    );
    if (Math.abs(nextTextResolution - currentTextResolution) > 0.1) {
      currentTextResolution = nextTextResolution;
      for (const [, sprite] of cardSprites) {
        for (const child of sprite.children) {
          if (child instanceof PIXI.Text) {
            child.resolution = currentTextResolution;
            child.updateText(true);
          }
        }
      }
    }

    ropeGraphics.clear();
    pinOverlay.clear();
    connectionLabelsContainer.removeChildren(0, connectionLabelsContainer.children.length);
    
    // Update card rotation physics
    for (const [cardId, physics] of cardPhysics) {
      const sprite = cardSprites.get(cardId);
      if (!sprite) continue;
      
      // Deletion animation using normal physics
      if (physics.isDeleting && physics.deleteStartTime) {
        const elapsed = performance.now() - physics.deleteStartTime;
        const maxDuration = 4000; // 4 seconds for normal fall
        
        if (elapsed < maxDuration) {
          // Normal physics - not floaty
          const gravity = 0.5; // Normal gravity
          const airResistance = 0.98; // Standard air resistance
          
          // Update velocity from previous position
          const vx = (sprite.x - physics.oldX) * airResistance;
          const vy = (sprite.y - physics.oldY) * airResistance;
          
          physics.oldX = sprite.x;
          physics.oldY = sprite.y;
          
          // Apply physics (no wind)
          sprite.x += vx;
          sprite.y += vy + gravity;
          
          // Normal rotational physics
          const rotationalDrag = 0.98;
          physics.angularVelocity += (Math.random() - 0.5) * 0.01;
          physics.angularVelocity *= rotationalDrag;
          physics.rotation += physics.angularVelocity;
          sprite.rotation = physics.rotation;
          
          // Fade out
          sprite.alpha = Math.max(0, 1 - elapsed / 3000);
          
          // Update pin physics if it exists
          if (physics.pinPhysics) {
            const pin = physics.pinPhysics;
            const pinGravity = 0.6; // Normal gravity for pin
            const pinAirResistance = 0.98;
            
            const pvx = (pin.x - pin.oldX) * pinAirResistance;
            const pvy = (pin.y - pin.oldY) * pinAirResistance;
            
            pin.oldX = pin.x;
            pin.oldY = pin.y;
            
            pin.x += pvx;
            pin.y += pvy + pinGravity;
            
            pin.vr += (Math.random() - 0.5) * 0.015;
            pin.vr *= 0.98;
            pin.rotation += pin.vr;
          }
        } else {
          // Animation complete - remove card
          boardContainer.removeChild(sprite);
          cardSprites.delete(cardId);
          cardPhysics.delete(cardId);
        }
        continue;
      }
      
      // No rotation when not deleting - cards stay upright
      sprite.rotation = 0;
    }
    
    // Update tape physics
    for (const [tapeId, physics] of tapePhysics) {
      const sprite = tapeSprites.get(tapeId);
      if (!sprite) continue;
      
      // Deletion animation
      if (physics.isDeleting && physics.deleteStartTime) {
        const elapsed = performance.now() - physics.deleteStartTime;
        const maxDuration = 4000;
        
        if (elapsed < maxDuration) {
          const gravity = 0.4;
          const airResistance = 0.98;
          
          const vx = (physics.x - physics.oldX) * airResistance;
          const vy = (physics.y - physics.oldY) * airResistance;
          
          physics.oldX = physics.x;
          physics.oldY = physics.y;
          
          physics.x += vx;
          physics.y += vy + gravity;
          
          sprite.x = physics.x;
          sprite.y = physics.y;
          
          // Subtle rotation as it falls
          physics.vr += (Math.random() - 0.5) * 0.008;
          physics.vr *= 0.98;
          physics.rotation += physics.vr;
          sprite.rotation = (physics.rotation * Math.PI) / 180;
          
          sprite.alpha = Math.max(0, 1 - elapsed / 3000);
        } else {
          tapeContainer.removeChild(sprite);
          tapeSprites.delete(tapeId);
          tapePhysics.delete(tapeId);
        }
      }
    }
    
    for (const [, rope] of ropeSimulations) {
      // Update pin positions from cards
      const fromCard = cardSprites.get(rope.fromCardId);
      const toCard = cardSprites.get(rope.toCardId);
      if (fromCard && toCard && !rope.falling) {
        rope.points[0].x = fromCard.x;
        rope.points[0].y = fromCard.y;
        rope.points[rope.points.length - 1].x = toCard.x;
        rope.points[rope.points.length - 1].y = toCard.y;
      }
      if (rope.breaking && rope.breakStart) {
        const elapsed = performance.now() - rope.breakStart;
        const fallDelay = rope.fallDelay ?? 2500;
        const despawnDelay = rope.despawnDelay ?? 7000;
        if (!rope.falling && elapsed > fallDelay) {
          rope.falling = true;
          rope.points[0].pinned = false;
          rope.points[rope.points.length - 1].pinned = false;
        }
        if (elapsed > despawnDelay) {
          ropeSimulations.delete(rope.connectionId);
          continue;
        }
      }
      updateRope(rope);

      // Draw rope
      const ropeAlpha = 0.9;
      ropeGraphics.lineStyle(2.5, 0xCC2222, ropeAlpha);
      ropeGraphics.moveTo(rope.points[0].x, rope.points[0].y);
      for (let i = 1; i < rope.points.length; i++) {
        if (rope.breakIndex !== undefined && i === rope.breakIndex + 1) {
          ropeGraphics.moveTo(rope.points[i].x, rope.points[i].y);
          continue;
        }
        ropeGraphics.lineTo(rope.points[i].x, rope.points[i].y);
      }

      // Draw connection label if present
      const state = gameStore.getState();
      const connection = state?.board.connections.find(c => c.id === rope.connectionId);
      if (connection?.label && !rope.breaking) {
        const mid = Math.floor(rope.points.length / 2);
        const labelStyle = new PIXI.TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 9,
          fill: '#2a1a0a',
          fontWeight: 'bold',
          stroke: '#fffacd',
          strokeThickness: 3,
        });
        const labelText = new PIXI.Text(connection.label.slice(0, 20), labelStyle);
        labelText.resolution = currentTextResolution;
        labelText.anchor.set(0.5);
        labelText.x = rope.points[mid].x;
        labelText.y = rope.points[mid].y - 10;
        connectionLabelsContainer.addChild(labelText);
      }
    }

    // Draw pins above ropes and cards
    pinOverlay.lineStyle(0);
    for (const [cardId, card] of cardSprites) {
      const physics = cardPhysics.get(cardId);
      
      // Draw physics-based falling pin if card is being deleted
      if (physics?.isDeleting && physics.pinPhysics) {
        const pin = physics.pinPhysics;
        const elapsed = performance.now() - (physics.deleteStartTime || 0);
        const alpha = Math.max(0, 1 - elapsed / 3000);
        
        // Save context for rotation
        const pinX = pin.x;
        const pinY = pin.y;
        
        // Draw rotated pin (simplified - just circles, rotation visual is subtle)
        pinOverlay.lineStyle(1.6, 0xE55B5B, 0.95 * alpha);
        pinOverlay.moveTo(pinX, pinY + 3);
        pinOverlay.lineTo(pinX, pinY + 10);
        pinOverlay.lineStyle(0);

        pinOverlay.beginFill(0xCC3333, alpha);
        pinOverlay.drawCircle(pinX, pinY, 5);
        pinOverlay.endFill();
        pinOverlay.beginFill(0xFFAAAA, alpha);
        pinOverlay.drawCircle(pinX - 1, pinY - 1, 2);
        pinOverlay.endFill();
        continue;
      }
      
      const pinX = card.x;
      const pinY = card.y;
      pinOverlay.lineStyle(1.6, 0xE55B5B, 0.95);
      pinOverlay.moveTo(pinX, pinY + 3);
      pinOverlay.lineTo(pinX, pinY + 10);
      pinOverlay.lineStyle(0);

      pinOverlay.beginFill(0xCC3333);
      pinOverlay.drawCircle(pinX, pinY, 5);
      pinOverlay.endFill();
      pinOverlay.beginFill(0xFFAAAA);
      pinOverlay.drawCircle(pinX - 1, pinY - 1, 2);
      pinOverlay.endFill();
    }
  });
}

const TAPE_W = 80;
const TAPE_H = 16;
const TAPE_CANVAS_W = 240;
const TAPE_CANVAS_H = 80;

function buildTapeTextSprite(tape: BoardTape, item: NoteTextItem): PIXI.Text {
  const scaleX = TAPE_W / TAPE_CANVAS_W;
  const scaleY = TAPE_H / TAPE_CANVAS_H;
  const style = new PIXI.TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: Math.max(4, (item.size || 12) * scaleX),
    fill: item.color || '#2a1a0a',
    wordWrap: true,
    wordWrapWidth: TAPE_W - 4,
  });
  const text = new PIXI.Text(item.text.slice(0, 50), style);
  text.resolution = 4;
  text.name = `tape-text:${item.id}`;
  text.anchor.set(0.5);
  text.x = (item.x - TAPE_CANVAS_W / 2) * scaleX;
  text.y = (item.y - TAPE_CANVAS_H / 2) * scaleY;
  text.rotation = ((item.rotation || 0) * Math.PI) / 180;
  return text;
}

function buildTapeDrawingGraphics(tape: BoardTape): PIXI.Graphics {
  const graphics = new PIXI.Graphics();
  const scaleX = TAPE_W / TAPE_CANVAS_W;
  const scaleY = TAPE_H / TAPE_CANVAS_H;
  const offsetX = -TAPE_W / 2;
  const offsetY = -TAPE_H / 2;
  for (const stroke of tape.drawingStrokes || []) {
    graphics.lineStyle(Math.max(0.5, stroke.width * scaleX), 0x2a1a0a, 0.85);
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      const x = p.x * scaleX + offsetX;
      const y = p.y * scaleY + offsetY;
      if (i === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
  }
  return graphics;
}

function createTapeSprite(tape: BoardTape): void {
  if (!app) return;
  
  const container = new PIXI.Container();
  container.name = tape.id;
  container.x = tape.x;
  container.y = tape.y;
  container.rotation = (tape.rotation * Math.PI) / 180;
  container.eventMode = 'static';
  container.cursor = 'pointer';
  
  // Draw tape piece background - looks like masking tape
  const bg = new PIXI.Graphics();
  const color = tape.color ? parseInt(tape.color.replace('#', ''), 16) : 0xf5deb3;
  bg.beginFill(color, 0.7);
  bg.lineStyle(1, 0x000000, 0.1);
  bg.drawRoundedRect(-40, -8, 80, 16, 2);
  bg.endFill();
  
  // Add texture/pattern for realism
  bg.lineStyle(1, 0x000000, 0.05);
  for (let i = -35; i < 40; i += 10) {
    bg.moveTo(i, -6);
    bg.lineTo(i, 6);
  }
  container.addChild(bg);
  
  // Add text items
  const textItems = tape.textItems || [];
  for (const item of textItems) {
    const textSprite = buildTapeTextSprite(tape, item);
    container.addChild(textSprite);
  }
  
  // Add drawing graphics
  const drawingGraphics = buildTapeDrawingGraphics(tape);
  container.addChild(drawingGraphics);
  
  // Double click to edit
  let lastTapeClickTime = 0;
  container.on('pointertap', () => {
    const now = Date.now();
    if (now - lastTapeClickTime < 300) {
      if (!deleteMode && !connectMode) {
        openTapeEditor(tape);
      }
    }
    lastTapeClickTime = now;
  });
  
  // Handle interactions
  container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    if (deleteMode) {
      // Clear drag state
      isDragging = false;
      dragTarget = null;
      
      openModal('Delete Tape', `
        <div class="form-row">
          <p>Are you sure you want to delete this tape?</p>
        </div>
      `, 'Delete', (overlay) => {
        isDragging = false;
        dragTarget = null;
        startTapeDeletion(tape.id);
        overlay.remove();
        deleteMode = false;
        document.getElementById('btn-delete')?.classList.remove('active');
      });
      return;
    }
    
    // Allow dragging tape when not in delete mode
    isDragging = true;
    dragTarget = container;
    const local = boardContainer.toLocal(e.global);
    dragOffset.x = container.x - local.x;
    dragOffset.y = container.y - local.y;
  });
  
  tapeContainer.addChild(container);
  tapeSprites.set(tape.id, container);
  
  // Initialize physics
  tapePhysics.set(tape.id, {
    x: tape.x,
    y: tape.y,
    oldX: tape.x,
    oldY: tape.y,
    rotation: tape.rotation,
    vr: 0,
  });
}

function startTapeDeletion(tapeId: string): void {
  const physics = tapePhysics.get(tapeId);
  const sprite = tapeSprites.get(tapeId);
  if (!physics || !sprite) return;
  
  physics.isDeleting = true;
  physics.deleteStartTime = performance.now();
  physics.oldX = physics.x;
  physics.oldY = physics.y;
  physics.vr = (Math.random() - 0.5) * 0.03;
  
  // Send delete operation after animation
  setTimeout(() => {
    sendBoardOpWithHistory({ type: 'remove_tape', tapeId });
  }, 4200);
  
  playSfx('sfx_ui_click');
}

function syncBoard(): void {
  const state = gameStore.getState();
  if (!state || !app) return;
  const board = state.board;

  // Sync cards
  const existingIds = new Set(cardSprites.keys());
  for (const card of board.cards) {
    if (!cardSprites.has(card.id)) {
      createCardSprite(card);
    } else {
      // Update position and text
      const sprite = cardSprites.get(card.id)!;
      sprite.x = card.x + PIN_X;
      sprite.y = card.y + PIN_HEAD_Y;
      updateCardSprite(sprite, card);
      
      // Update physics position tracking
      const physics = cardPhysics.get(card.id);
      if (physics && !physics.isDeleting) {
        physics.lastX = sprite.x;
        physics.lastY = sprite.y;
        physics.oldX = sprite.x;
        physics.oldY = sprite.y;
      }
    }
    existingIds.delete(card.id);
  }
  // Remove deleted cards
  for (const id of existingIds) {
    const sprite = cardSprites.get(id);
    const physics = cardPhysics.get(id);
    // Don't remove if currently animating deletion (either physics flag or sprite-level flag)
    const spriteDeleting = !!(sprite && (sprite as any)._isDeleting);
    if (sprite && !(physics?.isDeleting || spriteDeleting)) {
      boardContainer.removeChild(sprite);
      cardSprites.delete(id);
      cardPhysics.delete(id);
    }
  }

  // Sync connections
  const existingRopes = new Set(ropeSimulations.keys());
  for (const conn of board.connections) {
    if (!ropeSimulations.has(conn.id)) {
      const fromCard = cardSprites.get(conn.fromCardId);
      const toCard = cardSprites.get(conn.toCardId);
      if (fromCard && toCard) {
        const rope = createRope(
          fromCard.x, fromCard.y,
          toCard.x, toCard.y,
          conn.id, conn.fromCardId, conn.toCardId
        );
        ropeSimulations.set(conn.id, rope);
        playSfx('sfx_rope_attach');
      }
    }
    existingRopes.delete(conn.id);
  }
  for (const id of existingRopes) {
    const rope = ropeSimulations.get(id);
    if (rope && !rope.breaking) {
      startRopeBreak(rope);
    }
  }
  
  // Sync tapes
  const existingTapes = new Set(tapeSprites.keys());
  const tapes = board.tapes || [];
  for (const tape of tapes) {
    const existingSprite = tapeSprites.get(tape.id);
    const physics = tapePhysics.get(tape.id);
    
    if (!existingSprite) {
      createTapeSprite(tape);
    } else {
      // Check if content has changed (text or drawings)
      const needsRebuild = (tape.textItems?.length || 0) > 0 || (tape.drawingStrokes?.length || 0) > 0;
      
      if (!physics?.isDeleting) {
        if (needsRebuild) {
          // Recreate sprite to show updated content
          const oldX = existingSprite.x;
          const oldY = existingSprite.y;
          const oldRotation = existingSprite.rotation;
          
          tapeContainer.removeChild(existingSprite);
          tapeSprites.delete(tape.id);
          
          createTapeSprite(tape);
          const newSprite = tapeSprites.get(tape.id);
          if (newSprite) {
            newSprite.x = oldX;
            newSprite.y = oldY;
            newSprite.rotation = oldRotation;
          }
        } else {
          // Just update position/rotation
          existingSprite.x = tape.x;
          existingSprite.y = tape.y;
          existingSprite.rotation = (tape.rotation * Math.PI) / 180;
        }
        
        // Update physics position to match
        if (physics) {
          physics.x = tape.x;
          physics.y = tape.y;
          physics.oldX = tape.x;
          physics.oldY = tape.y;
        }
      }
    }
    existingTapes.delete(tape.id);
  }
  // Remove deleted tapes
  for (const id of existingTapes) {
    const sprite = tapeSprites.get(id);
    const physics = tapePhysics.get(id);
    // Don't remove if currently animating deletion
    if (sprite && !physics?.isDeleting) {
      tapeContainer.removeChild(sprite);
      tapeSprites.delete(id);
      tapePhysics.delete(id);
    }
  }
}

function startCardDeletion(cardId: string): void {
  let physics = cardPhysics.get(cardId);
  const sprite = cardSprites.get(cardId);
  if (!sprite) return;
  // Ensure physics entry exists so deletion animation runs even if it wasn't initialized earlier
  if (!physics) {
    cardPhysics.set(cardId, {
      vx: 0,
      vy: 0,
      oldX: sprite.x,
      oldY: sprite.y,
      rotation: 0,
      targetRotation: 0,
      angularVelocity: 0,
      lastX: sprite.x,
      lastY: sprite.y,
    });
    physics = cardPhysics.get(cardId)!;
  }
  
  // Break all connections to this card IMMEDIATELY
  const state = gameStore.getState();
  if (state) {
    const connectionsToBreak = state.board.connections.filter(
      c => c.fromCardId === cardId || c.toCardId === cardId
    );
    for (const conn of connectionsToBreak) {
      const rope = ropeSimulations.get(conn.id);
      if (rope && !rope.breaking) {
        // Immediately unpin and start falling
        rope.breaking = true;
        rope.breakStart = performance.now();
        rope.fallDelay = 0; // Fall immediately, no delay
        rope.despawnDelay = 4000;
        rope.breakIndex = Math.floor(rope.points.length / 2) - 1;
        rope.falling = true;
        rope.points[0].pinned = false;
        rope.points[rope.points.length - 1].pinned = false;
        
        // Add initial separation velocity at break point
        for (let i = 0; i < rope.points.length; i++) {
          if (i <= rope.breakIndex) {
            rope.points[i].oldX = rope.points[i].x + 4;
          } else {
            rope.points[i].oldX = rope.points[i].x - 4;
          }
        }
      }
    }
  }
  
  // Mark sprite as deleting to prevent external sync from removing it mid-animation
  (sprite as any)._isDeleting = true;

  // Initialize Verlet physics for deletion
  physics.isDeleting = true;
  physics.deleteStartTime = performance.now();
  physics.lastX = sprite.x;
  physics.lastY = sprite.y;
  physics.oldX = sprite.x;
  physics.oldY = sprite.y;
  physics.angularVelocity = (Math.random() - 0.5) * 0.02;
  
  // Initialize pin physics
  const pinX = sprite.x;
  const pinY = sprite.y;
  physics.pinPhysics = {
    x: pinX,
    y: pinY,
    oldX: pinX - (Math.random() - 0.5) * 2,
    oldY: pinY - 1,
    rotation: 0,
    vr: (Math.random() - 0.5) * 0.05
  };
  
  // Send the actual delete op after animation completes
  setTimeout(() => {
    sendBoardOpWithHistory({ type: 'remove_card', cardId });
  }, 4200);
  
  playSfx('sfx_ui_click');
}

function startRopeBreak(rope: VerletRope): void {
  rope.breaking = true;
  rope.breakStart = performance.now();
  rope.fallDelay = 1500 + Math.random() * 2500;
  rope.despawnDelay = (rope.fallDelay || 2500) + 4000 + Math.random() * 2000;
  rope.breakIndex = Math.floor(rope.points.length / 2) - 1;
  for (let i = 0; i < rope.points.length; i++) {
    if (i <= rope.breakIndex) {
      rope.points[i].oldX = rope.points[i].x + 4;
    } else {
      rope.points[i].oldX = rope.points[i].x - 4;
    }
  }
}

function createCardSprite(card: BoardCard): void {
  if (!app) return;

  const container = new PIXI.Container();
  container.name = card.id;
  container.x = card.x + PIN_X;
  container.y = card.y + PIN_HEAD_Y;
  container.zIndex = 10;
  container.eventMode = 'static';
  container.cursor = 'pointer';
  
  // Set pivot point to pin position so rotation happens around the pin
  container.pivot.set(PIN_X, PIN_HEAD_Y);

  // Card background
  const bg = new PIXI.Graphics();
  bg.name = 'card-bg';
  drawCardBackground(bg, card);
  container.addChild(bg);

  // Title text
  const titleStyle = new PIXI.TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: CARD_TITLE_SIZE,
    fontWeight: 'bold',
    fill: card.type === 'image' ? '#fff9e8' : '#2a1a0a',
    wordWrap: true,
    wordWrapWidth: CARD_TITLE_WRAP,
    dropShadow: card.type === 'image',
    dropShadowColor: card.type === 'image' ? '#000000' : '#000000',
    dropShadowBlur: card.type === 'image' ? 2 : 0,
    dropShadowDistance: card.type === 'image' ? 1 : 0,
  });
  const title = new PIXI.Text(card.title.slice(0, 30), titleStyle);
  title.resolution = 4;
  title.name = 'card-title';
  title.x = CARD_TITLE_X;
  title.y = CARD_TITLE_Y;
  container.addChild(title);

  updateCardSprite(container, card);

  // Interactions
  container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    selectedCardId = card.id;
    
    if (deleteMode) {
      // Clear drag state
      isDragging = false;
      dragTarget = null;
      
      // Delete mode - confirm and delete
      openModal('Delete Card', `
        <div class="form-row">
          <p>Are you sure you want to delete "${escHtml(card.title || 'Untitled')}"?</p>
        </div>
      `, 'Delete', (overlay) => {
        // Ensure drag is cleared before deletion
        isDragging = false;
        dragTarget = null;
        startCardDeletion(card.id);
        overlay.remove();
        deleteMode = false;
        document.getElementById('btn-delete')?.classList.remove('active');
      });
      return;
    }
    
    if (connectMode) {
      if (!connectFromId) {
        connectFromId = card.id;
      } else if (connectFromId !== card.id) {
        const state = gameStore.getState();
        const existing = state?.board.connections.find(c =>
          (c.fromCardId === connectFromId && c.toCardId === card.id)
          || (c.fromCardId === card.id && c.toCardId === connectFromId)
        );
        if (existing) {
          sendBoardOpWithHistory({ type: 'remove_connection', connectionId: existing.id });
        } else {
          // Create connection without label
          const conn: BoardConnection = {
            id: 'conn_' + Math.random().toString(36).slice(2, 10),
            fromCardId: connectFromId!,
            toCardId: card.id,
          };
          sendBoardOpWithHistory({ type: 'add_connection', connection: conn });
        }
        connectMode = false;
        connectFromId = null;
        document.getElementById('btn-connect')?.classList.remove('active');
      }
      return;
    }
    isDragging = true;
    dragTarget = container;
    const local = boardContainer.toLocal(e.global);
    dragOffset.x = container.x - local.x;
    dragOffset.y = container.y - local.y;
    container.zIndex = 150;
    
    // Initialize physics tracking
    if (!cardPhysics.has(card.id)) {
      cardPhysics.set(card.id, { 
        vx: 0, 
        vy: 0,
        oldX: container.x,
        oldY: container.y,
        rotation: 0, 
        targetRotation: 0,
        angularVelocity: 0,
        lastX: container.x,
        lastY: container.y
      });
    } else {
      const physics = cardPhysics.get(card.id)!;
      physics.lastX = container.x;
      physics.lastY = container.y;
      physics.oldX = container.x;
      physics.oldY = container.y;
    }
  });

  container.on('pointerup', () => {
    container.zIndex = 10;
  });

  // Double click to edit
  let lastClickTime = 0;
  container.on('pointertap', () => {
    const now = Date.now();
    if (now - lastClickTime < 300) {
      if (card.type === 'image') {
        openModal('Update Image', `
          <div class="form-row">
            <input type="text" id="modal-image-url" class="input" placeholder="Image URL" />
          </div>
        `, 'Update', (overlay) => {
          const input = overlay.querySelector('#modal-image-url') as HTMLInputElement | null;
          const url = input?.value.trim() || '';
          if (!url) return;
          validateImageUrl(url, () => {
            sendBoardOpWithHistory({
              type: 'update_card',
              cardId: card.id,
              content: '',
              title: '',
              imageUrl: undefined,
              noteColor: undefined,
              textItems: [],
              imageItems: [{ id: card.imageItems?.[0]?.id || `img_${Math.random().toString(36).slice(2, 8)}`, url, ...IMAGE_CARD_ITEM, rotation: 0 }],
            });
            overlay.remove();
          }, () => {
            showToast('Invalid image URL.');
          });
        });
      } else {
        openCardEditor(card);
      }
    }
    lastClickTime = now;
  });

  boardContainer.addChild(container);
  cardSprites.set(card.id, container);
  
  // Initialize physics tracking
  if (!cardPhysics.has(card.id)) {
    cardPhysics.set(card.id, {
      vx: 0,
      vy: 0,
      oldX: card.x + PIN_X,
      oldY: card.y + PIN_HEAD_Y,
      rotation: 0,
      targetRotation: 0,
      angularVelocity: 0,
      lastX: card.x + PIN_X,
      lastY: card.y + PIN_HEAD_Y
    });
  }
}

function updateCardSprite(container: PIXI.Container, card: BoardCard): void {
  const bg = container.getChildByName('card-bg') as PIXI.Graphics | null;
  if (bg) drawCardBackground(bg, card);

  const title = container.getChildByName('card-title') as PIXI.Text | null;
  if (title) {
    title.text = card.title.slice(0, 30);
    title.resolution = 4;
  }

  // Remove old note content nodes
  const toRemove: PIXI.DisplayObject[] = [];
  for (const child of container.children) {
    if (child.name?.startsWith('note-text:')
      || child.name?.startsWith('note-image:')
      || child.name === 'note-drawing'
      || child.name === 'note-tag-label') {
      toRemove.push(child);
    }
  }
  for (const child of toRemove) {
    container.removeChild(child);
    child.destroy();
  }

  if (card.type !== 'image') {
    const textItems = getNoteTextItems(card);
    for (const item of textItems) {
      const text = buildNoteTextSprite(card, item);
      container.addChild(text);
    }
  }

  const imageItems = getNoteImageItems(card);
  for (const item of imageItems) {
    const image = buildNoteImageSprite(card, item);
    if (image) container.addChild(image);
  }

  if (card.type !== 'image' && card.drawingStrokes?.length) {
    const drawing = buildNoteDrawingGraphics(card);
    drawing.name = 'note-drawing';
    container.addChild(drawing);
  }

  if (card.type !== 'image' && card.tag) {
    const tagLabel = new PIXI.Text(card.tag.replace('_', ' '), new PIXI.TextStyle({
      fontFamily: 'Georgia, serif',
      fontSize: 8,
      fill: '#5a3a1a',
    }));
    tagLabel.name = 'note-tag-label';
    tagLabel.x = 6;
    tagLabel.y = CARD_H - 14;
    container.addChild(tagLabel);
    tagLabel.resolution = Math.min(8, Math.max(2, window.devicePixelRatio || 1));
  }
}

function drawCardBackground(bg: PIXI.Graphics, card: BoardCard): void {
  const defaultColors: Record<string, number> = {
    note: 0xFFFACD,
    evidence: 0xFFF8DC,
    testimony: 0xE6E6FA,
  };
  const fallback = defaultColors[card.type] || 0xFFFACD;
  const color = card.noteColor ? parseInt(card.noteColor.replace('#', ''), 16) : fallback;
  bg.clear();
  if (card.type === 'image') {
    // Polaroid-style white border
    bg.beginFill(0xFFFFFF);
    bg.drawRoundedRect(-2, -2, CARD_W + 4, CARD_H + 4, 2);
    bg.endFill();
    // Shadow
    bg.beginFill(0x000000, 0.15);
    bg.drawRoundedRect(2, 2, CARD_W + 2, CARD_H + 2, 2);
    bg.endFill();
    // Inner transparent hit area
    bg.beginFill(0x000000, 0.001);
    bg.drawRoundedRect(0, 0, CARD_W, CARD_H, 2);
    bg.endFill();
    return;
  }
  bg.lineStyle(1, 0x8B7355);
  bg.beginFill(color);
  bg.drawRoundedRect(0, 0, CARD_W, CARD_H, 3);
  bg.endFill();
}

function getNoteTextItems(card: BoardCard): NoteTextItem[] {
  if (card.textItems && card.textItems.length > 0) return card.textItems;
  if (card.content) {
    // Position text below title with extra spacing for wrapped titles
    return [{ id: 'legacy-text', text: card.content, x: 20, y: 90, size: 10, w: 160, h: 90 }];
  }
  return [];
}

function getNoteImageItems(card: BoardCard): NoteImageItem[] {
  if (card.imageItems && card.imageItems.length > 0) return card.imageItems;
  if (card.imageUrl) {
    return [{ id: 'legacy-image', url: card.imageUrl, x: 5, y: 44, w: CARD_W - 10, h: 50 }];
  }
  return [];
}

function buildNoteTextSprite(card: BoardCard, item: NoteTextItem): PIXI.Text {
  const scaleX = CARD_W / NOTE_CANVAS_W;
  const scaleY = CARD_H / NOTE_CANVAS_H;
  const style = new PIXI.TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize: Math.max(6, (item.size || 10) * scaleX),
    fill: item.color || '#2a1a0a',
    wordWrap: true,
    wordWrapWidth: (item.w || CARD_W - 10) * scaleX,
    stroke: '#fff5d6',
    strokeThickness: Math.max(1, scaleX),
  });
  const text = new PIXI.Text(item.text.slice(0, 200), style);
  text.resolution = 4;
  text.name = `note-text:${item.id}`;
  // Use top-left anchor for legacy evidence cards to prevent overlap
  if (item.id === 'legacy-text') {
    const legacyY = Math.max(item.y, 90);
    text.anchor.set(0, 0);
    text.x = item.x * scaleX;
    text.y = legacyY * scaleY;
  } else {
    // For user-added text, use center anchor with stored top-left position
    text.anchor.set(0.5);
    text.x = item.x * scaleX + ((item.w || CARD_W - 10) * scaleX) / 2;
    text.y = item.y * scaleY + ((item.h || 20) * scaleY) / 2;
  }
  text.rotation = ((item.rotation || 0) * Math.PI) / 180;
  return text;
}

function buildNoteImageSprite(card: BoardCard, item: NoteImageItem): PIXI.Sprite | null {
  if (!item.url) return null;
  const scaleX = CARD_W / NOTE_CANVAS_W;
  const scaleY = CARD_H / NOTE_CANVAS_H;
  const sprite = PIXI.Sprite.from(item.url);
  sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
  sprite.texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
  sprite.name = `note-image:${item.id}`;
  const w = item.w * scaleX;
  const h = item.h * scaleY;
  sprite.width = w;
  sprite.height = h;
  sprite.anchor.set(0.5);
  sprite.x = item.x * scaleX + w / 2;
  sprite.y = item.y * scaleY + h / 2;
  sprite.rotation = ((item.rotation || 0) * Math.PI) / 180;
  sprite.alpha = card.type === 'image' ? 1 : 0.8;
  return sprite;
}

function buildNoteDrawingGraphics(card: BoardCard): PIXI.Graphics {
  const graphics = new PIXI.Graphics();
  const scaleX = CARD_W / NOTE_CANVAS_W;
  const scaleY = CARD_H / NOTE_CANVAS_H;
  for (const stroke of card.drawingStrokes || []) {
    graphics.lineStyle(Math.max(1.5, stroke.width * 0.6), 0x2a1a0a, 0.85);
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      const x = p.x * scaleX;
      const y = p.y * scaleY;
      if (i === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
  }
  return graphics;
}

function startItemDrag(
  e: PIXI.FederatedPointerEvent,
  cardId: string,
  type: 'text' | 'image',
  itemId: string
): void {
  e.stopPropagation();
  const card = cardSprites.get(cardId);
  if (!card) return;
  const local = card.toLocal(e.global);
  const state = gameStore.getState();
  const cardData = state?.board.cards.find(c => c.id === cardId);
  if (cardData && type === 'text' && (!cardData.textItems || cardData.textItems.length === 0)) {
    cardData.textItems = getNoteTextItems(cardData);
  }
  if (cardData && type === 'image' && (!cardData.imageItems || cardData.imageItems.length === 0)) {
    cardData.imageItems = getNoteImageItems(cardData);
  }
  // Get the actual sprite to calculate offset correctly
  const sprite = card.getChildByName(`${type === 'text' ? 'note-text' : 'note-image'}:${itemId}`);
  const offsetX = sprite ? local.x - sprite.x : 0;
  const offsetY = sprite ? local.y - sprite.y : 0;
  dragItem = {
    cardId,
    type,
    itemId,
    offsetX,
    offsetY,
  };
}

function updateNoteItemPosition(
  cardId: string,
  type: 'text' | 'image',
  itemId: string,
  x: number,
  y: number
): void {
  const state = gameStore.getState();
  if (!state) return;
  const card = state.board.cards.find(c => c.id === cardId);
  if (!card) return;

  if (type === 'text') {
    const items = card.textItems || [];
    const item = items.find(i => i.id === itemId);
    if (item) {
      const scaleX = NOTE_CANVAS_W / CARD_W;
      const scaleY = NOTE_CANVAS_H / CARD_H;
      item.x = x * scaleX;
      item.y = y * scaleY;
    }
    card.textItems = items;
  } else {
    const items = card.imageItems || [];
    const item = items.find(i => i.id === itemId);
    if (item) {
      const scaleX = NOTE_CANVAS_W / CARD_W;
      const scaleY = NOTE_CANVAS_H / CARD_H;
      item.x = x * scaleX;
      item.y = y * scaleY;
    }
    card.imageItems = items;
  }

  const container = cardSprites.get(cardId);
  if (!container) return;
  const child = container.getChildByName(`${type === 'text' ? 'note-text' : 'note-image'}:${itemId}`);
  if (child) {
    child.x = x;
    child.y = y;
  }
}

function commitNoteItemPosition(cardId: string): void {
  const state = gameStore.getState();
  if (!state) return;
  const card = state.board.cards.find(c => c.id === cardId);
  if (!card) return;
  sendBoardOpWithHistory({
    type: 'update_card',
    cardId: card.id,
    title: card.title,
    content: card.content,
    tag: card.tag,
    imageUrl: card.imageUrl,
    noteColor: card.noteColor,
    textItems: card.textItems,
    imageItems: card.imageItems,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function updateRopeEndpoints(cardId: string, x: number, y: number): void {
  for (const [, rope] of ropeSimulations) {
    if (rope.falling) {
      continue;
    }
    if (rope.fromCardId === cardId) {
      rope.points[0].x = x;
      rope.points[0].y = y;
      rope.points[0].oldX = rope.points[0].x;
      rope.points[0].oldY = rope.points[0].y;
    }
    if (rope.toCardId === cardId) {
      const last = rope.points[rope.points.length - 1];
      last.x = x;
      last.y = y;
      last.oldX = last.x;
      last.oldY = last.y;
    }
  }
}

function openModal(title: string, bodyHtml: string, confirmLabel: string, onConfirm: (overlay: HTMLDivElement) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${escHtml(title)}</h2>
      ${bodyHtml}
      <div class="modal-actions">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn btn-play" data-confirm>${escHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cancelBtn = overlay.querySelector('[data-cancel]') as HTMLButtonElement | null;
  const confirmBtn = overlay.querySelector('[data-confirm]') as HTMLButtonElement | null;

  cancelBtn?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  confirmBtn?.addEventListener('click', () => onConfirm(overlay));
}

function openCardEditor(card: BoardCard): void {
  // Lock the card
  net.sendBoardOp(gameStore.getLobbyId(), { type: 'lock_card', cardId: card.id, playerId: gameStore.getPlayerId() });

  const overlay = document.createElement('div');
  overlay.className = 'card-editor-overlay';
  overlay.innerHTML = `
    <div class="card-editor">
      <h3>Edit Card</h3>
      <div class="note-canvas-toolbar">
        <div class="note-canvas-actions">
          <button class="btn btn-xs" id="btn-add-text">Add Text</button>
          <button class="btn btn-xs" id="btn-add-image">Add Image</button>
          <button class="btn btn-xs" id="btn-add-suspect">Add Suspect</button>
          <button class="btn btn-xs" id="btn-delete-item">Delete</button>
        </div>
        <div class="note-canvas-tools">
          <button class="btn btn-xs" id="draw-pen">✏️ Pen</button>
          <button class="btn btn-xs" id="draw-eraser">🧹 Erase</button>
          <button class="btn btn-xs" id="draw-clear">Clear</button>
        </div>
      </div>
      <div class="note-canvas-row">
        <div class="note-side note-side-left">
          <label class="note-side-label">Title</label>
          <input type="text" id="card-title-edit" value="${escHtml(card.title)}" class="input note-title-input" maxlength="50" />
          <div class="note-color-row">
            <label>Note Color</label>
            <input type="color" id="card-color-edit" value="${escHtml(card.noteColor || '#fffacd')}" />
          </div>
        </div>
        <div class="note-canvas" id="note-canvas">
          <canvas id="note-draw-canvas" width="${NOTE_CANVAS_W}" height="${NOTE_CANVAS_H}"></canvas>
          <div class="note-selection" id="note-selection" style="display:none;">
            <div class="handle handle-rotate" data-handle="rotate"></div>
            <div class="handle handle-tl" data-handle="scale-tl"></div>
            <div class="handle handle-tr" data-handle="scale-tr"></div>
            <div class="handle handle-bl" data-handle="scale-bl"></div>
            <div class="handle handle-br" data-handle="scale-br"></div>
          </div>
        </div>
        <div class="note-side note-side-right">
          <div class="note-inspector" id="note-inspector">
            <div class="form-row">
              <label>Selected</label>
              <span id="note-selected-label" class="muted">None</span>
            </div>
            <div class="form-row" id="note-text-controls" style="display:none;">
              <label>Text Color</label>
              <input type="color" id="note-font-color" value="#2a1a0a" />
              <label>Text Size</label>
              <input type="range" id="note-font-size" min="8" max="48" value="14" />
              <span id="note-font-size-label">14px</span>
            </div>
          </div>
        </div>
      </div>
      <div class="note-tag-left">
        <label class="note-side-label">Tag</label>
        <select id="card-tag-edit" class="input-select">
          <option value="">None</option>
          <option value="motive" ${card.tag === 'motive' ? 'selected' : ''}>Motive</option>
          <option value="means" ${card.tag === 'means' ? 'selected' : ''}>Means</option>
          <option value="opportunity" ${card.tag === 'opportunity' ? 'selected' : ''}>Opportunity</option>
          <option value="alibi" ${card.tag === 'alibi' ? 'selected' : ''}>Alibi</option>
          <option value="red_herring" ${card.tag === 'red_herring' ? 'selected' : ''}>Red Herring</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn" id="card-cancel">Cancel</button>
        <button class="btn btn-play" id="card-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const textItems: NoteTextItem[] = (card.textItems && card.textItems.length > 0)
    ? card.textItems.map(i => ({ ...i }))
    : (card.content ? [{ id: 'legacy-text', text: card.content, x: 20, y: 90, w: 160, h: 90, size: 10, color: '#2a1a0a', rotation: 0 }] : []);

  const imageItems: NoteImageItem[] = (card.imageItems && card.imageItems.length > 0)
    ? card.imageItems.map(i => ({ ...i }))
    : (card.imageUrl ? [{ id: 'legacy-image', url: card.imageUrl, x: 30, y: 80, w: 140, h: 140, rotation: 0 }] : []);

  const noteCanvas = document.getElementById('note-canvas') as HTMLDivElement;
  noteCanvas.style.background = card.noteColor || '#fffacd';
  const drawCanvas = document.getElementById('note-draw-canvas') as HTMLCanvasElement;
  const drawCtx = drawCanvas.getContext('2d')!;
  const selectionBox = document.getElementById('note-selection') as HTMLDivElement;
  let selected: { type: 'text' | 'image'; id: string } | null = null;

  const fontControls = document.getElementById('note-text-controls') as HTMLDivElement;
  const fontColorInput = document.getElementById('note-font-color') as HTMLInputElement;
  const fontSizeInput = document.getElementById('note-font-size') as HTMLInputElement;
  const fontSizeLabel = document.getElementById('note-font-size-label') as HTMLSpanElement;
  const selectedLabel = document.getElementById('note-selected-label') as HTMLSpanElement;
  const deleteBtn = document.getElementById('btn-delete-item') as HTMLButtonElement;

  let liveUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  function buildCardUpdateOp(): BoardOp {
    const title = (document.getElementById('card-title-edit') as HTMLInputElement).value;
    const noteColor = (document.getElementById('card-color-edit') as HTMLInputElement).value;
    const tag = (document.getElementById('card-tag-edit') as HTMLSelectElement).value || undefined;
    return {
      type: 'update_card',
      cardId: card.id,
      content: textItems[0]?.text || '',
      title,
      tag: tag as any,
      noteColor,
      textItems: textItems.length ? textItems : undefined,
      imageItems: imageItems.length ? imageItems : undefined,
      imageUrl: undefined,
    };
  }

  function queueLiveCardUpdate(): void {
    if (liveUpdateTimer) clearTimeout(liveUpdateTimer);
    liveUpdateTimer = setTimeout(() => {
      net.sendBoardOp(gameStore.getLobbyId(), buildCardUpdateOp());
    }, 120);
  }

  (document.getElementById('card-color-edit') as HTMLInputElement).addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    noteCanvas.style.background = val;
    queueLiveCardUpdate();
  });

  (document.getElementById('card-title-edit') as HTMLInputElement).addEventListener('input', () => {
    renderCanvas();
    queueLiveCardUpdate();
  });

  function renderCanvas(): void {
    noteCanvas.querySelectorAll('.note-canvas-item, .note-canvas-title').forEach(el => el.remove());
    const titleValue = (document.getElementById('card-title-edit') as HTMLInputElement).value.trim();
    if (titleValue) {
      const titleScale = noteCanvas.clientWidth / CARD_W;
      const fontSize = CARD_TITLE_SIZE * titleScale;
      const title = document.createElement('div');
      title.className = 'note-canvas-title';
      title.textContent = titleValue;
      title.style.left = `${CARD_TITLE_X * titleScale}px`;
      title.style.top = `${CARD_TITLE_Y * titleScale}px`;
      title.style.width = `${CARD_TITLE_WRAP * titleScale}px`;
      title.style.fontSize = `${fontSize}px`;
      title.style.lineHeight = `${fontSize}px`;
      title.style.fontFamily = 'Georgia, serif';
      title.style.fontWeight = 'bold';
      noteCanvas.appendChild(title);
    }
    for (const item of imageItems) {
      const img = document.createElement('img');
      img.src = item.url;
      img.className = 'note-canvas-item note-image';
      img.style.left = `${item.x}px`;
      img.style.top = `${item.y}px`;
      img.style.width = `${item.w}px`;
      img.style.height = `${item.h}px`;
      img.style.transform = `rotate(${item.rotation || 0}deg)`;
      img.dataset.id = item.id;
      img.dataset.type = 'image';
      img.draggable = false;
      img.addEventListener('dragstart', (evt) => evt.preventDefault());
      noteCanvas.appendChild(img);
    }
    for (const item of textItems) {
      const div = document.createElement('div');
      div.contentEditable = 'false';
      div.className = 'note-canvas-item note-text';
      div.textContent = item.text;
      const legacyY = item.id === 'legacy-text' ? Math.max(item.y, 90) : item.y;
      div.style.left = `${item.x}px`;
      div.style.top = `${legacyY}px`;
      if (item.w) div.style.width = `${item.w}px`;
      if (item.h) div.style.height = `${item.h}px`;
      div.style.fontSize = `${item.size || 14}px`;
      div.style.color = item.color || '#2a1a0a';
      div.style.transform = `rotate(${item.rotation || 0}deg)`;
      div.dataset.id = item.id;
      div.dataset.type = 'text';
      div.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        div.contentEditable = 'true';
        div.focus();
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(div);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      div.addEventListener('blur', () => {
        div.contentEditable = 'false';
        item.text = div.textContent || '';
        queueLiveCardUpdate();
      });
      div.addEventListener('input', () => {
        item.text = div.textContent || '';
        queueLiveCardUpdate();
      });
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          div.blur();
        }
      });
      noteCanvas.appendChild(div);
    }
  }

  function setSelected(type: 'text' | 'image', id: string): void {
    selected = { type, id };
    selectedLabel.textContent = `${type === 'text' ? 'Text' : 'Image'} (${id.slice(0, 8)})`;
    const item = (type === 'text' ? textItems : imageItems).find(i => i.id === id) as any;
    if (!item) return;
    if (type === 'text') {
      if (!item.w || !item.h) {
        const el = getSelectedElement();
        if (el) {
          item.w = el.offsetWidth;
          item.h = el.offsetHeight;
        }
      }
      fontControls.style.display = 'flex';
      fontColorInput.value = item.color || '#2a1a0a';
      fontSizeInput.value = String(item.size || 14);
      fontSizeLabel.textContent = `${item.size || 14}px`;
    } else {
      fontControls.style.display = 'none';
    }
    updateSelectionBox();
  }
  
  function clearSelection(): void {
    selected = null;
    selectedLabel.textContent = 'None';
    fontControls.style.display = 'none';
    selectionBox.style.display = 'none';
  }

  function updateSelected(): void {
    if (!selected) return;
    const item = (selected.type === 'text' ? textItems : imageItems).find(i => i.id === selected!.id) as any;
    if (!item) return;
    if (selected.type === 'text') {
      item.color = fontColorInput.value;
      item.size = parseInt(fontSizeInput.value) || 14;
      fontSizeLabel.textContent = `${item.size}px`;
    }
    renderCanvas();
    updateSelectionBox();
    queueLiveCardUpdate();
  }

  function getSelectedElement(): HTMLElement | null {
    if (!selected) return null;
    return noteCanvas.querySelector(`.note-canvas-item[data-id="${selected.id}"][data-type="${selected.type}"]`) as HTMLElement | null;
  }

  function updateSelectionBox(): void {
    const el = getSelectedElement();
    if (!el) {
      selectionBox.style.display = 'none';
      return;
    }
    const item = (selected!.type === 'text' ? textItems : imageItems).find(i => i.id === selected!.id) as any;
    if (!item) return;
    const size = getItemSize(item, selected!.type);
    const w = size.w;
    const h = size.h;
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${item.x}px`;
    selectionBox.style.top = `${item.y}px`;
    selectionBox.style.width = `${w}px`;
    selectionBox.style.height = `${h}px`;
    selectionBox.style.transform = `rotate(${item.rotation || 0}deg)`;
    selectionBox.style.transformOrigin = 'center center';
  }

  fontColorInput.addEventListener('input', updateSelected);
  fontSizeInput.addEventListener('input', updateSelected);
  
  function getItemSize(item: any, type: 'text' | 'image'): { w: number; h: number } {
    if (type === 'text' && item.w && item.h) {
      return { w: item.w, h: item.h };
    }
    const el = getSelectedElement();
    if (el) {
      return { w: el.offsetWidth, h: el.offsetHeight };
    }
    if (type === 'image') {
      return { w: item.w || 80, h: item.h || 80 };
    }
    return { w: item.w || 120, h: item.h || 40 };
  }

  function clampPosition(pos: number, size: number, limit: number): number {
    const min = Math.min(0, limit - size);
    const max = Math.max(0, limit - size);
    return clamp(pos, min, max);
  }

  let draggingItem: { id: string; type: 'text' | 'image'; offsetX: number; offsetY: number } | null = null;
  noteCanvas.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.note-selection')) return;
    const id = target.dataset.id;
    const type = target.dataset.type as 'text' | 'image' | undefined;
    if (!id || !type) {
      clearSelection();
      return;
    }
    if (noteCanvas.classList.contains('drawing-active')) return;
    if (target.isContentEditable) return;
    setSelected(type, id);
    const rect = noteCanvas.getBoundingClientRect();
    const item = (type === 'text' ? textItems : imageItems).find(i => i.id === id) as any;
    if (!item) return;
    draggingItem = {
      id,
      type,
      offsetX: e.clientX - rect.left - item.x,
      offsetY: e.clientY - rect.top - item.y,
    };
  });

  window.addEventListener('mousemove', (e) => {
    if (!draggingItem) return;
    const rect = noteCanvas.getBoundingClientRect();
    const item = (draggingItem.type === 'text' ? textItems : imageItems).find(i => i.id === draggingItem!.id) as any;
    if (!item) return;
    const nextX = e.clientX - rect.left - draggingItem.offsetX;
    const nextY = e.clientY - rect.top - draggingItem.offsetY;
    const size = getItemSize(item, draggingItem.type);
    const w = size.w;
    const h = size.h;
    item.x = clampPosition(nextX, w, NOTE_CANVAS_W);
    item.y = clampPosition(nextY, h, NOTE_CANVAS_H);
    renderCanvas();
    updateSelectionBox();
  });

  window.addEventListener('mouseup', () => {
    const hadDrag = draggingItem !== null;
    draggingItem = null;
    if (hadDrag) queueLiveCardUpdate();
  });

  let rotateHandleActive = false;
  let scaleHandle: string | null = null;
  let startAngle = 0;
  let startRotation = 0;
  let startW = 0;
  let startH = 0;
  let startX = 0;
  let startY = 0;

  selectionBox.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const handle = (e.target as HTMLElement).dataset.handle;
    if (!selected) return;
    e.preventDefault();
    const rect = noteCanvas.getBoundingClientRect();
    const item = (selected.type === 'text' ? textItems : imageItems).find(i => i.id === selected!.id) as any;
    if (!item) return;
    const size = getItemSize(item, selected.type);
    if (!handle) {
      draggingItem = {
        id: selected.id,
        type: selected.type,
        offsetX: e.clientX - rect.left - item.x,
        offsetY: e.clientY - rect.top - item.y,
      };
      return;
    }
    if (handle === 'rotate') {
      rotateHandleActive = true;
      const cx = rect.left + item.x + size.w / 2;
      const cy = rect.top + item.y + size.h / 2;
      startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      startRotation = item.rotation || 0;
    } else {
      scaleHandle = handle;
      startW = size.w;
      startH = size.h;
      startX = item.x;
      startY = item.y;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!selected) return;
    const rect = noteCanvas.getBoundingClientRect();
    const item = (selected.type === 'text' ? textItems : imageItems).find(i => i.id === selected!.id) as any;
    if (!item) return;
    const size = getItemSize(item, selected.type);
    if (rotateHandleActive) {
      const cx = rect.left + item.x + size.w / 2;
      const cy = rect.top + item.y + size.h / 2;
      let angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      let next = startRotation + (angle - startAngle);
      if (e.shiftKey) {
        next = Math.round(next / 15) * 15;
      }
      item.rotation = next;
      renderCanvas();
      updateSelectionBox();
      return;
    }
    if (scaleHandle) {
      // Raw mouse delta
      let dx = e.clientX - rect.left - startX;
      let dy = e.clientY - rect.top - startY;
      
      // Account for item rotation by rotating the delta backwards
      const rotationRad = ((item.rotation || 0) * Math.PI) / 180;
      const rotatedDx = dx * Math.cos(-rotationRad) - dy * Math.sin(-rotationRad);
      const rotatedDy = dx * Math.sin(-rotationRad) + dy * Math.cos(-rotationRad);
      dx = rotatedDx;
      dy = rotatedDy;
      
      let w = startW;
      let h = startH;
      if (scaleHandle.includes('br')) {
        w = Math.max(20, dx);
        h = Math.max(20, dy);
      } else if (scaleHandle.includes('tr')) {
        w = Math.max(20, dx);
        h = Math.max(20, startH - dy);
        item.y = startY + (startH - h);
      } else if (scaleHandle.includes('bl')) {
        w = Math.max(20, startW - dx);
        h = Math.max(20, dy);
        item.x = startX + (startW - w);
      } else if (scaleHandle.includes('tl')) {
        w = Math.max(20, startW - dx);
        h = Math.max(20, startH - dy);
        item.x = startX + (startW - w);
        item.y = startY + (startH - h);
      }
      if (e.shiftKey) {
        const ratio = startW / Math.max(1, startH);
        h = w / ratio;
      }
      if (selected.type === 'text') {
        item.w = w;
        item.h = h;
      } else {
        item.w = w;
        item.h = h;
      }
      item.x = clampPosition(item.x, w, NOTE_CANVAS_W);
      item.y = clampPosition(item.y, h, NOTE_CANVAS_H);
      renderCanvas();
      updateSelectionBox();
      return;
    }
  });

  window.addEventListener('mouseup', () => {
    const hadTransform = rotateHandleActive || scaleHandle !== null;
    rotateHandleActive = false;
    scaleHandle = null;
    if (hadTransform) queueLiveCardUpdate();
  });

  deleteBtn.addEventListener('click', () => {
    if (!selected) return;
    if (selected.type === 'text') {
      const idx = textItems.findIndex(t => t.id === selected!.id);
      if (idx >= 0) textItems.splice(idx, 1);
    } else {
      const idx = imageItems.findIndex(i => i.id === selected!.id);
      if (idx >= 0) imageItems.splice(idx, 1);
    }
    selected = null;
    selectedLabel.textContent = 'None';
    selectionBox.style.display = 'none';
    renderCanvas();
  });

  document.getElementById('btn-add-text')!.addEventListener('click', () => {
    const id = `txt_${Math.random().toString(36).slice(2, 8)}`;
    textItems.push({ id, text: 'Click to edit...', x: 20, y: 40, w: 160, h: 70, size: 14, color: '#2a1a0a', rotation: 0 });
    renderCanvas();
    setSelected('text', id);
    
    // Auto-focus for editing
    setTimeout(() => {
      const textDiv = noteCanvas.querySelector(`[data-id="${id}"]`) as HTMLDivElement;
      if (textDiv) {
        textDiv.contentEditable = 'true';
        textDiv.focus();
        textDiv.textContent = '';
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(textDiv);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 0);
  });

  function addImageFromUrl(url: string, size = 120): void {
    const img = new Image();
    img.onload = () => {
      const id = `img_${Math.random().toString(36).slice(2, 8)}`;
      imageItems.push({ id, url, x: 40, y: 80, w: size, h: size, rotation: 0 });
      renderCanvas();
      setSelected('image', id);
    };
    img.onerror = () => {
      showToast('Invalid image URL.');
    };
    img.src = url;
  }

  document.getElementById('btn-add-image')!.addEventListener('click', () => {
    openModal('Add Image', `
      <div class="form-row">
        <input type="text" id="note-image-url" class="input" placeholder="Image URL" />
      </div>
    `, 'Add', (overlay) => {
      const input = overlay.querySelector('#note-image-url') as HTMLInputElement | null;
      const url = input?.value.trim() || '';
      if (!url) return;
      addImageFromUrl(url, 120);
      overlay.remove();
    });
  });

  const suspects = gameStore.getState()?.caseData.suspects || [];
  document.getElementById('btn-add-suspect')!.addEventListener('click', () => {
    const options = suspects.map(s => `<option value="${escHtml(s.avatarUrl)}">${escHtml(s.name)}</option>`).join('');
    openModal('Add Suspect', `
      <div class="form-row">
        <select id="note-suspect-select" class="input-select">
          ${options}
        </select>
      </div>
    `, 'Add', (overlay) => {
      const select = overlay.querySelector('#note-suspect-select') as HTMLSelectElement | null;
      const url = select?.value || '';
      if (!url) return;
      addImageFromUrl(url, 90);
      overlay.remove();
    });
  });

  renderCanvas();

  // Drawing canvas
  let isDrawing = false;
  let drawMode: 'pen' | 'eraser' = 'pen';
  let brushSize = 3;
  const currentStroke: { x: number; y: number }[] = [];

  // Setup canvas for smooth drawing
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';

  function redrawStrokes(): void {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    if (card.drawingStrokes) {
      for (const stroke of card.drawingStrokes) {
        drawCtx.strokeStyle = stroke.color;
        drawCtx.lineWidth = stroke.width;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.beginPath();
        for (let i = 0; i < stroke.points.length; i++) {
          if (i === 0) drawCtx.moveTo(stroke.points[i].x, stroke.points[i].y);
          else drawCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        drawCtx.stroke();
      }
    }
  }

  redrawStrokes();

  function setDrawingActive(active: boolean): void {
    noteCanvas.classList.toggle('drawing-active', active);
  }

  function updateDrawButtons(): void {
    const isActive = noteCanvas.classList.contains('drawing-active');
    document.getElementById('draw-pen')?.classList.toggle('active', drawMode === 'pen' && isActive);
    document.getElementById('draw-eraser')?.classList.toggle('active', drawMode === 'eraser' && isActive);
  }

  drawCanvas.addEventListener('mousedown', (e) => { 
    if (!noteCanvas.classList.contains('drawing-active')) return;
    isDrawing = true; 
    currentStroke.length = 0;
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    currentStroke.push({ x, y });
  });
  
  drawCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    currentStroke.push({ x, y });

    if (drawMode === 'pen') {
      drawCtx.strokeStyle = '#2a1a0a';
      drawCtx.lineWidth = brushSize;
      drawCtx.globalCompositeOperation = 'source-over';
    } else {
      const noteColor = (document.getElementById('card-color-edit') as HTMLInputElement).value || '#fffacd';
      drawCtx.strokeStyle = noteColor;
      drawCtx.lineWidth = brushSize * 4;
      drawCtx.globalCompositeOperation = 'source-over';
    }
    
    if (currentStroke.length > 1) {
      drawCtx.beginPath();
      drawCtx.moveTo(currentStroke[currentStroke.length - 2].x, currentStroke[currentStroke.length - 2].y);
      drawCtx.lineTo(x, y);
      drawCtx.stroke();
    }
  });
  
  drawCanvas.addEventListener('mouseup', () => {
    if (!isDrawing) return;
    if (isDrawing && currentStroke.length > 0) {
      const noteColor = (document.getElementById('card-color-edit') as HTMLInputElement).value || '#fffacd';
      const stroke: DrawingStroke = {
        points: [...currentStroke],
        color: drawMode === 'pen' ? '#2a1a0a' : noteColor,
        width: drawMode === 'pen' ? brushSize : brushSize * 4,
      };
      sendBoardOpWithHistory({ type: 'draw_stroke', cardId: card.id, stroke });
    }
    isDrawing = false;
  });
  
  drawCanvas.addEventListener('mouseleave', () => {
    if (isDrawing && currentStroke.length > 0) {
      const noteColor = (document.getElementById('card-color-edit') as HTMLInputElement).value || '#fffacd';
      const stroke: DrawingStroke = {
        points: [...currentStroke],
        color: drawMode === 'pen' ? '#2a1a0a' : noteColor,
        width: drawMode === 'pen' ? brushSize : brushSize * 4,
      };
      sendBoardOpWithHistory({ type: 'draw_stroke', cardId: card.id, stroke });
    }
    isDrawing = false;
  });

  document.getElementById('draw-pen')!.addEventListener('click', () => { 
    drawMode = 'pen'; 
    brushSize = 3;
    setDrawingActive(true);
    updateDrawButtons();
  });
  
  document.getElementById('draw-eraser')!.addEventListener('click', () => { 
    drawMode = 'eraser'; 
    brushSize = 8;
    setDrawingActive(true);
    updateDrawButtons();
  });
  
  document.getElementById('draw-clear')!.addEventListener('click', () => {
    sendBoardOpWithHistory({ type: 'erase_strokes', cardId: card.id });
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  });
  
  updateDrawButtons();

  document.getElementById('card-save')!.addEventListener('click', () => {
    const title = (document.getElementById('card-title-edit') as HTMLInputElement).value;
    const noteColor = (document.getElementById('card-color-edit') as HTMLInputElement).value;
    const content = textItems[0]?.text || '';
    const tag = (document.getElementById('card-tag-edit') as HTMLSelectElement).value || undefined;
    sendBoardOpWithHistory({
      type: 'update_card',
      cardId: card.id,
      content,
      title,
      tag: tag as any,
      noteColor,
      textItems: textItems.length ? textItems : undefined,
      imageItems: imageItems.length ? imageItems : undefined,
      imageUrl: undefined,
    });
    net.sendBoardOp(gameStore.getLobbyId(), { type: 'unlock_card', cardId: card.id });
    overlay.remove();
  });

  // Add auto-save listeners for title and color
  const titleInput = document.getElementById('card-title-edit') as HTMLInputElement;
  const colorInput = document.getElementById('card-color-edit') as HTMLInputElement;
  
  const autoSave = () => {
    queueLiveCardUpdate();
  };
  
  titleInput?.addEventListener('change', autoSave);
  colorInput?.addEventListener('change', autoSave);

  document.getElementById('card-cancel')!.addEventListener('click', () => {
    net.sendBoardOp(gameStore.getLobbyId(), { type: 'unlock_card', cardId: card.id });
    overlay.remove();
  });
}

function openTapeEditor(tape: BoardTape): void {
  const overlay = document.createElement('div');
  overlay.className = 'card-editor-overlay';
  
  const TAPE_CANVAS_W = 240;
  const TAPE_CANVAS_H = 80;
  
  overlay.innerHTML = `
    <div class="card-editor">
      <h3>Edit Tape</h3>
      <div class="note-canvas-toolbar">
        <div class="note-canvas-actions">
          <button class="btn btn-xs" id="btn-add-tape-text">Add Text</button>
          <button class="btn btn-xs" id="btn-delete-tape-item">Delete</button>
        </div>
        <div class="note-canvas-tools">
          <button class="btn btn-xs" id="draw-tape-pen">✏️ Pen</button>
          <button class="btn btn-xs" id="draw-tape-eraser">🧹 Erase</button>
          <button class="btn btn-xs" id="draw-tape-clear">Clear Drawing</button>
        </div>
      </div>
      <div class="note-canvas-row">
        <div class="note-canvas" id="tape-canvas" style="width: ${TAPE_CANVAS_W}px; height: ${TAPE_CANVAS_H}px; background: #f5deb3; position: relative; margin: 20px auto; border: 1px solid #ddd; border-radius: 4px;">
          <canvas id="tape-draw-canvas" width="${TAPE_CANVAS_W}" height="${TAPE_CANVAS_H}"></canvas>
          <div class="note-selection" id="tape-selection" style="display:none;">
            <div class="handle handle-rotate" data-handle="rotate"></div>
            <div class="handle handle-tl" data-handle="scale-tl"></div>
            <div class="handle handle-tr" data-handle="scale-tr"></div>
            <div class="handle handle-bl" data-handle="scale-bl"></div>
            <div class="handle handle-br" data-handle="scale-br"></div>
          </div>
        </div>
        <div class="note-side note-side-right">
          <div class="note-inspector" id="tape-inspector">
            <div class="form-row">
              <label>Selected</label>
              <span id="tape-selected-label" class="muted">None</span>
            </div>
            <div class="form-row" id="tape-text-controls" style="display:none;">
              <label>Text Color</label>
              <input type="color" id="tape-font-color" value="#2a1a0a" />
              <label>Text Size</label>
              <input type="range" id="tape-font-size" min="8" max="32" value="12" />
              <span id="tape-font-size-label">12px</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="tape-cancel">Cancel</button>
        <button class="btn btn-play" id="tape-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const textItems: NoteTextItem[] = tape.textItems ? tape.textItems.map(i => ({ ...i })) : [];

  let liveTapeUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  function buildTapeUpdateOp(): BoardOp {
    return {
      type: 'update_tape',
      tapeId: tape.id,
      textItems: textItems.length ? textItems : undefined,
      drawingStrokes: tape.drawingStrokes,
    };
  }

  function queueLiveTapeUpdate(): void {
    if (liveTapeUpdateTimer) clearTimeout(liveTapeUpdateTimer);
    liveTapeUpdateTimer = setTimeout(() => {
      net.sendBoardOp(gameStore.getLobbyId(), buildTapeUpdateOp());
    }, 120);
  }
  
  const tapeCanvas = document.getElementById('tape-canvas') as HTMLDivElement;
  const drawCanvas = document.getElementById('tape-draw-canvas') as HTMLCanvasElement;
  const drawCtx = drawCanvas.getContext('2d')!;
  const selectionBox = document.getElementById('tape-selection') as HTMLDivElement;
  let selected: { type: 'text'; id: string } | null = null;

  const fontControls = document.getElementById('tape-text-controls') as HTMLDivElement;
  const fontColorInput = document.getElementById('tape-font-color') as HTMLInputElement;
  const fontSizeInput = document.getElementById('tape-font-size') as HTMLInputElement;
  const fontSizeLabel = document.getElementById('tape-font-size-label') as HTMLSpanElement;
  const selectedLabel = document.getElementById('tape-selected-label') as HTMLSpanElement;
  const deleteBtn = document.getElementById('btn-delete-tape-item') as HTMLButtonElement;

  function renderCanvas(): void {
    tapeCanvas.querySelectorAll('.note-canvas-item').forEach(el => el.remove());
    
    for (const item of textItems) {
      const div = document.createElement('div');
      div.contentEditable = 'false';
      div.className = 'note-canvas-item note-text';
      div.textContent = item.text;
      div.style.position = 'absolute';
      div.style.left = `${item.x}px`;
      div.style.top = `${item.y}px`;
      if (item.w) div.style.width = `${item.w}px`;
      if (item.h) div.style.height = `${item.h}px`;
      div.style.fontSize = `${item.size || 12}px`;
      div.style.color = item.color || '#2a1a0a';
      div.style.transform = `rotate(${ item.rotation || 0}deg)`;
      div.dataset.id = item.id;
      div.dataset.type = 'text';
      div.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        div.contentEditable = 'true';
        div.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(div);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      div.addEventListener('blur', () => {
        div.contentEditable = 'false';
        item.text = div.textContent || '';
        queueLiveTapeUpdate();
      });
      div.addEventListener('input', () => {
        item.text = div.textContent || '';
        queueLiveTapeUpdate();
      });
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          div.blur();
        }
      });
      tapeCanvas.appendChild(div);
    }
  }

  function setSelected(id: string): void {
    selected = { type: 'text', id };
    selectedLabel.textContent = `Text (${id.slice(0, 8)})`;
    const item = textItems.find(i => i.id === id);
    if (!item) return;
    const el = getSelectedElement();
    if (el && (!item.w || !item.h)) {
      item.w = el.offsetWidth;
      item.h = el.offsetHeight;
    }
    fontControls.style.display = 'flex';
    fontColorInput.value = item.color || '#2a1a0a';
    fontSizeInput.value = String(item.size || 12);
    fontSizeLabel.textContent = `${item.size || 12}px`;
    updateSelectionBox();
  }

  function clearSelection(): void {
    selected = null;
    selectedLabel.textContent = 'None';
    fontControls.style.display = 'none';
    selectionBox.style.display = 'none';
  }

  function updateSelected(): void {
    if (!selected) return;
    const item = textItems.find(i => i.id === selected!.id);
    if (!item) return;
    item.color = fontColorInput.value;
    item.size = parseInt(fontSizeInput.value) || 12;
    fontSizeLabel.textContent = `${item.size}px`;
    renderCanvas();
    updateSelectionBox();
    queueLiveTapeUpdate();
  }

  function getSelectedElement(): HTMLElement | null {
    if (!selected) return null;
    return tapeCanvas.querySelector(`.note-canvas-item[data-id="${selected.id}"][data-type="text"]`) as HTMLElement | null;
  }

  function updateSelectionBox(): void {
    const el = getSelectedElement();
    if (!el) {
      selectionBox.style.display = 'none';
      return;
    }
    const item = textItems.find(i => i.id === selected!.id);
    if (!item) return;
    const w = item.w || el.offsetWidth;
    const h = item.h || el.offsetHeight;
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${item.x}px`;
    selectionBox.style.top = `${item.y}px`;
    selectionBox.style.width = `${w}px`;
    selectionBox.style.height = `${h}px`;
    selectionBox.style.transform = `rotate(${item.rotation || 0}deg)`;
    selectionBox.style.transformOrigin = 'center center';
  }

  fontColorInput.addEventListener('input', updateSelected);
  fontSizeInput.addEventListener('input', updateSelected);

  function getItemSize(item: NoteTextItem): { w: number; h: number } {
    if (item.w && item.h) return { w: item.w, h: item.h };
    const el = getSelectedElement();
    if (el) return { w: el.offsetWidth, h: el.offsetHeight };
    return { w: 60, h: 20 };
  }

  function clampPosition(pos: number, size: number, limit: number): number {
    const min = Math.min(0, limit - size);
    const max = Math.max(0, limit - size);
    return clamp(pos, min, max);
  }

  let draggingItem: { id: string; offsetX: number; offsetY: number } | null = null;

  tapeCanvas.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.note-selection')) return;
    const id = target.dataset.id;
    const type = target.dataset.type;
    if (!id || type !== 'text') {
      clearSelection();
      return;
    }
    if (tapeCanvas.classList.contains('drawing-active')) return;
    if (target.isContentEditable) return;
    setSelected(id);
    const rect = tapeCanvas.getBoundingClientRect();
    const item = textItems.find(i => i.id === id);
    if (!item) return;
    draggingItem = {
      id,
      offsetX: e.clientX - rect.left - item.x,
      offsetY: e.clientY - rect.top - item.y,
    };
  });

  window.addEventListener('mousemove', (e) => {
    if (!draggingItem) return;
    const rect = tapeCanvas.getBoundingClientRect();
    const item = textItems.find(i => i.id === draggingItem!.id);
    if (!item) return;
    const nextX = e.clientX - rect.left - draggingItem.offsetX;
    const nextY = e.clientY - rect.top - draggingItem.offsetY;
    const size = getItemSize(item);
    item.x = clampPosition(nextX, size.w, TAPE_CANVAS_W);
    item.y = clampPosition(nextY, size.h, TAPE_CANVAS_H);
    renderCanvas();
    updateSelectionBox();
  });

  window.addEventListener('mouseup', () => {
    const hadDrag = draggingItem !== null;
    draggingItem = null;
    if (hadDrag) queueLiveTapeUpdate();
  });

  let rotateHandleActive = false;
  let scaleHandle: string | null = null;
  let startAngle = 0;
  let startRotation = 0;
  let startW = 0;
  let startH = 0;
  let startX = 0;
  let startY = 0;

  selectionBox.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const handle = (e.target as HTMLElement).dataset.handle;
    if (!selected) return;
    e.preventDefault();
    const rect = tapeCanvas.getBoundingClientRect();
    const item = textItems.find(i => i.id === selected!.id);
    if (!item) return;
    const size = getItemSize(item);
    if (!handle) {
      draggingItem = {
        id: selected.id,
        offsetX: e.clientX - rect.left - item.x,
        offsetY: e.clientY - rect.top - item.y,
      };
      return;
    }
    if (handle === 'rotate') {
      rotateHandleActive = true;
      const cx = rect.left + item.x + size.w / 2;
      const cy = rect.top + item.y + size.h / 2;
      startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      startRotation = item.rotation || 0;
      return;
    }
    scaleHandle = handle;
    startW = size.w;
    startH = size.h;
    startX = item.x;
    startY = item.y;
  });

  window.addEventListener('mousemove', (e) => {
    if (!selected) return;
    const item = textItems.find(i => i.id === selected!.id);
    if (!item) return;
    const rect = tapeCanvas.getBoundingClientRect();
    if (rotateHandleActive) {
      const size = getItemSize(item);
      const cx = rect.left + item.x + size.w / 2;
      const cy = rect.top + item.y + size.h / 2;
      let angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      let next = startRotation + (angle - startAngle);
      if (e.shiftKey) {
        next = Math.round(next / 15) * 15;
      }
      item.rotation = next;
      renderCanvas();
      updateSelectionBox();
      return;
    }
    if (scaleHandle) {
      let dx = e.clientX - rect.left - startX;
      let dy = e.clientY - rect.top - startY;
      
      const rotationRad = ((item.rotation || 0) * Math.PI) / 180;
      const rotatedDx = dx * Math.cos(-rotationRad) - dy * Math.sin(-rotationRad);
      const rotatedDy = dx * Math.sin(-rotationRad) + dy * Math.cos(-rotationRad);
      dx = rotatedDx;
      dy = rotatedDy;
      
      let w = startW;
      let h = startH;
      if (scaleHandle.includes('br')) {
        w = Math.max(20, dx);
        h = Math.max(20, dy);
      } else if (scaleHandle.includes('tr')) {
        w = Math.max(20, dx);
        h = Math.max(20, startH - dy);
        item.y = startY + (startH - h);
      } else if (scaleHandle.includes('bl')) {
        w = Math.max(20, startW - dx);
        h = Math.max(20, dy);
        item.x = startX + (startW - w);
      } else if (scaleHandle.includes('tl')) {
        w = Math.max(20, startW - dx);
        h = Math.max(20, startH - dy);
        item.x = startX + (startW - w);
        item.y = startY + (startH - h);
      }
      if (e.shiftKey) {
        const ratio = startW / Math.max(1, startH);
        h = w / ratio;
      }
      item.w = w;
      item.h = h;
      item.x = clampPosition(item.x, w, TAPE_CANVAS_W);
      item.y = clampPosition(item.y, h, TAPE_CANVAS_H);
      renderCanvas();
      updateSelectionBox();
      return;
    }
  });

  window.addEventListener('mouseup', () => {
    const hadTransform = rotateHandleActive || scaleHandle !== null;
    rotateHandleActive = false;
    scaleHandle = null;
    if (hadTransform) queueLiveTapeUpdate();
  });

  deleteBtn.addEventListener('click', () => {
    if (!selected) return;
    const idx = textItems.findIndex(t => t.id === selected!.id);
    if (idx >= 0) textItems.splice(idx, 1);
    clearSelection();
    renderCanvas();
  });

  document.getElementById('btn-add-tape-text')!.addEventListener('click', () => {
    const id = `text_${Math.random().toString(36).slice(2, 8)}`;
    textItems.push({ id, text: 'Click to edit...', x: 20, y: 30, w: 60, h: 20, size: 12, color: '#2a1a0a', rotation: 0 });
    renderCanvas();
    setSelected(id);
    
    // Auto-focus for editing
    setTimeout(() => {
      const textDiv = tapeCanvas.querySelector(`[data-id="${id}"]`) as HTMLDivElement;
      if (textDiv) {
        textDiv.contentEditable = 'true';
        textDiv.focus();
        textDiv.textContent = '';
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(textDiv);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 0);
  });

  renderCanvas();

  // Drawing functionality
  let isDrawing = false;
  let drawMode: 'pen' | 'eraser' = 'pen';
  let brushSize = 2;
  const currentStroke: { x: number; y: number }[] = [];

  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';

  function redrawStrokes(): void {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    if (tape.drawingStrokes) {
      for (const stroke of tape.drawingStrokes) {
        drawCtx.strokeStyle = stroke.color;
        drawCtx.lineWidth = stroke.width;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.beginPath();
        for (let i = 0; i < stroke.points.length; i++) {
          if (i === 0) drawCtx.moveTo(stroke.points[i].x, stroke.points[i].y);
          else drawCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        drawCtx.stroke();
      }
    }
  }

  redrawStrokes();

  function setDrawingActive(active: boolean): void {
    tapeCanvas.classList.toggle('drawing-active', active);
  }

  function updateDrawButtons(): void {
    const isActive = tapeCanvas.classList.contains('drawing-active');
    document.getElementById('draw-tape-pen')?.classList.toggle('active', drawMode === 'pen' && isActive);
    document.getElementById('draw-tape-eraser')?.classList.toggle('active', drawMode === 'eraser' && isActive);
  }

  drawCanvas.addEventListener('mousedown', (e) => {
    if (!tapeCanvas.classList.contains('drawing-active')) return;
    isDrawing = true;
    currentStroke.length = 0;
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    currentStroke.push({ x, y });
  });

  drawCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    currentStroke.push({ x, y });

    if (drawMode === 'pen') {
      drawCtx.strokeStyle = '#2a1a0a';
      drawCtx.lineWidth = brushSize;
      drawCtx.globalCompositeOperation = 'source-over';
    } else {
      drawCtx.strokeStyle = '#f5deb3';
      drawCtx.lineWidth = brushSize * 4;
      drawCtx.globalCompositeOperation = 'source-over';
    }

    if (currentStroke.length > 1) {
      drawCtx.beginPath();
      drawCtx.moveTo(currentStroke[currentStroke.length - 2].x, currentStroke[currentStroke.length - 2].y);
      drawCtx.lineTo(x, y);
      drawCtx.stroke();
    }
  });

  drawCanvas.addEventListener('mouseup', () => {
    if (!isDrawing) return;
    if (isDrawing && currentStroke.length > 0) {
      const stroke: DrawingStroke = {
        points: [...currentStroke],
        color: drawMode === 'pen' ? '#2a1a0a' : '#f5deb3',
        width: drawMode === 'pen' ? brushSize : brushSize * 4,
      };
      sendBoardOpWithHistory({ type: 'draw_tape_stroke', tapeId: tape.id, stroke });
    }
    isDrawing = false;
  });

  drawCanvas.addEventListener('mouseleave', () => {
    if (isDrawing && currentStroke.length > 0) {
      const stroke: DrawingStroke = {
        points: [...currentStroke],
        color: drawMode === 'pen' ? '#2a1a0a' : '#f5deb3',
        width: drawMode === 'pen' ? brushSize : brushSize * 4,
      };
      sendBoardOpWithHistory({ type: 'draw_tape_stroke', tapeId: tape.id, stroke });
    }
    isDrawing = false;
  });

  document.getElementById('draw-tape-pen')!.addEventListener('click', () => {
    drawMode = 'pen';
    brushSize = 2;
    setDrawingActive(true);
    updateDrawButtons();
  });

  document.getElementById('draw-tape-eraser')!.addEventListener('click', () => {
    drawMode = 'eraser';
    brushSize = 8;
    setDrawingActive(true);
    updateDrawButtons();
  });

  document.getElementById('draw-tape-clear')!.addEventListener('click', () => {
    sendBoardOpWithHistory({ type: 'erase_tape_strokes', tapeId: tape.id });
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  });

  updateDrawButtons();

  document.getElementById('tape-save')!.addEventListener('click', () => {
    sendBoardOpWithHistory({
      type: 'update_tape',
      tapeId: tape.id,
      textItems: textItems.length ? textItems : undefined,
      drawingStrokes: tape.drawingStrokes,
    });
    overlay.remove();
  });

  document.getElementById('tape-cancel')!.addEventListener('click', () => {
    overlay.remove();
  });
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
