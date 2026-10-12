import './style.css';
import {initConversationFolders} from './ui/conversation-folders.ts';
import {formatClock,initializeWorld,inspect,interactWorld,moveTo,selectActor,say,tileAt,useItem,visibleActors,waitTurn} from './core/engine.ts';
import {generateWorld} from './world/generate.ts';
import {drawMap,tileFromPointer} from './ui/map.ts';
import type {WorldState} from './core/types.ts';
import {buildDialogueContext,generateLocalNpcLine} from './ai/local-dialogue.ts';
import {decodeSave,encodeSave,SAVE_STORAGE_KEY} from './core/save.ts';

const state:WorldState=generateWorld();
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('world-map');
let pendingQuestId:string|null=null;
function openQuestModal(quest:WorldState['quests'][number]){pendingQuestId=quest.id;$<HTMLElement>('quest-modal-title').textContent=quest.title;$<HTMLElement>('quest-modal-description').textContent=quest.description;$<HTMLElement>('quest-modal-objective').textContent=quest.objective;$<HTMLElement>('quest-modal-reward').textContent=quest.reward||'Sin recompensa confirmada';$<HTMLElement>('quest-modal-deadline').textContent='El plazo empieza al aceptar.';$<HTMLElement>('quest-modal').hidden=false;$<HTMLButtonElement>('[data-quest-choice=accept]').focus();}
function closeQuestModal(){pendingQuestId=null;$<HTMLElement>('quest-modal').hidden=true;}

let restoredOnStartup=false;
try{const saved=localStorage.getItem(SAVE_STORAGE_KEY);if(saved){Object.assign(state,decodeSave(saved));restoredOnStartup=true;}}catch(error){console.error('No se pudo restaurar la partida:',error);}
if(!restoredOnStartup)initializeWorld(state);
function render(){
 drawMap(canvas,state);
 $('clock').textContent=formatClock(state);$('seed-label').textContent='SEED '+state.seed.toString(16).toUpperCase().padStart(8,'0');
 $('tick-count').textContent='T+'+String(state.tick).padStart(3,'0');$('coords').textContent='X: '+state.player.x+' · Y: '+state.player.y;
 $('health-label').textContent=state.player.health+' / 100';$('health-meter').style.width=state.player.health+'%';
 $('sanity-label').textContent=state.player.sanity+' / 100';$('sanity-meter').style.width=state.player.sanity+'%';
 $('hunger-label').textContent=Math.floor(state.player.hunger)+' / 100';$('hunger-meter').style.width=state.player.hunger+'%';
 $('inventory-count').textContent=String(state.player.inventory.reduce((n,i)=>n+i.quantity,0)).padStart(2,'0');
 $('inventory').innerHTML=state.player.inventory.filter(i=>i.quantity>0).map(i=>'<div class="inventory-item"><span>'+escapeHtml(i.name)+'</span><b>×'+i.quantity+'</b><small>'+escapeHtml(i.description)+'</small></div>').join('')||'<p class="dim">Sin objetos.</p>';
 $('quest-count').textContent=String(state.quests.filter(q=>q.status==='offered'||q.status==='accepted').length).padStart(2,'0');$('event-log').innerHTML=state.log.map(e=>{const item=presentWorldLog(e);return item?{...e,category:item}:null;}).filter((e):e is NonNullable<typeof e>=>e!==null).slice(-18).reverse().map(e=>'<article class="log-entry '+e.kind+'"><div class="log-entry-meta"><span class="log-category">'+e.category+'</span><small>T+'+String(e.tick).padStart(3,'0')+'</small></div><span class="log-entry-text">'+escapeHtml(e.text)+'</span></article>').join('')||'<p class="dim log-empty">Sin novedades relevantes.</p>';$('event-log').scrollTop=0;$('quest-list').innerHTML=state.quests.filter(q=>q.status==='offered'||q.status==='accepted').map(q=>'<div class=\"quest-card\"><strong>'+escapeHtml(q.title)+'</strong><small>'+escapeHtml(q.status==='offered'?'PROPUESTO':'ACEPTADO')+(q.status==='accepted'?' · PLAZO '+Math.max(0,q.deadlineTick-state.tick)+' TURNOS · EVIDENCIA '+q.progress+'/1':'')+'</small><p>'+escapeHtml(q.objective)+(q.status==='accepted'&&q.progress>0?'<small>EVIDENCIA REGISTRADA. Volvé con el NPC y decile «te cuento lo que vi».</small>':'')+'</p><span>'+escapeHtml(q.description)+'</span></div>').join('')||'<p class=\"dim\">Nadie te ha confiado un encargo.</p>';$('dialogue-feed').innerHTML=state.log.filter(e=>e.kind==='dialogue').map(e=>{const split=e.text.match(/^([^:]+):\s*[«"]([\s\S]*?)[»"]$/);const speaker=split?.[1]??'Interferencia';const player=/^(tú|tu|jugador)$/i.test(speaker);const content=split?.[2]??e.text;return '<article class="dialogue-card '+(player?'player-line':'npc-line')+'"><div class="dialogue-meta"><span class="dialogue-category">'+(player?'TU INTERVENCIÓN':'RESPUESTA DEL NPC')+'</span><small>T+'+String(e.tick).padStart(3,'0')+'</small></div><strong class="dialogue-speaker">'+escapeHtml(speaker)+'</strong><p>'+escapeHtml(content)+'</p></article>';}).join('')||'<p class="dim">Todavía no hay conversación. Selecciona un NPC cercano y escribe abajo.</p>';
 const a=state.selectedActorId?state.actors.find(v=>v.id===state.selectedActorId):undefined;
 if(a&&a.alive){$('target-glyph').textContent=a.glyph;$('target-glyph').style.color=a.color;$('target-name').textContent=a.name;$('target-subtitle').textContent='Persona en el entorno';$('target-detail').textContent='Distancia: '+Math.round(Math.hypot(a.x-state.player.x,a.y-state.player.y)*10)/10+' m. '+(a.alert>20?'Está en alerta.':'Su nivel de alerta parece bajo.');$('context-title').textContent=a.name+' · '+a.disposition.toUpperCase();const q=state.quests.find(v=>v.giverId===a.id&&(v.status==='offered'||v.status==='accepted'));$('context-desc').textContent=q?(q.status==='offered'?'Te ha propuesto un encargo. Todavía no lo aceptaste.':'Tenés un encargo pendiente con esta persona.'):'Todavía no tenés motivos para conocer sus asuntos personales.';}
 else{$('target-glyph').textContent='?';$('target-glyph').style.color='#b6b7ae';$('target-name').textContent='Sin objetivo';$('target-subtitle').textContent='Selecciona una persona o lugar';$('target-detail').textContent='Tu percepción es parcial. Lo que no puedes ver ni oír no debería aparecer en tus conclusiones.';}
 const t=state.selectedTile?tileAt(state,state.selectedTile.x,state.selectedTile.y):tileAt(state,state.player.x,state.player.y);
 if(!a&&t){const names:Record<string,string>={road:'Calle de servicio',floor:'Superficie de hormigón',wall:'Muro de contención',building:'Estructura industrial',door:'Puerta reforzada',scrap:'Restos de maquinaria',grass:'Vegetación contaminada',water:'Agua estancada'};$('context-title').textContent=names[t.terrain]??'Zona sin identificar';$('context-desc').textContent='Coordenadas '+t.x+','+t.y+'. El mapa se genera a partir de una semilla reproducible.';}
 $('available-actions').innerHTML=(a?['Hablar','Esperar']:['Caminar','Examinar entorno','Esperar']).map(v=>'<span>'+v+'</span>').join('');
}

function presentWorldLog(entry:WorldState['log'][number]):string|null{
 if(entry.kind==='perception')return 'PERCEPCIÓN';
 if(entry.kind==='feeling')return 'ESTADO INTERNO';
 if(entry.kind==='event')return 'ENCARGO / CONSECUENCIA';
 if(entry.kind==='danger')return 'PELIGRO';
 if(entry.kind==='dialogue')return null;
 const text=entry.text.toLocaleLowerCase('es');
 if(entry.kind==='warning')return /ataca|ataque|herid|fracasa|muert|muri[oó]|peligro|hostil/.test(text)?'PELIGRO':null;
 if(entry.kind==='world')return null;
 if(/observaci[oó]n|la calle|estructura industrial|puerta reforzada|restos de maquinaria|vegetaci[oó]n enferma|muro de contenci[oó]n|agua estancada|superficie de hormig[oó]n|lluvia [aá]cida|puesto de control/.test(text))return 'PERCEPCIÓN';
 if(/encargo|entregaste|recogiste|recogiste|despejaste|completado|rechazaste|aceptaste/.test(text))return 'ENCARGO / CONSECUENCIA';
 if(/te ataca|te golpea|te hiere|dolor|hambre empieza|hambre te debilita/.test(text))return 'ESTADO INTERNO';
 return null;
}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}
function move(dx:number,dy:number){moveTo(state,state.player.x+dx,state.player.y+dy);render();}
canvas.addEventListener('click',e=>{
 const tile=tileFromPointer(canvas,state,e.clientX,e.clientY);if(!tile)return;
 const actor=visibleActors(state).find(a=>a.x===tile.x&&a.y===tile.y);
 if(actor){selectActor(state,actor.id);render();return;}
 state.selectedActorId=null;state.selectedTile=tile;
 if(Math.hypot(tile.x-state.player.x,tile.y-state.player.y)>0)moveTo(state,tile.x,tile.y);
 render();
});
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName))return;
 const k=e.key.toLowerCase(),moves:Record<string,[number,number]>={w:[0,-1],s:[0,1],a:[-1,0],d:[1,0],arrowup:[0,-1],arrowdown:[0,1],arrowleft:[-1,0],arrowright:[1,0]};
 if(moves[k]){e.preventDefault();move(...moves[k]!);return;}
 if(k==='e'){if(state.selectedActorId)$<HTMLInputElement>('say-input').focus();else inspect(state);render();}
 if(k===' '){e.preventDefault();waitTurn(state);render();}
});
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.addEventListener('click',()=>{
 const action=b.dataset.action;
 if(action==='talk')$<HTMLInputElement>('say-input').focus();else if(action==='inspect')inspect(state);else if(action==='wait')waitTurn(state);else if(action==='use')useItem(state);else if(action==='interact')interactWorld(state);
 render();
}));
$('save-game').addEventListener('click',()=>{const status=$<HTMLElement>('ai-status');try{localStorage.setItem(SAVE_STORAGE_KEY,encodeSave(state));status.textContent='PARTIDA GUARDADA · recuerdos y relaciones preservados.';}catch(error){status.textContent='ERROR AL GUARDAR · '+(error instanceof Error?error.message:String(error));}});
$('load-game').addEventListener('click',()=>{const status=$<HTMLElement>('ai-status');try{const saved=localStorage.getItem(SAVE_STORAGE_KEY);if(!saved)throw new Error('No existe una partida guardada.');const restored=decodeSave(saved);Object.assign(state,restored);(window as any).__dystoAiTurn=Symbol('load-save');status.textContent='PARTIDA CARGADA · mundo y memoria restaurados.';render();}catch(error){status.textContent='ERROR AL CARGAR · '+(error instanceof Error?error.message:String(error));}});
$('say-form').addEventListener('submit',e=>{e.preventDefault();const input=$<HTMLInputElement>('say-input');const line=input.value.trim();if(!line)return;const status=$<HTMLElement>('ai-status');const actor=state.selectedActorId?state.actors.find(v=>v.id===state.selectedActorId):undefined;if(!actor||!actor.alive){status.textContent='NO SE ENVIÓ · seleccioná un NPC en el mapa antes de hablar.';return;}input.value='';const logStart=state.log.length;const questIdsBefore=new Set(state.quests.map(q=>q.id));say(state,line,{suppressDialogue:true});const newOffer=state.quests.find(q=>!questIdsBefore.has(q.id)&&q.giverId===actor.id&&q.status==='offered');const engineOutcome=state.log.slice(logStart).filter(entry=>entry.kind!=='dialogue').map(entry=>entry.text).join(' | ');render();if(newOffer){openQuestModal(newOffer);status.textContent='ENCARGO PROPUESTO · revisá las condiciones antes de decidir.';return;}const context=buildDialogueContext(actor,line,engineOutcome);const replyEntry:WorldState['log'][number]={tick:state.tick,text:actor.name+': «…»',kind:'dialogue'};state.log.push(replyEntry);const requestId=Symbol('npc-turn');(window as any).__dystoAiTurn=requestId;const isCurrentReply=()=>((window as any).__dystoAiTurn===requestId);status.textContent='IA LOCAL · conectando con Ollama…';generateLocalNpcLine(context,{onStatus:message=>{if(isCurrentReply())status.textContent=message;},onPartial:partial=>{if(!isCurrentReply())return;replyEntry.text=actor.name+': «'+partial+'»';render();}}).then(generated=>{if(!isCurrentReply())return;replyEntry.text=actor.name+': «'+generated+'»';status.textContent='IA LOCAL ACTIVA · respondió '+actor.name;render();}).catch(error=>{if(!isCurrentReply())return;const detail=error instanceof Error?error.message:String(error);replyEntry.text=actor.name+': «No consigo responder ahora.»';const connectionHint=error instanceof TypeError?' No se pudo alcanzar el puente local: en la PC donde abrís Dysto ejecutá npm run ai:bridge desde la carpeta del proyecto y dejá esa terminal abierta.':' Modelo requerido: qwen2.5:3b; comprobá http://127.0.0.1:11435/health.';status.textContent='FALLO DE IA · '+detail+'.'+connectionHint;render();});});
document.querySelectorAll<HTMLButtonElement>('[data-quest-choice]').forEach(button=>button.addEventListener('click',()=>{const quest=state.quests.find(q=>q.id===pendingQuestId&&q.status==='offered');const choice=button.dataset.questChoice;const status=$<HTMLElement>('ai-status');if(!quest){closeQuestModal();status.textContent='La propuesta ya no está disponible.';render();return;}if(choice==='accept'){quest.status='accepted';quest.acceptedAtTick=state.tick;quest.deadlineTick=state.tick+120+quest.requirements.length*24;state.log.push({tick:state.tick,text:'Aceptaste el encargo de '+(state.actors.find(a=>a.id===quest.giverId)?.name??'este NPC')+': '+quest.title+'. Objetivo actual: '+quest.objective+'.',kind:'event'});status.textContent='ENCARGO ACEPTADO · '+quest.title;}else if(choice==='decline'){quest.status='declined';state.log.push({tick:state.tick,text:'Rechazaste el encargo «'+quest.title+'». El objetivo personal de quien lo propuso continúa.',kind:'event'});status.textContent='ENCARGO RECHAZADO · el NPC seguirá con sus propios objetivos.';}else{state.log.push({tick:state.tick,text:'Decidiste pensar la propuesta «'+quest.title+'». Sigue disponible mientras el NPC y la situación lo permitan.',kind:'event'});status.textContent='PROPUESTA PENDIENTE · no aceptaste ni rechazaste.';}closeQuestModal();render();}));
$('quest-modal').addEventListener('click',event=>{if(event.target===$('quest-modal'))closeQuestModal();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&pendingQuestId)closeQuestModal();});
window.addEventListener('resize',()=>render());
render();

function activateSubjectTab(id:string){document.querySelectorAll<HTMLButtonElement>('.subject-tab').forEach(button=>{const active=button.id===id;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});document.querySelectorAll<HTMLElement>('.subject-tab-panel').forEach(panel=>{panel.hidden=panel.id!==id.replace('subject-tab-','subject-panel-');});}
document.querySelectorAll<HTMLButtonElement>('.subject-tab').forEach(button=>button.addEventListener('click',()=>activateSubjectTab(button.id)));
document.querySelector<HTMLElement>('.subject-tabs')?.addEventListener('keydown',event=>{const keyboardEvent=event as KeyboardEvent;const tabs=Array.from(document.querySelectorAll<HTMLButtonElement>('.subject-tab'));const current=tabs.indexOf(document.activeElement as HTMLButtonElement);if(current<0)return;let next=current;if(keyboardEvent.key==='ArrowRight')next=(current+1)%tabs.length;else if(keyboardEvent.key==='ArrowLeft')next=(current-1+tabs.length)%tabs.length;else if(keyboardEvent.key==='Home')next=0;else if(keyboardEvent.key==='End')next=tabs.length-1;else return;keyboardEvent.preventDefault();tabs[next]?.focus();activateSubjectTab(tabs[next]!.id);});
function setInventoryOpen(open:boolean){$('inventory-popup').hidden=!open;$('inventory-toggle').setAttribute('aria-expanded',String(open));$('inventory-chevron').textContent=open?'▾':'▸';}
$('inventory-toggle').addEventListener('click',()=>setInventoryOpen($('inventory-popup').hidden));$('inventory-close').addEventListener('click',()=>setInventoryOpen(false));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('inventory-popup').hidden)setInventoryOpen(false);});
initConversationFolders();
