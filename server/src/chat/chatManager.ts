import { genId } from '../utils/helpers.js';
import type { ChatMessage } from '../utils/types.js';

const chatRooms = new Map<string, ChatMessage[]>();
const rateLimits = new Map<string, number>(); // playerId -> last message timestamp

const MAX_MESSAGES = 100;
const RATE_LIMIT_MS = 1000;

export function initChat(lobbyId: string): void {
  if (!chatRooms.has(lobbyId)) {
    chatRooms.set(lobbyId, []);
  }
}

export function addMessage(lobbyId: string, sender: string, senderName: string, text: string, system = false): ChatMessage | string {
  if (!system) {
    const lastTime = rateLimits.get(sender) || 0;
    if (Date.now() - lastTime < RATE_LIMIT_MS) {
      return 'Rate limited. Wait a moment.';
    }
    rateLimits.set(sender, Date.now());
  }

  const messages = chatRooms.get(lobbyId);
  if (!messages) {
    chatRooms.set(lobbyId, []);
  }

  const msg: ChatMessage = {
    id: genId('msg'),
    sender,
    senderName,
    text: text.slice(0, 250),
    system,
    timestamp: Date.now(),
  };

  const room = chatRooms.get(lobbyId)!;
  room.push(msg);
  if (room.length > MAX_MESSAGES) {
    room.shift();
  }

  return msg;
}

export function getMessages(lobbyId: string): ChatMessage[] {
  return chatRooms.get(lobbyId) || [];
}

export function clearChat(lobbyId: string): void {
  chatRooms.delete(lobbyId);
}
