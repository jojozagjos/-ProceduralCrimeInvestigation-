// ─── Audio Manager ───────────────────────────────────────────────────────────
// Manages placeholder audio; user will replace files later.

import { getSettings } from '../utils/settings.js';

type SoundName =
  | 'music_menu'
  | 'music_investigation'
  | 'music_interview'
  | 'music_cinematic'
  | 'sfx_pin_drop'
  | 'sfx_rope_attach'
  | 'sfx_ui_click'
  | 'sfx_ui_hover'
  | 'sfx_evidence_glow'
  | 'sfx_chat_message'
  | 'sfx_transition';

const audioCache = new Map<SoundName, HTMLAudioElement>();
let currentMusic: HTMLAudioElement | null = null;
let currentMusicName: SoundName | null = null;

const SOUND_PATHS: Record<SoundName, string> = {
  music_menu: '/audio/music/menu.mp3',
  music_investigation: '/audio/music/investigation.mp3',
  music_interview: '/audio/music/interview.mp3',
  music_cinematic: '/audio/music/cinematic.mp3',
  sfx_pin_drop: '/audio/sfx/pin_drop.mp3',
  sfx_rope_attach: '/audio/sfx/rope_attach.mp3',
  sfx_ui_click: '/audio/sfx/ui_click.mp3',
  sfx_ui_hover: '/audio/sfx/ui_hover.mp3',
  sfx_evidence_glow: '/audio/sfx/evidence_glow.mp3',
  sfx_chat_message: '/audio/sfx/chat_message.mp3',
  sfx_transition: '/audio/sfx/transition.mp3',
};

function getAudio(name: SoundName): HTMLAudioElement {
  let audio = audioCache.get(name);
  if (!audio) {
    audio = new Audio(SOUND_PATHS[name]);
    audio.preload = 'auto';
    audioCache.set(name, audio);
  }
  return audio;
}

export function playMusic(name: SoundName): void {
  if (currentMusicName === name) return;
  stopMusic();
  const settings = getSettings();
  if (settings.muteAll) return;

  try {
    const audio = getAudio(name);
    audio.loop = true;
    audio.volume = settings.musicVolume * (settings.muteAll ? 0 : 1);
    audio.play().catch(() => { /* placeholder may not exist */ });
    currentMusic = audio;
    currentMusicName = name;
  } catch { /* placeholder files may not exist */ }
}

export function stopMusic(): void {
  if (currentMusic) {
    currentMusic.pause();
    currentMusic.currentTime = 0;
    currentMusic = null;
    currentMusicName = null;
  }
}

export function playSfx(name: SoundName): void {
  const settings = getSettings();
  if (settings.muteAll) return;

  try {
    const audio = new Audio(SOUND_PATHS[name]);
    audio.volume = settings.sfxVolume * (settings.muteAll ? 0 : 1);
    audio.play().catch(() => { /* placeholder may not exist */ });
  } catch { /* ok */ }
}

export function updateMusicVolume(): void {
  if (currentMusic) {
    const settings = getSettings();
    currentMusic.volume = settings.muteAll ? 0 : settings.musicVolume;
  }
}

export function setMute(mute: boolean): void {
  if (currentMusic) {
    currentMusic.volume = mute ? 0 : getSettings().musicVolume;
  }
}
