type Sound = 'click' | 'confirm' | 'move' | 'footstep' | 'speech' | 'warning' | 'combat' | 'quest';
export function initRetroAudio(): void {
 let enabled = localStorage.getItem('dysto-settings-sound') !== 'off', ctx: AudioContext | undefined, lastLine = '', lastClick = 0;
 const beep = (hz: number, delay: number, duration: number, volume = .03) => {
  if (!enabled) return;
  try {
   let effectLevel = .7; try { effectLevel = JSON.parse(localStorage.getItem('dysto-soundtrack-prefs') || '{}').effectsVolume ?? .7; } catch { /* default level */ }
   volume *= effectLevel;
   ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume();
   const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
   o.type = 'square'; o.frequency.setValueAtTime(hz, t); g.gain.setValueAtTime(.0001,t);
   g.gain.exponentialRampToValueAtTime(volume,t+.008); g.gain.setValueAtTime(volume,t+Math.max(.012,duration-.015));
   g.gain.exponentialRampToValueAtTime(.0001,t+duration); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+duration+.01);
  } catch { /* Audio can be unavailable in restricted browsers. */ }
 };
 const unlockAudio = () => {
  try {
   ctx ??= new AudioContext();
   if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* Audio unavailable or blocked by browser policy. */ }
 };
 document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
 document.addEventListener('keydown', unlockAudio, { capture: true });
 const play = (kind: Sound) => {
  if (!enabled) return; const now = performance.now(); if(kind==='click' && now-lastClick<45)return; lastClick=now;
  if(kind==='click') beep(740,0,.035,.022);
  if(kind==='confirm'){beep(520,0,.055);beep(780,.055,.075);}
  if(kind==='move'){beep(330,0,.045,.022);beep(440,.045,.045,.022);}
  if(kind==='footstep'){
   if(!enabled)return;
   try { ctx ??= new AudioContext(); if(ctx.state==='suspended')void ctx.resume(); const t=ctx.currentTime; const master=ctx.createGain(); master.gain.setValueAtTime(.0001,t); master.gain.exponentialRampToValueAtTime(.16,t+.012); master.gain.exponentialRampToValueAtTime(.0001,t+.19); master.connect(ctx.destination);
    const osc=ctx.createOscillator(),low=ctx.createBiquadFilter(); osc.type='sawtooth';osc.frequency.setValueAtTime(82+Math.random()*18,t);osc.frequency.exponentialRampToValueAtTime(38,t+.16);low.type='lowpass';low.frequency.setValueAtTime(190,t);low.frequency.exponentialRampToValueAtTime(75,t+.17);osc.connect(low);low.connect(master);osc.start(t);osc.stop(t+.2);
    const n=Math.floor(ctx.sampleRate*.13),buffer=ctx.createBuffer(1,n,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),ng=ctx.createGain();noise.buffer=buffer;filter.type='lowpass';filter.frequency.value=420;ng.gain.setValueAtTime(.0001,t);ng.gain.exponentialRampToValueAtTime(.09,t+.008);ng.gain.exponentialRampToValueAtTime(.0001,t+.13);noise.connect(filter);filter.connect(ng);ng.connect(ctx.destination);noise.start(t);noise.stop(t+.14);
   } catch { /* Audio unavailable */ }
  }
  if(kind==='speech'){beep(520+Math.random()*100,0,.045,.026);beep(390+Math.random()*140,.052,.052,.023);}
  if(kind==='warning'){beep(220,0,.09,.045);beep(165,.105,.11,.045);}
  if(kind==='combat'){beep(115,0,.075,.065);beep(72,.025,.12,.055);}
  if(kind==='quest'){beep(440,0,.07,.035);beep(587.33,.065,.07,.035);beep(783.99,.13,.085,.038);beep(1046.5,.205,.14,.04);}
 };
 document.addEventListener('dysto-footstep',()=>play('footstep'));
 document.addEventListener('dysto-combat-sound',()=>play('combat'));
 document.addEventListener('dysto-quest-accepted',()=>play('quest'));
 document.addEventListener('dysto-set-sound', event => {
  const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
  if (typeof detail?.enabled !== 'boolean') return;
  enabled = detail.enabled;
  localStorage.setItem('dysto-settings-sound', enabled ? 'on' : 'off');
  if (enabled) play('confirm');
 });
 document.addEventListener('click',e=>{
  const t=e.target; if(!(t instanceof Element))return;
  const c=t.closest<HTMLElement>('button,[role="button"],.map-tile,[data-action],select,input[type="submit"]'); if(!c||c.matches(':disabled,[aria-disabled="true"]'))return;
  if(c.matches('[data-danger],[data-attack],[data-threaten]'))play('warning');
  else if(c.matches('[type="submit"],[data-confirm],[data-action="talk"],[data-action="trade"]'))play('confirm');
  else if(c.matches('.map-tile,[data-move],[data-action="move"]'))play('move'); else play('click');
 },{passive:true});
 const feed=document.getElementById('dialogue-feed');
 if(feed){const current=()=> (feed.lastElementChild?.textContent??'').replace(/\s+/g,' ').trim();lastLine=current();
  new MutationObserver(()=>{const line=current();if(!line||line===lastLine)return;lastLine=line;if(/^(tú|tu|vos|jugador)\s*[:：]/i.test(line)||/todavía no hay conversación/i.test(line))return;play('speech');}).observe(feed,{childList:true,subtree:true,characterData:true});
 }
}
