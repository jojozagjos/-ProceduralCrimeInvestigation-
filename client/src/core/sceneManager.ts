// ─── Scene Manager ───────────────────────────────────────────────────────────
// Manages transitions between HTML overlay scenes.

type SceneName = 'main-menu' | 'play' | 'lobby' | 'game' | 'settings' | 'tutorial' | 'credits';

let currentScene: SceneName = 'main-menu';
const sceneStack: SceneName[] = [];

type SceneRenderer = (container: HTMLElement) => void | (() => void);
const sceneRenderers = new Map<SceneName, SceneRenderer>();
let cleanupFn: (() => void) | void = undefined;

export function registerScene(name: SceneName, renderer: SceneRenderer): void {
  sceneRenderers.set(name, renderer);
}

export function navigateTo(name: SceneName, pushStack = true): void {
  if (pushStack && currentScene !== name) {
    sceneStack.push(currentScene);
  }

  if (typeof cleanupFn === 'function') cleanupFn();
  currentScene = name;

  const container = document.getElementById('app')!;
  container.innerHTML = '';
  container.className = `scene scene-${name}`;

  const renderer = sceneRenderers.get(name);
  if (renderer) {
    cleanupFn = renderer(container);
  }
}

export function goBack(): void {
  const prev = sceneStack.pop();
  if (prev) navigateTo(prev, false);
}

export function getCurrentScene(): SceneName {
  return currentScene;
}
