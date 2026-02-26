// ─── Chat Widget ─────────────────────────────────────────────────────────────

import * as net from '../network/client.js';
import type { ChatMessage, ServerMessage } from '../utils/types.js';

const messages: ChatMessage[] = [];

export function renderChat(container: HTMLElement, lobbyId: string, collapsible = false): () => void {
  container.innerHTML = `
    <div class="chat-widget ${collapsible ? 'collapsible' : ''}">
      ${collapsible ? '<button class="chat-toggle" id="chat-toggle">💬 Chat</button>' : '<h3 class="chat-header">Chat</h3>'}
      <div class="chat-body" id="chat-body">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-row">
          <input type="text" id="chat-input" class="input chat-input" placeholder="Type a message..." maxlength="250">
          <button class="btn btn-sm" id="chat-send">Send</button>
        </div>
      </div>
    </div>
  `;

  if (collapsible) {
    const toggle = container.querySelector('#chat-toggle') as HTMLButtonElement;
    const body = container.querySelector('#chat-body') as HTMLDivElement;
    if (toggle && body) {
      body.style.display = 'none';
      toggle.addEventListener('click', () => {
        body.style.display = body.style.display === 'none' ? 'flex' : 'none';
      });
    }
  }

  const input = container.querySelector('#chat-input') as HTMLInputElement;
  const sendBtn = container.querySelector('#chat-send') as HTMLButtonElement;
  
  if (!input || !sendBtn) {
    console.error('[Chat] Failed to find input or send button in container');
    return () => {};
  }

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    net.sendChat(lobbyId, text);
    input.value = '';
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

  const unsub = net.onMessage((msg: ServerMessage) => {
    if (msg.type === 'chat:message') {
      addChatMessage(msg.data);
    }
  });

  return () => { unsub(); };
}

function addChatMessage(msg: ChatMessage): void {
  messages.push(msg);
  if (messages.length > 100) messages.shift();

  const container = document.getElementById('chat-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `chat-msg ${msg.system ? 'system' : ''}`;
  if (msg.system) {
    div.textContent = msg.text;
  } else {
    div.innerHTML = `<strong>${escHtml(msg.senderName)}:</strong> ${escHtml(msg.text)}`;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
