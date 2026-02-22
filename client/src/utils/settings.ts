// ─── Settings Manager (LocalStorage) ─────────────────────────────────────────

export interface Settings {
  displayName: string;
  filmGrain: boolean;
  vignette: boolean;
  reducedMotion: boolean;
  ambientVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muteAll: boolean;
}

const STORAGE_KEY = 'pci_settings';

const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  filmGrain: true,
  vignette: true,
  reducedMotion: false,
  ambientVolume: 0.5,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  muteAll: false,
};

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* use defaults */ }
  return currentSettings;
}

export function saveSettings(partial: Partial<Settings>): Settings {
  currentSettings = { ...currentSettings, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  return currentSettings;
}

export function getSettings(): Settings {
  return currentSettings;
}

export function getDisplayName(): string {
  if (!currentSettings.displayName) {
    currentSettings.displayName = `Detective_${Math.floor(Math.random() * 9999)}`;
    saveSettings(currentSettings);
  }
  return currentSettings.displayName;
}
