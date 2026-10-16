type Track = { id: string; name: string; blob: Blob; mode?: 'normal' | 'combat' };
const DB = 'dysto-soundtrack';
const STORE = 'tracks';
const PREFS = 'dysto-soundtrack-prefs';
let audio: HTMLAudioElement | null = null;
let combatAudio: HTMLAudioElement | null = null;
let combatObjectUrl = '';
let combatFadeTimer: number | undefined;
let lastCombatTrackId = '';
let lastNormalTrackId = '';
let tracks: Track[] = [];
let combatTracks: Track[] = [];
let activeMode: 'normal' | 'combat' = 'normal';
let index = 0;
let objectUrl = '';
let enabled = true;
let musicVolume = 0.45;
let effectsVolume = 0.7;
let unlocked = false;
function dbOpen(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function readTracks(): Promise<Track[]> { try { const db = await dbOpen(); return await new Promise((resolve, reject) => { const req = db.transaction(STORE).objectStore(STORE).getAll(); req.onsuccess = () => resolve(req.result as Track[]); req.onerror = () => reject(req.error); }); } catch { return []; } }
async function storeTrack(track: Track): Promise<void> { const db = await dbOpen(); await new Promise<void>((resolve, reject) => { const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(track); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
async function removeTrack(id: string): Promise<void> { const db = await dbOpen(); await new Promise<void>((resolve, reject) => { const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
function persistPrefs(): void { localStorage.setItem(PREFS, JSON.stringify({ enabled, musicVolume, effectsVolume })); }
function currentTracks(): Track[] { return tracks; }
function chooseRandomTrack(): void { const list = tracks; if (!list.length) { index = 0; return; } const previousId = list[index]?.id || lastNormalTrackId; const choices = list.map((_, i) => i).filter(i => list.length === 1 || list[i].id !== previousId); index = choices[Math.floor(Math.random() * choices.length)] ?? 0; lastNormalTrackId = list[index]?.id || ''; }
let fadeTimer: number | undefined;
function cancelFade(): void { if (fadeTimer !== undefined) { window.clearInterval(fadeTimer); fadeTimer = undefined; } }
function fadeTo(target: number, duration: number, done?: () => void): void {
  if (!audio) { done?.(); return; }
  cancelFade();
  const player = audio;
  const initial = player.volume;
  const started = performance.now();
  if (duration <= 0) { player.volume = target; done?.(); return; }
  fadeTimer = window.setInterval(() => {
    if (audio !== player) { cancelFade(); return; }
    const progress = Math.min(1, (performance.now() - started) / duration);
    player.volume = Math.max(0, Math.min(1, initial + (target - initial) * progress));
    if (progress >= 1) { cancelFade(); done?.(); }
  }, 25);
}
function startTrack(): void { const list = tracks; if (!audio || !list.length || !enabled || !unlocked) return; const track = list[index % list.length]; lastNormalTrackId = track.id; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = URL.createObjectURL(track.blob); audio.src = objectUrl; audio.volume = activeMode === 'combat' ? 0 : musicVolume; void audio.play().catch(() => {}); }
function fadeCombatTo(target: number, duration: number, done?: () => void): void {
  if (!combatAudio) { done?.(); return; }
  if (combatFadeTimer !== undefined) window.clearInterval(combatFadeTimer);
  const player = combatAudio; const initial = player.volume; const started = performance.now();
  if (duration <= 0) { player.volume = target; done?.(); return; }
  combatFadeTimer = window.setInterval(() => {
    if (combatAudio !== player) { if (combatFadeTimer !== undefined) window.clearInterval(combatFadeTimer); combatFadeTimer = undefined; return; }
    const progress = Math.min(1, (performance.now() - started) / duration);
    player.volume = Math.max(0, Math.min(1, initial + (target - initial) * progress));
    if (progress >= 1) { if (combatFadeTimer !== undefined) window.clearInterval(combatFadeTimer); combatFadeTimer = undefined; done?.(); }
  }, 25);
}
function startCombatTrack(): void {
  if (!combatAudio || !combatTracks.length || !enabled || !unlocked) return;
  if (combatObjectUrl) URL.revokeObjectURL(combatObjectUrl);
  const choices = combatTracks.filter(track => combatTracks.length === 1 || track.id !== lastCombatTrackId);
  const track = choices[Math.floor(Math.random() * choices.length)] || combatTracks[0];
  lastCombatTrackId = track.id;
  combatObjectUrl = URL.createObjectURL(track.blob); combatAudio.src = combatObjectUrl;
  combatAudio.loop = false; combatAudio.volume = 0;
  void combatAudio.play().then(() => fadeCombatTo(musicVolume, 900)).catch(() => {});
}
function renderList(list: HTMLElement, playlist: 'normal' | 'combat' = 'normal'): void { const collection = playlist === 'combat' ? combatTracks : tracks; list.replaceChildren(); if (!collection.length) { const empty = document.createElement('p'); empty.className = 'dysto-track-empty'; empty.textContent = playlist === 'combat' ? 'Todavía no agregaste música de combate.' : 'Todavía no agregaste pistas.'; list.append(empty); return; } collection.forEach((track, i) => { const row = document.createElement('div'); row.className = 'dysto-track-row'; const name = document.createElement('button'); name.type = 'button'; name.className = 'dysto-track-name'; name.textContent = `${i + 1}. ${track.name}`; name.title = 'Reproducir pista'; name.addEventListener('click', () => { if (playlist === 'combat') { if (!combatAudio) combatAudio = new Audio(); if (combatObjectUrl) URL.revokeObjectURL(combatObjectUrl); const track = combatTracks[i]; combatObjectUrl = URL.createObjectURL(track.blob); combatAudio.src = combatObjectUrl; combatAudio.volume = musicVolume; void combatAudio.play().catch(() => {}); } else { index = i; activeMode = 'normal'; startTrack(); } }); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'dysto-track-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Quitar ${track.name}`); remove.addEventListener('click', async () => { await removeTrack(track.id); if (playlist === 'combat') combatTracks = combatTracks.filter(t => t.id !== track.id); else tracks = tracks.filter(t => t.id !== track.id); if (index >= currentTracks().length) index = 0; if (currentTracks().length) startTrack(); else if (audio) { audio.pause(); audio.removeAttribute('src'); } renderList(list, playlist); }); row.append(name, remove); list.append(row); }); }
export function initSoundtrackSettings(modal: HTMLElement): void {
  try { const saved = JSON.parse(localStorage.getItem(PREFS) || '{}'); enabled = saved.enabled ?? true; musicVolume = saved.musicVolume ?? 0.45; effectsVolume = saved.effectsVolume ?? 0.7; } catch { /* defaults */ }
  audio = audio || new Audio(); audio.loop = false; audio.preload = 'metadata'; combatAudio = combatAudio || new Audio(); combatAudio.loop = false; combatAudio.preload = 'metadata'; audio.addEventListener('ended', () => { if (tracks.length && enabled) { chooseRandomTrack(); startTrack(); } }); combatAudio.addEventListener('ended', () => { if (activeMode === 'combat' && combatTracks.length && enabled) startCombatTrack(); });
  const host = modal.querySelector<HTMLElement>('#dysto-soundtrack-list'); if (!host) return;
  const picker = modal.querySelector<HTMLInputElement>('#dysto-soundtrack-files')!;
  const combatPicker = modal.querySelector<HTMLInputElement>('#dysto-combat-soundtrack-files');
  const combatList = modal.querySelector<HTMLElement>('#dysto-combat-soundtrack-list');
  const toggle = modal.querySelector<HTMLButtonElement>('#dysto-music-toggle')!;
  const music = modal.querySelector<HTMLInputElement>('#dysto-music-volume')!;
  const effects = modal.querySelector<HTMLInputElement>('#dysto-effects-volume')!;
  const musicValue = modal.querySelector<HTMLElement>('#dysto-music-value')!;
  const effectsValue = modal.querySelector<HTMLElement>('#dysto-effects-value')!;
  const sync = () => { toggle.textContent = enabled ? 'Música activada' : 'Música silenciada'; toggle.setAttribute('aria-pressed', String(enabled)); music.value = String(musicVolume * 100); effects.value = String(effectsVolume * 100); musicValue.textContent = `${Math.round(musicVolume * 100)}%`; effectsValue.textContent = `${Math.round(effectsVolume * 100)}%`; if (audio) audio.volume = musicVolume; document.documentElement.style.setProperty('--dysto-effects-volume', String(effectsVolume)); };
  toggle.addEventListener('click', () => { enabled = !enabled; if (audio) { if (!enabled) { audio.pause(); combatAudio?.pause(); } else { unlocked = true; if (audio.src) { void audio.play().catch(() => {}); if (activeMode === 'normal') fadeTo(musicVolume, 350); } else startTrack(); if (activeMode === 'combat' && combatTracks.length) startCombatTrack(); } } persistPrefs(); sync(); });
  music.addEventListener('input', () => { musicVolume = Number(music.value) / 100; if (audio && activeMode !== 'combat') audio.volume = musicVolume; if (combatAudio && activeMode === 'combat') combatAudio.volume = musicVolume; musicValue.textContent = `${music.value}%`; persistPrefs(); });
  effects.addEventListener('input', () => { effectsVolume = Number(effects.value) / 100; document.documentElement.style.setProperty('--dysto-effects-volume', String(effectsVolume)); effectsValue.textContent = `${effects.value}%`; persistPrefs(); });
  picker.addEventListener('change', async () => { const files = [...(picker.files || [])].filter(f => /\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)$/i.test(f.name) || f.type.startsWith('audio/')); for (const file of files) { await storeTrack({ id: crypto.randomUUID(), name: file.name, blob: file, mode: 'normal' }); } const all = await readTracks(); tracks = all.filter(t => !t.mode || t.mode === 'normal'); combatTracks = all.filter(t => t.mode === 'combat'); renderList(host); if (tracks.length && activeMode === 'normal' && (!audio?.src || audio.paused && unlocked)) { chooseRandomTrack(); startTrack(); } picker.value = ''; });
  combatPicker?.addEventListener('change', async () => { const files = [...(combatPicker.files || [])].filter(f => /\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)$/i.test(f.name) || f.type.startsWith('audio/')); for (const file of files) { await storeTrack({ id: crypto.randomUUID(), name: file.name, blob: file, mode: 'combat' }); } const all = await readTracks(); tracks = all.filter(t => !t.mode || t.mode === 'normal'); combatTracks = all.filter(t => t.mode === 'combat'); if (combatList) renderList(combatList, 'combat'); combatPicker.value = ''; });
  const unlock = () => { unlocked = true; if (enabled && tracks.length && audio?.paused) { if (!audio.src) chooseRandomTrack(); startTrack(); } if (enabled && activeMode === 'combat' && combatTracks.length) startCombatTrack(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); }; document.addEventListener('pointerdown', unlock, { once: true }); document.addEventListener('keydown', unlock, { once: true });
  void readTracks().then(saved => { tracks = saved.filter(t => !t.mode || t.mode === 'normal'); combatTracks = saved.filter(t => t.mode === 'combat'); renderList(host); if (combatList) renderList(combatList, 'combat'); sync(); }); sync();
}

export function setCombatMusic(inCombat: boolean): void {
  if (inCombat) {
    if (activeMode === 'combat') return;
    activeMode = 'combat';
    if (audio) fadeTo(0, 450);
    if (!combatAudio) combatAudio = new Audio();
    if (enabled && unlocked && combatTracks.length) startCombatTrack();
    return;
  }
  if (activeMode !== 'combat') return;
  activeMode = 'normal';
  fadeCombatTo(0, 450, () => {
    if (combatAudio) { combatAudio.pause(); combatAudio.removeAttribute('src'); combatAudio.load(); }
    if (combatObjectUrl) { URL.revokeObjectURL(combatObjectUrl); combatObjectUrl = ''; }
  });
  if (audio && enabled && !audio.paused) fadeTo(musicVolume, 900);
  else if (audio && enabled && tracks.length && unlocked) { audio.volume = 0; startTrack(); fadeTo(musicVolume, 900); }
}
