import { initSoundtrackSettings } from './soundtrack';
type Settings = { reducedMotion: boolean; uiScale: 'compact' | 'normal' | 'large' };
const KEY = 'dysto-settings';
const defaults: Settings = { reducedMotion: false, uiScale: 'normal' };
function readSettings(): Settings {
 try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
 catch { return { ...defaults }; }
}
export function initSettings(): void {
 const host = document.body;
 if (!host) return;
 const settings = readSettings();
 const apply = () => {
  document.documentElement.classList.toggle('dysto-reduced-motion', settings.reducedMotion);
  document.documentElement.dataset.uiScale = settings.uiScale;
 };
 apply();
 const open = document.getElementById('dysto-settings-open') as HTMLButtonElement | null ?? document.createElement('button');
 open.id = 'dysto-settings-open'; open.type = 'button'; open.className = 'retro-audio-toggle dysto-settings-open';
 open.textContent = '⚙'; open.setAttribute('aria-label','Abrir configuración'); open.title = 'Configuración'; open.setAttribute('aria-haspopup','dialog');
 open.style.position = 'relative';
 open.style.zIndex = '2';
 open.style.display = 'grid';
 open.style.placeItems = 'center';
 open.style.width = '32px';
 open.style.height = '32px';
 open.style.minWidth = '32px';
 open.style.flex = '0 0 32px';
 open.style.padding = '0';
 open.style.margin = '0 8px 0 0';
 open.style.background = '#101719';
 open.style.border = '1px solid #9af7aa';
 open.style.color = '#9af7aa';
 if (!open.isConnected) host.append(open);
 const modal = document.createElement('div'); modal.id = 'dysto-settings-modal'; modal.className = 'dysto-settings-backdrop'; modal.hidden = true;
 modal.innerHTML = `<section class="dysto-settings-panel" role="dialog" aria-modal="true" aria-labelledby="dysto-settings-title"><header class="dysto-settings-header"><div><p class="dysto-settings-kicker">SISTEMA</p><h2 id="dysto-settings-title">Configuración</h2></div><button type="button" class="dysto-settings-close" aria-label="Cerrar configuración">×</button></header><p class="dysto-settings-description">Ajustá la interfaz sin alterar el mundo ni la partida.</p><div class="dysto-setting-row"><div><strong>Sonidos</strong><small>Efectos retro, avisos y respuestas.</small></div><button type="button" id="dysto-setting-sound" class="dysto-setting-switch" role="switch">Activados</button></div><section class="dysto-soundtrack-settings"><h3>Banda sonora</h3><p>Agregá tus archivos de audio. Se guardan en este navegador.</p><div class="dysto-setting-row"><div><strong>Reproducción</strong><small>Reproduce las pistas en secuencia durante la partida.</small></div><button type="button" id="dysto-music-toggle" class="dysto-setting-switch" aria-pressed="true">Música activada</button></div><label class="dysto-volume-row"><span>Música <output id="dysto-music-value">45%</output></span><input id="dysto-music-volume" type="range" min="0" max="100" value="45" /></label><label class="dysto-volume-row"><span>Efectos de sonido <output id="dysto-effects-value">70%</output></span><input id="dysto-effects-volume" type="range" min="0" max="100" value="70" /></label><label class="dysto-audio-add">AGREGAR AUDIOS<input id="dysto-soundtrack-files" type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.opus,.webm" multiple /></label><div id="dysto-soundtrack-list" class="dysto-track-list"></div><h4>Música de combate</h4><p>Estas pistas se reproducen al entrar en combate y se reemplazan por la banda sonora normal al terminar.</p><label class="dysto-audio-add">AGREGAR MÚSICA DE COMBATE<input id="dysto-combat-soundtrack-files" type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.opus,.webm" multiple /></label><div id="dysto-combat-soundtrack-list" class="dysto-track-list"></div></section><div class="dysto-setting-row"><div><strong>Animaciones reducidas</strong><small>Reduce transiciones y efectos visuales.</small></div><button type="button" id="dysto-setting-motion" class="dysto-setting-switch" role="switch">Desactivadas</button></div><label class="dysto-setting-row dysto-setting-scale"><span><strong>Tamaño de interfaz</strong><small>Ajusta el tamaño general de los elementos.</small></span><select id="dysto-setting-scale"><option value="compact">Compacto</option><option value="normal">Normal</option><option value="large">Grande</option></select></label><footer class="dysto-settings-footer"><span>Los ajustes se guardan en este dispositivo.</span><button type="button" id="dysto-settings-done">LISTO</button></footer></section>`;
 document.body.append(modal);
 initSoundtrackSettings(modal);
 const soundButton = modal.querySelector<HTMLButtonElement>('#dysto-setting-sound')!;
 const motionButton = modal.querySelector<HTMLButtonElement>('#dysto-setting-motion')!;
 const scaleSelect = modal.querySelector<HTMLSelectElement>('#dysto-setting-scale')!;
 const soundEnabled = () => localStorage.getItem('dysto-settings-sound') !== 'off';
 const syncSwitch = (button: HTMLButtonElement, on: boolean, onText: string, offText: string) => { button.textContent = on ? onText : offText; button.setAttribute('aria-checked', String(on)); button.classList.toggle('is-on', on); };
 const sync = () => {
  syncSwitch(soundButton, soundEnabled(), 'Activados', 'Desactivados');
  syncSwitch(motionButton, settings.reducedMotion, 'Activadas', 'Desactivadas');
  scaleSelect.value = settings.uiScale;
 };
 const save = () => { localStorage.setItem(KEY, JSON.stringify(settings)); apply(); sync(); };
 const close = () => { modal.hidden = true; open.focus(); };
 open.addEventListener('click', () => { sync(); modal.hidden = false; modal.querySelector<HTMLButtonElement>('.dysto-settings-close')?.focus(); });
 modal.querySelectorAll<HTMLButtonElement>('.dysto-settings-close, #dysto-settings-done').forEach(button => button.addEventListener('click', close));
 modal.addEventListener('click', event => { if (event.target === modal) close(); });
 document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
 soundButton.addEventListener('click', () => { const enabled = !soundEnabled(); document.dispatchEvent(new CustomEvent('dysto-set-sound', { detail: { enabled } })); sync(); });
 motionButton.addEventListener('click', () => { settings.reducedMotion = !settings.reducedMotion; save(); });
 scaleSelect.addEventListener('change', () => { settings.uiScale = scaleSelect.value as Settings['uiScale']; save(); });
 sync();
}
