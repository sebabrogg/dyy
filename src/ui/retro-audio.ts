type Sound = 'click' | 'confirm' | 'move' | 'speech' | 'warning';
export function initRetroAudio(): void {
 let enabled = true, ctx: AudioContext | undefined, lastLine = '', lastClick = 0;
 const beep = (hz: number, delay: number, duration: number, volume = .03) => {
  if (!enabled) return;
  try {
   ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume();
   const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
   o.type = 'square'; o.frequency.setValueAtTime(hz, t); g.gain.setValueAtTime(.0001,t);
   g.gain.exponentialRampToValueAtTime(volume,t+.008); g.gain.setValueAtTime(volume,t+Math.max(.012,duration-.015));
   g.gain.exponentialRampToValueAtTime(.0001,t+duration); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+duration+.01);
  } catch { /* Audio can be unavailable in restricted browsers. */ }
 };
 const play = (kind: Sound) => {
  if (!enabled) return; const now = performance.now(); if(kind==='click' && now-lastClick<45)return; lastClick=now;
  if(kind==='click') beep(740,0,.035,.022);
  if(kind==='confirm'){beep(520,0,.055);beep(780,.055,.075);}
  if(kind==='move'){beep(330,0,.045,.022);beep(440,.045,.045,.022);}
  if(kind==='speech'){beep(520+Math.random()*100,0,.045,.026);beep(390+Math.random()*140,.052,.052,.023);}
  if(kind==='warning'){beep(220,0,.09,.045);beep(165,.105,.11,.045);}
 };
 const heading=document.querySelector<HTMLElement>('.conversation-heading');
 if(heading&&!document.getElementById('retro-audio-toggle')){
  const b=document.createElement('button'); b.id='retro-audio-toggle'; b.type='button'; b.className='retro-audio-toggle'; b.textContent='♪ SONIDO ON'; b.setAttribute('aria-pressed','true');
  b.addEventListener('click',()=>{enabled=!enabled;b.textContent=enabled?'♪ SONIDO ON':'♪ SONIDO OFF';b.setAttribute('aria-pressed',String(enabled));if(enabled)play('confirm');}); heading.append(b);
 }
 document.addEventListener('click',e=>{
  const t=e.target; if(!(t instanceof Element)||t.closest('#retro-audio-toggle'))return;
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
