import './style.css';
import {formatClock,initializeWorld,inspect,moveTo,selectActor,say,talk,tileAt,useItem,visibleActors,waitTurn} from './core/engine.ts';
import {generateWorld} from './world/generate.ts';
import {drawMap,tileFromPointer} from './ui/map.ts';
import type {WorldState} from './core/types.ts';
import {buildDialogueContext,generateLocalNpcLine,latestNpcDialogue} from './ai/local-dialogue.ts';

const state:WorldState=generateWorld();
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('world-map');
initializeWorld(state);
function render(){
 drawMap(canvas,state);
 $('clock').textContent=formatClock(state);$('seed-label').textContent='SEED '+state.seed.toString(16).toUpperCase().padStart(8,'0');
 $('tick-count').textContent='T+'+String(state.tick).padStart(3,'0');$('coords').textContent='X: '+state.player.x+' · Y: '+state.player.y;
 $('health-label').textContent=state.player.health+' / 100';$('health-meter').style.width=state.player.health+'%';
 $('sanity-label').textContent=state.player.sanity+' / 100';$('sanity-meter').style.width=state.player.sanity+'%';
 $('hunger-label').textContent=Math.floor(state.player.hunger)+' / 100';$('hunger-meter').style.width=state.player.hunger+'%';
 $('inventory-count').textContent=String(state.player.inventory.reduce((n,i)=>n+i.quantity,0)).padStart(2,'0');
 $('inventory').innerHTML=state.player.inventory.filter(i=>i.quantity>0).map(i=>'<div class="inventory-item"><span>'+escapeHtml(i.name)+'</span><b>×'+i.quantity+'</b><small>'+escapeHtml(i.description)+'</small></div>').join('')||'<p class="dim">Sin objetos.</p>';
 $('event-log').innerHTML=state.log.slice(-18).reverse().map(e=>'<div class="log-entry '+e.kind+'"><small>T+'+String(e.tick).padStart(3,'0')+'</small><span>'+escapeHtml(e.text)+'</span></div>').join('');$('event-log').scrollTop=0;$('dialogue-feed').innerHTML=state.log.filter(e=>e.kind==='dialogue').slice(-6).map(e=>'<div class="dialogue-line"><small>T+'+String(e.tick).padStart(3,'0')+'</small><span>'+escapeHtml(e.text)+'</span></div>').join('')||'<p class="dim">Todavía no hay conversación. Selecciona un NPC cercano y escribe abajo.</p>';
 const a=state.selectedActorId?state.actors.find(v=>v.id===state.selectedActorId):undefined;
 if(a&&a.alive){$('target-glyph').textContent=a.glyph;$('target-glyph').style.color=a.color;$('target-name').textContent=a.name;$('target-subtitle').textContent=a.faction+' / '+a.personality;$('target-detail').textContent='Distancia: '+Math.round(Math.hypot(a.x-state.player.x,a.y-state.player.y)*10)/10+' m. '+(a.alert>20?'Está en alerta.':'Su nivel de alerta parece bajo.');$('context-title').textContent=a.name+' · '+a.disposition.toUpperCase();$('context-desc').textContent='Objetivo aparente: '+a.goal+'. La información es parcial.';}
 else{$('target-glyph').textContent='?';$('target-glyph').style.color='#b6b7ae';$('target-name').textContent='Sin objetivo';$('target-subtitle').textContent='Selecciona una persona o lugar';$('target-detail').textContent='Tu percepción es parcial. Lo que no puedes ver ni oír no debería aparecer en tus conclusiones.';}
 const t=state.selectedTile?tileAt(state,state.selectedTile.x,state.selectedTile.y):tileAt(state,state.player.x,state.player.y);
 if(!a&&t){const names:Record<string,string>={road:'Calle de servicio',floor:'Superficie de hormigón',wall:'Muro de contención',building:'Estructura industrial',door:'Puerta reforzada',scrap:'Restos de maquinaria',grass:'Vegetación contaminada',water:'Agua estancada'};$('context-title').textContent=names[t.terrain]??'Zona sin identificar';$('context-desc').textContent='Coordenadas '+t.x+','+t.y+'. El mapa se genera a partir de una semilla reproducible.';}
 $('available-actions').innerHTML=(a?['Hablar','Observar','Seguir a distancia']:['Caminar','Observar','Esperar']).map(v=>'<span>'+v+'</span>').join('');
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
 if(k==='e'){if(state.selectedActorId)talk(state);else inspect(state);render();}
 if(k===' '){e.preventDefault();waitTurn(state);render();}
});
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.addEventListener('click',()=>{
 const action=b.dataset.action;
 if(action==='talk')talk(state);else if(action==='inspect')inspect(state);else if(action==='wait')waitTurn(state);else if(action==='use')useItem(state);
 render();
}));
$('say-form').addEventListener('submit',e=>{e.preventDefault();const input=$<HTMLInputElement>('say-input');const line=input.value.trim();if(!line)return;const actor=state.selectedActorId?state.actors.find(v=>v.id===state.selectedActorId):undefined;say(state,line);input.value='';render();if(!actor||!actor.alive)return;const localHosts=['localhost','127.0.0.1','::1'];if(!localHosts.includes(window.location.hostname)){ $('ai-status').textContent='VOZ LOCAL: ejecuta Dysto en esta PC para conectar Ollama';return;}const reply=latestNpcDialogue(state.log,actor.name);if(!reply)return;const engineLine=reply.text.slice(actor.name.length+3,-1);const originalReply=reply.text;const context=buildDialogueContext(actor,line,engineLine);const status=$<HTMLElement>('ai-status');status.textContent='VOZ LOCAL: probando modelo gratuito…';const isCurrentReply=()=>state.selectedActorId===actor.id&&latestNpcDialogue(state.log,actor.name)===reply;generateLocalNpcLine(context,{onPartial:partial=>{if(!isCurrentReply())return;reply.text=actor.name+': «'+partial+'»';render();}}).then(generated=>{if(!isCurrentReply())return;reply.text=actor.name+': «'+generated+'»';status.textContent='VOZ LOCAL: activa · '+actor.name;render();}).catch(()=>{if(!isCurrentReply())return;reply.text=originalReply;status.textContent='VOZ LOCAL: no disponible · usando motor';render();});});
window.addEventListener('resize',()=>render());
render();
