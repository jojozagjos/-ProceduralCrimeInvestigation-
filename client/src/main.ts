// ─── Client Entry Point ──────────────────────────────────────────────────────

import { registerScene, navigateTo } from './core/sceneManager.js';
import { loadSettings } from './utils/settings.js';
import { applyVisualEffects } from './scenes/settingsScene.js';
import { renderMainMenu } from './scenes/mainMenu.js';
import { renderPlayScene } from './scenes/playScene.js';
import { renderLobbyScene, setLobbyData } from './scenes/lobbyScene.js';
import { renderGameScene } from './scenes/gameScene.js';
import { renderSettingsScene } from './scenes/settingsScene.js';
import { renderTutorialScene } from './tutorial/tutorialScene.js';
import { renderCreditsScene } from './scenes/creditsScene.js';
import { gameStore } from './core/gameStore.js';
import * as net from './network/client.js';
import type { ServerMessage } from './utils/types.js';

// Load settings
loadSettings();
applyVisualEffects();

// Register all scenes
registerScene('main-menu', renderMainMenu);
registerScene('play', renderPlayScene);
registerScene('lobby', renderLobbyScene);
registerScene('game', renderGameScene);
registerScene('settings', renderSettingsScene);
registerScene('tutorial', renderTutorialScene);
registerScene('credits', renderCreditsScene);

// Global message handler for lobby join (sets data before scene renders)
net.onMessage((msg: ServerMessage) => {
  if (msg.type === 'lobby:joined') {
    setLobbyData(msg.data.lobby, msg.data.playerId);
  }
});

// Start at main menu
navigateTo('main-menu', false);
