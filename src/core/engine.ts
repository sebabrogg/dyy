import {resolveCombatAction,type CombatStyle} from './combat.ts';
import {stream} from './rng.ts';
import {distance,indexOf,type Actor,type Item,type LogEntry,type WorldState} from './types.ts';
import {ageSocialMemories,classifyUtterance,recordSocialEvent,recordObservedSocialEvent,shareSocialRumor,relationshipTo,shouldAttack} from './social.ts';
import {decideNpcBehavior,intentForSocialEvent,recentThreatCount} from './ai-matrix.ts';
import {makeLifeQuest,questOfferFor} from './character.ts';
import {classifyWorkIntent} from './quest-intent.ts';
import {applyQuestEvent,ensureQuestObjectives,objectiveReadiness} from './quest-objectives.ts';
import {chooseAutonomousDirection} from './autonomy.ts';
import {applyWear,canonicalItemId,hydrateItem,itemMass,playerLightRadius} from './items.ts';
import {awardGeneralXp,awardPractice,autonomousPractice,createProgression,hasSpecialization,skillProgress} from './progression.ts';
import {advanceWorldStories,revealStoryEvidence} from './world-stories.ts';
import type {SkillName} from './types.ts';
const WALKABLE=new Set(['floor','road','scrap','grass','door']);
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export function tileAt(s:WorldState,x:number,y:number){return x<0||y<0||x>=s.width||y>=s.height?undefined:s.tiles[indexOf(x,y,s.width)];}
export function canSee(s:WorldState,a:Actor):boolean{return a.alive&&distance(s.player,a)<=12;}
export function canIdentifyActor(s:WorldState,a:Actor):boolean{return a.alive&&distance(s.player,a)<=playerLightRadius(s.player.inventory);}
export function visibleActors(s:WorldState):Actor[]{return s.actors.filter(a=>canSee(s,a));}
function addLog(s:WorldState,text:string,kind:LogEntry['kind']='world',actorId?:string){s.log.push({tick:s.tick,text,kind,...(actorId?{actorId}:{})});if(s.log.length>100)s.log.shift();}
function occupied(s:WorldState,x:number,y:number,ignore?:string):boolean{return s.actors.some(a=>a.alive&&a.id!==ignore&&a.x===x&&a.y===y)||(s.player.x===x&&s.player.y===y);}
function walkable(s:WorldState,x:number,y:number):boolean{const t=tileAt(s,x,y);return !!t&&WALKABLE.has(t.terrain)&&!occupied(s,x,y);}
export function refreshVisibility(s:WorldState):void{const radius=playerLightRadius(s.player.inventory);for(const t of s.tiles)if(distance(s.player,t)<=radius)t.explored=true;}
export function initializeWorld(s:WorldState):void{s.player.progression??=createProgression();for(const actor of s.actors)actor.progression??=createProgression();refreshVisibility(s);addLog(s,'La lluvia ácida cae sobre Gruta. Una transmisión comunitaria repite las restricciones del asentamiento.','perception');addLog(s,'El puesto de control sigue activo. Nadie parece tener prisa por explicarte por qué.','perception');}
function resolveQuestConsequences(s:WorldState):void{
 for(const quest of s.quests){
  const giver=s.actors.find(a=>a.id===quest.giverId);
  const worldMinute=Math.floor((s.elapsedWorldMs??0)/60000);
  if(giver&&quest.status==='completed'&&quest.evidence?.startsWith('unverified-claim:')){const claimMinute=Number(quest.evidence.split(':')[1]??worldMinute);const audit=[...quest.id+giver.id].reduce((n,c)=>n+c.charCodeAt(0),0)%100;if(worldMinute>=claimMinute+360&&audit<Math.max(15,Math.min(70,100-(giver.social.relationships.player?.trust??giver.trust)))){quest.evidence='exposed-lie:'+worldMinute;const rel=giver.social.relationships.player;if(rel){rel.trust=Math.max(0,rel.trust-28);rel.respect=Math.max(0,rel.respect-16);rel.resentment=Math.min(100,rel.resentment+28);rel.hostility=Math.min(100,rel.hostility+18);}recordSocialEvent(giver,{kind:'betrayal',targetId:'player',tick:s.tick,severity:32,description:'Descubrió que el jugador mintió sobre el encargo «'+quest.title+'».',interpretation:'engaño descubierto tiempo después'});addLog(s,giver.name+' descubrió que mentiste sobre «'+quest.title+'». La confianza cae y el rumor puede llegar a otros contactos.','event');}continue;}
  if(quest.status!=='accepted')continue;
  const deadOrMissing=!giver||!giver.alive;
  const expired=quest.deadlineWorldMinute!==undefined?worldMinute>quest.deadlineWorldMinute:s.tick>quest.deadlineTick;
  if(!deadOrMissing&&!expired)continue;
  quest.status='failed';
  const reason=deadOrMissing?(giver?'quien te lo confió ha muerto.':'quien te lo confió ya no está disponible.'):'dejaste vencer el plazo.';
  addLog(s,'El encargo «'+quest.title+'» ha fracasado: '+reason,'event');
  if(giver){
   const rel=giver.social.relationships.player;
   if(rel){
    rel.trust=Math.max(0,rel.trust-8);
    rel.respect=Math.max(0,rel.respect-5);
    rel.resentment=Math.min(100,rel.resentment+8);
   }
  }
 }
}

function progressNpcWork(s:WorldState):void{
 const minute=Math.floor((s.elapsedWorldMs??0)/60000);if(minute<1||minute%180!==0)return;
 for(const actor of s.actors.filter(a=>a.alive)){
  actor.progression??=createProgression();if(minute-(actor.progression.lastAutonomousPracticeMinute??0)<180)continue;
  const text=(actor.personality+' '+actor.goal+' '+actor.mind.privateGoal+' '+actor.lifeMission.title+' '+actor.lifeMission.description).toLowerCase();
  const location=(s.locations??[]).filter(l=>Math.max(Math.abs(l.x-actor.x),Math.abs(l.y-actor.y))<=4).sort((a,b)=>Math.max(Math.abs(a.x-actor.x),Math.abs(a.y-actor.y))-Math.max(Math.abs(b.x-actor.x),Math.abs(b.y-actor.y)))[0];
  let skill:SkillName|undefined;let context='rutina';
  if(/mec[aá]nic|repar|generador|motor|taller/.test(text)&&location&&['taller','garaje','infraestructura'].includes(location.kind)){skill=/electr|circuit|radio/.test(text)?'electronics':'mechanics';context=location.kind;}
  else if(/m[eé]dic|sanitari|curar|cl[ií]nica|paciente/.test(text)&&location&&location.kind==='salud'){skill='first-aid';context='atención sanitaria';}
  else if(/comerc|vender|mercader|trueque|negoci/.test(text)&&location&&location.kind==='comercio'){skill='trade';context='intercambio local';}
  else if(/recuper|chatarra|desmont|material/.test(text)&&location&&['almacén','taller','garaje'].includes(location.kind)){skill='salvage';context='recuperación de materiales';}
  else if(/organiza|lider|comunidad|mediaci/.test(text)&&location&&['refugio','comedor','comercio'].includes(location.kind)){skill='leadership';context='organización comunitaria';}
  if(skill){const before=skillProgress(actor.progression,skill).level;const result=autonomousPractice(actor.progression,skill,180,s.tick,'npc-work:'+skill+':'+context);if(result&&result.level>before){actor.mind.privateGoal=actor.mind.privateGoal||'Consolidar su experiencia en '+skill+'.';}}
  actor.progression.lastAutonomousPracticeMinute=minute;
 }
}
function tickWorld(s:WorldState):void{
 s.tick++;
 progressNpcWork(s);
 advanceWorldStories(s);
 const rng=stream(s.seed,'npc.ai.tick.'+s.tick);
 for(const a of s.actors.filter(v=>v.alive)){
  ageSocialMemories(a,s.tick);
  const d=distance(s.player,a);
  if(d<=5){a.lastSeenPlayerTick=s.tick;const rel=relationshipTo(a);if(rel.hostility>=75||rel.resentment>=82)a.disposition='hostile';else if(rel.hostility>=40&&a.disposition!=='hostile')a.disposition='wary';if(d<=2){if(a.disposition==='hostile')a.alert=Math.min(100,a.alert+8);else if(a.disposition==='wary')a.alert=Math.min(100,a.alert+2);if(a.alert>=32&&shouldAttack(a,'player',a.alert,0)){s.player.health=Math.max(0,s.player.health-2);addLog(s,a.name+' te ataca. No parece dispuesto a dejar pasar lo ocurrido.','danger');addLog(s,'El impacto te sacude; el dolor reclama tu atención.','feeling');}}}
  else a.alert=Math.max(0,a.alert-1);
  // Movement follows current social context and personality, not a uniform idle roll.
  if(a.alert<65&&d>2){const direction=chooseAutonomousDirection(a,s.actors.filter(v=>v.id!==a.id&&v.alive),()=>rng.next());if(direction){const nx=a.x+direction.dx,ny=a.y+direction.dy;if(walkable(s,nx,ny)){a.x=nx;a.y=ny;}}}
 }
 resolveQuestConsequences(s);
 // Gossip is local, contact-gated, and deterministic. Each actor can pass at most one known event per tick.
 const socialRng=stream(s.seed,'npc.social.tick.'+s.tick);
 for(const source of s.actors.filter(v=>v.alive&&v.social.knowledge.length)){
  for(const contactId of Object.keys(source.social.contacts).sort()){
   const recipient=s.actors.find(v=>v.id===contactId&&v.alive);
   if(!recipient||distance(source,recipient)>3||socialRng.next()>=.12)continue;
   for(const known of [...source.social.knowledge].reverse()){
    if(shareSocialRumor(s,source.id,recipient.id,known.eventId))break;
   }
   break;
  }
 }
 refreshVisibility(s);
}
export function pathTo(s:WorldState,tx:number,ty:number):Array<{x:number;y:number}>{
 if(!tileAt(s,tx,ty)||!WALKABLE.has(tileAt(s,tx,ty)!.terrain)||occupied(s,tx,ty))return[];
 const start={x:s.player.x,y:s.player.y},key=(p:{x:number;y:number})=>p.x+','+p.y;
 const queue=[start],came=new Map<string,string>();came.set(key(start),'');
 while(queue.length){const cur=queue.shift()!;if(cur.x===tx&&cur.y===ty)break;
  for(const [dx,dy] of DIRECTIONS){const n={x:cur.x+dx,y:cur.y+dy},k=key(n);if(came.has(k)||!walkable(s,n.x,n.y))continue;came.set(k,key(cur));queue.push(n);}
 }
 const end=key({x:tx,y:ty});if(!came.has(end))return[];
 const path:Array<{x:number;y:number}>=[];let k=end;while(k!==key(start)){const [x,y]=k.split(',').map(Number);path.push({x:x!,y:y!});k=came.get(k)!;}return path.reverse();
}
export function moveTo(s:WorldState,x:number,y:number):void{
 const path=pathTo(s,x,y);if(!path.length){addLog(s,'No hay un camino transitable hasta ese punto.','warning');return;}
 for(const p of path){s.player.x=p.x;s.player.y=p.y;tickWorld(s);if(s.player.health<=0)break;}
 s.selectedTile={x,y};s.selectedActorId=null;addLog(s,'Te desplazas hasta el punto indicado.','action');
}
export function walkStep(s:WorldState,x:number,y:number):boolean{if(Math.abs(x-s.player.x)+Math.abs(y-s.player.y)!==1||!walkable(s,x,y))return false;s.player.x=x;s.player.y=y;s.selectedTile={x,y};s.selectedActorId=null;refreshVisibility(s);return true;}
export function advanceWorld(s:WorldState):void{s.elapsedWorldMs=(s.elapsedWorldMs??0)+60000;consumePoweredEnergy(s);ageItemsByWorldTime(s);tickWorld(s);const debt=(s.player.sleepDebtMinutes??0)+1;s.player.sleepDebtMinutes=debt;const previousHydration=s.player.hydration??70;s.player.hydration=Math.max(0,previousHydration-.2);if(previousHydration>20&&s.player.hydration<=20)addLog(s,'La deshidratación empieza a afectar tu concentración. Necesitás agua segura.','warning');if(s.player.hydration<=10&&s.tick%30===0){s.player.health=Math.max(0,s.player.health-1);addLog(s,'La deshidratación te debilita.','danger');}const previousHunger=s.player.hunger;s.player.hunger=Math.min(100,s.player.hunger+.25);if(previousHunger<70&&s.player.hunger>=70)addLog(s,'El hambre empieza a distraerte.','feeling');if(previousHunger<90&&s.player.hunger>=90)addLog(s,'El hambre te debilita; cuesta ignorarla.','feeling');if(debt>720&&debt%30===0)s.player.sanity=Math.max(0,s.player.sanity-1);}
export function sleep(s:WorldState,hours=8):void{const near=[tileAt(s,s.player.x,s.player.y),tileAt(s,s.player.x+1,s.player.y),tileAt(s,s.player.x-1,s.player.y),tileAt(s,s.player.x,s.player.y+1),tileAt(s,s.player.x,s.player.y-1)];if(!near.some(t=>t?.terrain==="door"||t?.terrain==="building")){addLog(s,"No hay una zona de descanso protegida al alcance.","warning");return;}const duration=Math.max(1,Math.min(12,Math.floor(hours)))*60;s.player.sleepDebtMinutes=0;s.player.sanity=Math.min(100,s.player.sanity+Math.round(duration/60*1.5));for(let minute=0;minute<duration;minute++){s.elapsedWorldMs=(s.elapsedWorldMs??0)+60000;consumePoweredEnergy(s);ageItemsByWorldTime(s);tickWorld(s);if(s.player.health<=0)break;}s.player.hunger=Math.min(100,s.player.hunger+Math.ceil(duration/60*1.5));s.lastClockUpdate=Date.now();addLog(s,"Tu personaje descansó "+Math.floor(duration/60)+" "+(duration===60?"hora":"horas")+". El mundo siguió activo mientras dormía.","feeling");}
export function waitTurn(s:WorldState):void{tickWorld(s);addLog(s,'Dejas pasar cinco minutos. El barrio sigue funcionando sin pedirte permiso.','action');}
export function inspect(s:WorldState):void{
 const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;
 if(a&&canSee(s,a)){
  const distance=Math.hypot(a.x-s.player.x,a.y-s.player.y);
  const visible=a.alert>20?'Parece alerta y pendiente de lo que ocurre a su alrededor.':distance<=2?'Está lo bastante cerca como para hablar, si quiere escucharte.':'No podés distinguir mucho más desde esta distancia.';
  addLog(s,visible,'perception');
  const observedMinute=Math.floor((s.elapsedWorldMs??0)/60000);
  const observedEvent={id:'observe:'+s.seed+':'+s.tick+':'+a.id,kind:'actor_observed' as const,actorId:'player' as const,targetId:a.id,worldMinute:observedMinute,evidence:'actor:'+a.id};
  for(const questId of applyQuestEvent(s,observedEvent))addLog(s,'La observación queda registrada para el encargo «'+(s.quests.find(q=>q.id===questId)?.title??questId)+'».','event');
  return;
 }
 const t=s.selectedTile?tileAt(s,s.selectedTile.x,s.selectedTile.y):tileAt(s,s.player.x,s.player.y);
 addLog(s,t?({road:'La calle está gastada por botas y vehículos de carga.',building:'Una estructura industrial bloquea el paso.',door:'Una puerta reforzada. No sabes qué hay detrás.',scrap:'Restos de maquinaria abandonada.',grass:'Vegetación enferma crece entre el hormigón.',wall:'Un muro de contención.',water:'Agua estancada.',floor:'Una superficie de hormigón marcada por el uso.'}[t.terrain]??'No distinguís nada concluyente.'):'No hay nada claro que examinar.','perception');
 if(t){const target=s.selectedTile??{x:s.player.x,y:s.player.y};const clueStory=(s.stories??[]).find(story=>{const loc=s.locations?.find(l=>l.id===story.locationId);return !!loc&&Math.max(Math.abs(s.player.x-loc.x),Math.abs(s.player.y-loc.y))<=2&&Math.max(Math.abs(target.x-loc.x),Math.abs(target.y-loc.y))<=2&&story.evidence.some(e=>e.discoveredBy===null);});if(clueStory){const clue=clueStory.evidence.find(e=>e.discoveredBy===null)!;if(revealStoryEvidence(s,clueStory.id,clue.id,'player')){applyQuestEvent(s,{id:'evidence:'+s.seed+':'+s.tick+':'+clue.id,kind:'evidence_found',actorId:'player',targetId:clueStory.id,topicText:clue.description,worldMinute:Math.floor((s.elapsedWorldMs??0)/60000),evidence:'story-evidence:'+clue.id});addLog(s,'Encontraste una pista en '+(s.locations?.find(l=>l.id===clueStory.locationId)?.name??'la zona')+': '+clue.description+'. La pista todavía no demuestra por sí sola qué ocurrió.','event');}}

  for(const q of s.quests.filter(q=>q.status==='accepted'&&q.objectiveType==='investigate_and_report'&&q.progress===0)){
   q.progress=1;q.evidence='tile:'+t.x+','+t.y+':'+t.terrain;
   addLog(s,'La observación del terreno queda registrada para el encargo «'+q.title+'».','event');
  }
 }
}
export function respondToIntent(text:string,name:string,disposition:Actor['disposition']):string{
 const t=text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const guarded=disposition==='wary'||disposition==='hostile';
 if(/\b(ayuda|ayudame|necesito ayuda|me das una mano|echame una mano)\b/.test(t))return guarded?'No voy a meterme en tus problemas. Ni siquiera sé quién sos.':'¿Qué necesitás? Sé concreto. No tengo tiempo para perder.';
 if(/\b(como estas|como andas|que tal estas|todo bien|como va)\b/.test(t))return guarded?'¿Y a vos qué te importa?':'He tenido días peores. Aunque todavía no terminó este.';
 if(/\b(hola|buenas|buen dia|buenas tardes|buenas noches|saludos)\b/.test(t))return guarded?'No hace falta que nos saludemos.':'Buenas. Si venís por algo, hablá.';
 if(/\b(gracias|te agradezco|se agradece)\b/.test(t))return guarded?'No lo hice por vos.':'No hay de qué. No lo conviertas en costumbre.';
 if(/\b(quien sos|como te llamas|tu nombre)\b/.test(t))return guarded?'No comparto mis datos con desconocidos.':'Me llamo '+name+'. Con eso alcanza por ahora.';
 if(/\b(que paso|que sucede|que ocurre|que esta pasando|que haces)\b/.test(t))return guarded?'No es asunto tuyo.':'Sobrevivir al turno. Como todo el mundo por acá.';
 if(/\b(puedo|podrias|podemos|queria|quisiera|necesito|busco)\b/.test(t))return guarded?'No prometo nada. Decí qué querés, rápido.':'Depende de qué estés buscando. Explicámelo mejor.';
 if(guarded)return 'No te conozco lo suficiente para hablar de eso.';
 return 'No sé qué querés que te diga. ¿Podés ser más claro?';
}

export function talk(s:WorldState,text?:string,options:{suppressDialogue?:boolean}={}):void{
 const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;
 if(!a||!canSee(s,a)){addLog(s,'No tienes a nadie seleccionado que pueda oírte.','warning');return;}
 if(distance(s.player,a)>2){addLog(s,a.name+' está demasiado lejos para conversar. Acércate primero.','warning');return;}
 const clean=(text??'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const event=text?classifyUtterance(text):null;
 const deliveries=s.quests.filter(q=>q.giverId===a.id&&q.status==='accepted'&&q.objectiveType==='deliver_item');
 if(deliveries.length&&/(te entrego|te traigo|aca tenes|aqui tienes|te doy|toma la chatarra|te dejo)/.test(clean)){
  const q=deliveries[0]!;
  const itemId=q.requiredItemId??'scrap';
  const item=s.player.inventory.find(i=>i.id===itemId&&i.quantity>0);
  if(!item){addLog(s,'No tienes el recurso necesario para entregárselo.','warning');return;}
  ensureQuestObjectives(q);item.quantity--;const completed=applyQuestEvent(s,{id:'deliver:'+s.seed+':'+s.tick+':'+q.id,kind:'item_delivered',actorId:'player',targetId:a.id,itemId,quantity:1,worldMinute:Math.floor((s.elapsedWorldMs??0)/60000),evidence:'delivered:'+itemId+':'+a.id});if(!completed.includes(q.id)){item.quantity++;addLog(s,'La transferencia no satisface las condiciones mecánicas del encargo.','warning');return;}s.player.progression??=createProgression();const generalEarned=awardGeneralXp(s.player.progression,12,'quest:'+q.id);if(generalEarned)addLog(s,'Objetivo significativo completado: +'+generalEarned+' XP general.','event');
  a.lifeMission.progress=Math.min(a.lifeMission.steps.length,a.lifeMission.progress+1);
  if(a.lifeMission.progress>=a.lifeMission.steps.length)a.lifeMission.status='completed';
  const rel=a.social.relationships.player;
  if(rel){rel.trust=Math.min(100,rel.trust+8);rel.respect=Math.min(100,rel.respect+5);rel.debt=Math.min(100,rel.debt+6);}
  recordSocialEvent(a,{kind:'help',targetId:'player',tick:s.tick,severity:16,description:'El jugador entregó '+item.name+' para el encargo «'+q.title+'».',interpretation:'cumplió una entrega'});
  addLog(s,'Entregaste '+item.name+' a '+a.name+'. Encargo completado: «'+q.title+'».','event');tickWorld(s);return;
 }
 const explicitClaim=/(termine|lo hice|ya esta|hecho|objetivo cumplido|encargo cumplido|listo|lo consegui|ya cumpli)/.test(clean);const reportable=s.quests.filter(q=>q.giverId===a.id&&q.status==='accepted'&&['investigate_and_report','collect_scrap','clear_obstacle'].includes(q.objectiveType)&&(q.progress>0||explicitClaim));
 if(reportable.length&&/(informo|investigue|encontre|volvi|tengo informacion|te cuento|ya investigue|ya volvi|esto es lo que vi|termine|lo hice|ya esta|hecho|objetivo cumplido|encargo cumplido|listo|lo consegui)/.test(clean)){
  for(const q of reportable){
   ensureQuestObjectives(q);
   if(q.status!=='completed')applyQuestEvent(s,{id:'report:'+s.seed+':'+s.tick+':'+q.id,kind:'report_given',actorId:'player',targetId:a.id,worldMinute:Math.floor((s.elapsedWorldMs??0)/60000),evidence:'reported:'+a.id+':'+q.id});
   if(q.status!=='completed'){const readiness=objectiveReadiness(q);addLog(s,a.name+' no puede dar el encargo por cumplido. Falta: '+(readiness.pending.join(' ')||'una condición verificable') ,'warning');continue;}
   s.player.progression??=createProgression();const generalEarned=awardGeneralXp(s.player.progression,12,'quest:'+q.id);if(generalEarned)addLog(s,'Objetivo significativo completado: +'+generalEarned+' XP general.','event');
   a.lifeMission.progress=Math.min(a.lifeMission.steps.length,a.lifeMission.progress+1);
   if(a.lifeMission.progress>=a.lifeMission.steps.length)a.lifeMission.status='completed';
   const rel=a.social.relationships.player;
   if(rel){rel.trust=Math.min(100,rel.trust+8);rel.respect=Math.min(100,rel.respect+5);rel.debt=Math.min(100,rel.debt+6);}
   recordSocialEvent(a,{kind:'help',targetId:'player',tick:s.tick,severity:16,description:'El jugador cumplió el encargo «'+q.title+'» y volvió con una observación.',interpretation:'cumplió un compromiso'});
   addLog(s,'Encargo completado: «'+q.title+'». La observación registrada fue aceptada por '+a.name+'.','event');
  }
  tickWorld(s);return;
 }
 if(text?.trim()&&!event)recordSocialEvent(a,{kind:'conversation',targetId:'player',tick:s.tick,severity:8,description:'El jugador me dijo: «'+text.trim().slice(0,240)+'»',interpretation:'interacción recordada'});const rememberedPlace=(s.locations??[]).filter(place=>place.knownByActorIds.includes(a.id)).sort((left,right)=>Math.hypot(left.x-a.x,left.y-a.y)-Math.hypot(right.x-a.x,right.y-a.y))[0];if(rememberedPlace&&Math.hypot(rememberedPlace.x-a.x,rememberedPlace.y-a.y)<=5){(a.social.placeMemories??=[]).push({placeId:rememberedPlace.id,tick:s.tick,salience:24,description:'Habló con el jugador cerca de '+rememberedPlace.name+'.'});if(a.social.placeMemories.length>80)a.social.placeMemories.splice(0,a.social.placeMemories.length-80);}
 const offered=s.quests.find(q=>q.giverId===a.id&&q.status==='offered');
 if(/\b(acepto|aceptar|lo acepto|acepto el encargo|me encargo|lo hare|lo hago|ese es mi encargo|entonces ese es mi encargo|perfecto entonces ese es mi encargo)\b/.test(clean)){
  if(offered){const worldMinute=Math.floor((s.elapsedWorldMs??0)/60000);offered.status='accepted';offered.acceptedAtTick=s.tick;offered.acceptedAtWorldMinute=worldMinute;offered.offeredAtWorldMinute=offered.offeredAtWorldMinute??worldMinute;const urgency=(a.goal+' '+a.lifeMission.motivation+' '+a.lifeMission.description+' '+a.personality).toLocaleLowerCase('es');const factor=/urgente|inmediato|peligro|amenaza|huir|escasez/.test(urgency)?0.45:/paciente|a largo plazo|reconstruir|aprender/.test(urgency)?1.8:1;const socialFactor=Math.max(0.7,Math.min(1.4,1+(a.social.traits.reactivity-50)/180));const hours=Math.max(2,Math.round((24+offered.requirements.length*8)*factor*socialFactor));offered.deadlineWorldMinute=worldMinute+hours*60;offered.deadlineTick=Number.MAX_SAFE_INTEGER;addLog(s,'Aceptaste el encargo de '+a.name+': '+offered.title+'. Plazo: '+Math.floor((offered.deadlineWorldMinute-worldMinute)/1440)+' días de tiempo del mundo. Objetivo actual: '+offered.objective+'.','event');tickWorld(s);return;}
  addLog(s,a.name+' no te ha ofrecido ningún encargo que puedas aceptar.','warning');return;
 }
 if(/\b(rechazo|no acepto|no me interesa|dejalo)\b/.test(clean)&&offered){offered.status='declined';addLog(s,'Rechazaste el encargo de '+a.name+'. Su objetivo personal continúa.','event');tickWorld(s);return;}
 const workIntent=classifyWorkIntent(text??'');const asksForWork=workIntent==='ask_for_work'||workIntent==='offer_help';
 if(event){
  const publicInsult=/(delante de todos|en público|frente a todos|con todos mirando)/i.test(text??'');
  recordSocialEvent(a,{...event,targetId:'player',tick:s.tick,public:publicInsult,interpretation:event.kind==='apology'?'intento de disculpa; la sinceridad todavía no está demostrada':event.kind==='threat'?'amenaza directa':event.kind==='insult'?'ofensa directa':'interacción hostil',sincerity:event.kind==='apology'?35:undefined,repairEffort:0});
  recordObservedSocialEvent(s,{eventId:'social:'+s.tick+':player:'+a.id+':'+event.kind+':'+s.log.length,sourceId:'player',targetId:a.id,kind:event.kind,tick:s.tick,severity:event.severity??10,description:text??'',public:publicInsult});
  if(event.kind==='threat'){a.alert=Math.min(100,a.alert+20);}
  const r=relationshipTo(a);
  if(r.hostility>=75||r.resentment>=82)a.disposition='hostile';
  else if(r.hostility>=40)a.disposition='wary';
 }
 tickWorld(s);
 const r=relationshipTo(a);
 const priorRelationship=relationshipTo(a);
 if(!event&&(priorRelationship.hostility>=55||priorRelationship.resentment>=65)&&!options.suppressDialogue){addLog(s,a.name+' te corta antes de que puedas seguir. No tiene interés en hablar contigo.','warning');tickWorld(s);return;}
 let response:string;
 if(event?.kind==='insult')response=r.hostility>=65?'No te lo voy a olvidar. Sal de mi vista.':'¿Te pensás que podés hablarme así?';
 else if(event?.kind==='threat'){const threats=recentThreatCount(a,'player',24,s.tick);const decision=decideNpcBehavior({intent:intentForSocialEvent(event.kind),disposition:a.disposition,traits:a.social.traits,relationship:r,recentThreats:threats,mind:a.mind});response=decision.behavior==='fearful'?'No te acerques. No pienso arriesgarme con vos.':decision.behavior==='defend'?'Se terminó. Si volvés a amenazarme, me voy a defender.':decision.behavior==='deescalate'?'No quiero problemas. Bajá la voz y alejate.':decision.behavior==='refuse'?'No voy a seguir hablando con alguien que me amenaza.':threats>=2?'Ya te escuché. No vuelvas a amenazarme.':'Amenazame otra vez y vas a ver.';}
 else if(event?.kind==='apology')response=r.resentment>=35?'No alcanza con decirlo. Todavía me acuerdo de lo que hiciste.':'Te escuché. Eso no significa que esté todo arreglado.';
 else if(r.hostility>=75||r.resentment>=82)response='No tengo nada que hablar con vos. Andate.';
 else if(r.trust<20)response=respondToIntent(text??'',a.name,a.disposition);
 else response=respondToIntent(text??'',a.name,a.disposition);
 if(!options.suppressDialogue)addLog(s,a.name+': «'+response+'»','dialogue');
 if(asksForWork&&!['insult','threat'].includes(event?.kind??'')){
  let quest=questOfferFor(s,a);
  // Offering help is not the same as asking a stranger for work: if the NPC has an
  // active personal mission and is not hostile, create a concrete proposal to accept.
  if(!quest&&workIntent==='offer_help'&&a.alive&&a.lifeMission.status==='active'&&a.social.relationships.player.hostility<60&&a.social.relationships.player.resentment<70&&!s.quests.some(q=>q.giverId===a.id&&q.missionId===a.lifeMission.id&&(q.status==='offered'||q.status==='accepted'))){
   quest=makeLifeQuest(a,s.tick);
  }
  if(quest){s.quests.push(quest);addLog(s,a.name+' te propone un encargo: '+quest.title+'. '+quest.description,'dialogue');}
  else addLog(s,a.name+' no te confía ningún encargo por ahora.','world');
 }
}
export function selectActor(s:WorldState,id:string):void{const a=s.actors.find(v=>v.id===id);if(a&&canSee(s,a)){s.selectedActorId=id;s.selectedTile={x:a.x,y:a.y};}}
export function say(s:WorldState,text:string,options:{suppressDialogue?:boolean}={}):void{const clean=text.trim();if(!clean)return;const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;if(!a||!canSee(s,a)||distance(s.player,a)>2){addLog(s,'Tu voz se pierde entre motores y lluvia. Nadie responde.','action');tickWorld(s);return;}addLog(s,'Tú: «'+clean+'»','dialogue',a.id);talk(s,clean,options);}
export function giveInventoryItemToSelectedActor(s:WorldState,itemId:string):boolean{const actor=s.selectedActorId?s.actors.find(a=>a.id===s.selectedActorId):undefined;if(!actor||!actor.alive||!canSee(s,actor)||distance(s.player,actor)>2){addLog(s,'Seleccioná a alguien que esté cerca para entregarle un objeto.','warning');return false;}const item=s.player.inventory.find(i=>i.id===itemId&&i.quantity>0);if(!item){addLog(s,'Ese objeto ya no está en tu inventario.','warning');return false;}if(item.installedBatteryId||item.installedFilterId||s.player.inventory.some(device=>device.installedBatteryId===item.id)||s.player.inventory.some(device=>device.installedFilterId===item.id)){addLog(s,'Retirá el componente instalado antes de regalarlo.','warning');return false;}const relation=actor.social.relationships.player;if((relation?.hostility??0)>=82){addLog(s,actor.name+' rechaza el regalo. No confía en tus intenciones.','dialogue',actor.id);spendItemTime(s,1);return false;}const needText=(actor.goal+' '+actor.lifeMission.motivation+' '+actor.lifeMission.description+' '+actor.mind.privateGoal).toLocaleLowerCase('es');const itemText=(item.id+' '+item.name+' '+item.description).toLocaleLowerCase('es');const needed=/(repar|generador|máquina|electric|radio|comunica|agua|sed|comida|hambre|médic|herid|filtro|respir|herramient|pieza|cable|energía)/.test(needText+' '+itemText);item.quantity--;if(!actor.inventory)actor.inventory=[];const existing=actor.inventory.find(i=>i.id===item.id);if(existing){existing.quantity++;}else actor.inventory.push({...item,quantity:1});if(relation){relation.trust=Math.min(100,relation.trust+(needed?8:3));relation.affection=Math.min(100,relation.affection+(needed?5:1));relation.debt=Math.min(100,relation.debt+(needed?7:2));relation.resentment=Math.max(0,relation.resentment-2);}recordSocialEvent(actor,{kind:'help',targetId:'player',tick:s.tick,severity:needed?22:8,description:'El jugador le regaló '+item.name+'.',interpretation:needed?'ayuda útil y oportuna':'regalo de utilidad limitada'});addLog(s,'Le entregas '+item.name+' a '+actor.name+'. '+actor.name+(needed?' acepta el regalo: parece que le viene bien.':' acepta el regalo, aunque no era algo que necesitara especialmente.')+' La relación queda registrada.','action',actor.id);spendItemTime(s,1);return true;}
export function showInventoryItemFromChat(s:WorldState,text:string):boolean{const lower=text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(!/(\bla ves\b|\blo ves\b|\bmir(a|a)\b|te la muestro|te lo muestro|en el inventario|aca la tengo|te la enseno)/.test(lower))return false;const actor=s.selectedActorId?s.actors.find(a=>a.id===s.selectedActorId):undefined;if(!actor||!actor.alive||!canSee(s,actor)||distance(s.player,actor)>2){addLog(s,'Acercate al NPC para mostrarle un objeto.','warning');return true;}const priorPlayerLine=[...s.log].reverse().find(e=>e.kind==='dialogue'&&e.text.startsWith('Tú:'));const reference=(lower+' '+(priorPlayerLine?.text.toLocaleLowerCase('es')??'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'');const item=s.player.inventory.find(i=>i.quantity>0&&(reference.includes(i.name.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,''))||reference.includes(i.id.toLocaleLowerCase('es'))));if(!item){addLog(s,'No encuentro en tu inventario el objeto que intentas mostrar.','warning');return true;}addLog(s,'Tú: «'+text+'»','dialogue');addLog(s,'Le mostrás '+item.name+' a '+actor.name+'. Ahora sabe que llevás '+item.name+' x'+item.quantity+'.','action',actor.id);tickWorld(s);return true;}
export function giveItemFromChat(s:WorldState,text:string):boolean{const lower=text.toLowerCase();const phrases=["te voy a dar ","te doy ","toma ","te entrego ","quiero darte "];const phrase=phrases.find(p=>lower.includes(p));if(!phrase)return false;const wanted=lower.slice(lower.indexOf(phrase)+phrase.length).trim().replace(/[.!?,]+$/g,"");const actor=s.selectedActorId?s.actors.find(a=>a.id===s.selectedActorId):undefined;if(!actor||!actor.alive||!canSee(s,actor)||distance(s.player,actor)>2){addLog(s,"Necesitas estar junto a alguien para entregarle un objeto.","warning");return true;}const item=s.player.inventory.find(i=>i.quantity>0&&(wanted.includes(i.name.toLowerCase())||wanted.includes(i.id.toLowerCase())||i.name.toLowerCase().includes(wanted)));if(!item){addLog(s,"No tienes ese objeto para entregárselo.","warning");return true;}item.quantity--;if(!actor.inventory)actor.inventory=[];const existing=actor.inventory.find(i=>i.id===item.id);if(existing)existing.quantity++;else actor.inventory.push({...item,quantity:1});addLog(s,"Tú: «"+text+"»","dialogue");addLog(s,"Le entregas "+item.name+" a "+actor.name+".","action");tickWorld(s);return true;}
export function interactWorld(s:WorldState):void{
 const tile=s.selectedTile?tileAt(s,s.selectedTile.x,s.selectedTile.y):tileAt(s,s.player.x,s.player.y);
 if(!tile){addLog(s,'No hay nada con lo que puedas interactuar.','warning');return;}
 const groundIndex=(s.groundItems??[]).findIndex(g=>g.x===tile.x&&g.y===tile.y);if(groundIndex>=0){const ground=s.groundItems![groundIndex]!;if(distance(s.player,ground)>1.5){addLog(s,'Acercate al objeto antes de recogerlo.','world');return;}hydrateItem(ground.item);const mass=ground.item.weight??.2;const currentMass=s.player.inventory.reduce((n,i)=>n+itemMass(hydrateItem(i)),0);if(currentMass+mass>(s.player.carryCapacity??30)){addLog(s,'No tenés capacidad de carga para recoger '+ground.item.name+'.','warning');return;}const existing=s.player.inventory.find(i=>i.id===ground.item.id);const durable=['tool','device','battery','protective','container','filter','medical'].includes(ground.item.kind??'');if(existing&&!durable)existing.quantity+=1;else{const picked={...ground.item,quantity:1};if(existing)picked.id=ground.item.id+'-picked-'+s.tick+'-'+groundIndex;s.player.inventory.push(picked);}s.groundItems!.splice(groundIndex,1);addLog(s,'Recogés '+ground.item.name+' del suelo. Su estado se conserva.','action');spendItemTime(s,1);return;}
 if(tile.terrain==='door'){if(distance(s.player,tile)>1.5){addLog(s,'Tenés que acercarte a la entrada antes de interactuar.','world');return;}const place=(s.locations??[]).find(location=>location.x===tile.x&&location.y===tile.y);if(!place){addLog(s,'La entrada está bloqueada y no identificás qué hay detrás.','world');return;}const firstDiscovery=!place.discovered;place.discovered=true;s.player.x=tile.x;s.player.y=tile.y;refreshVisibility(s);if(firstDiscovery){s.player.progression??=createProgression();const earned=awardGeneralXp(s.player.progression,8,'discover:'+place.id);if(earned)addLog(s,'Descubrimiento significativo: +'+earned+' XP general por conocer '+place.name+'.','event');}addLog(s,'Atravesás la puerta y entrás en '+place.name+'. Podés moverte por el interior y hablar con quienes estén aquí.','world');tickWorld(s);return;}
 if(tile.terrain==='building'){addLog(s,'La estructura no tiene una entrada accesible desde este lado. Buscá la puerta señalada en el mapa.','world');return;}
 if(tile.terrain!=='scrap'){addLog(s,'No encuentras un recurso recuperable ni un montón de escombros que despejar aquí.','warning');return;}
 const clearQuest=s.quests.find(q=>q.status==='accepted'&&q.objectiveType==='clear_obstacle'&&q.progress===0);
 if(clearQuest){
  tile.terrain='floor';const evidence='cleared:'+tile.x+','+tile.y;applyQuestEvent(s,{id:'clear:'+s.seed+':'+s.tick+':'+tile.x+':'+tile.y,kind:'obstacle_cleared',actorId:'player',x:tile.x,y:tile.y,worldMinute:Math.floor((s.elapsedWorldMs??0)/60000),evidence});
  addLog(s,'Despejaste los escombros. El paso queda libre; el encargo aún requiere cualquier condición pendiente.','action');tickWorld(s);return;
 }
 const collectQuest=s.quests.find(q=>q.status==='accepted'&&q.objectiveType==='collect_scrap'&&q.progress===0);
 const item=s.player.inventory.find(i=>i.id==='scrap');
 if(item)item.quantity++;else s.player.inventory.push({id:'scrap',name:'Chatarra útil',quantity:1,description:'Piezas que todavía podrían servir.'});
 tile.terrain='floor';
 if(collectQuest){const evidence='collected:scrap:'+tile.x+','+tile.y;applyQuestEvent(s,{id:'collect:'+s.seed+':'+s.tick+':'+tile.x+':'+tile.y,kind:'resource_collected',actorId:'player',itemId:'scrap',quantity:1,x:tile.x,y:tile.y,worldMinute:Math.floor((s.elapsedWorldMs??0)/60000),evidence});addLog(s,'Recuperaste una pieza y registraste el recurso para «'+collectQuest.title+'».','action');}
 else addLog(s,'Recuperaste una pieza de chatarra útil.','action');
 tickWorld(s);
}
export function useItem(s:WorldState,itemId?:string):void{
 const item=s.player.inventory.find(i=>i.quantity>0&&(!itemId||i.id===itemId));
 if(!item){addLog(s,'No tienes ningún objeto utilizable.','warning');return;}
 for(const carried of s.player.inventory)hydrateItem(carried);hydrateItem(item);const id=canonicalItemId(item);
 if(id==='ration'){item.quantity--;s.player.hunger=Math.max(0,s.player.hunger-28);spendItemTime(s,2);addLog(s,'Consumes una ración comprimida. El sabor es peor que el hambre.','action');return;}
 if(id==='water'){item.quantity--;s.player.hydration=Math.min(100,(s.player.hydration??70)+25);s.player.sanity=Math.min(100,s.player.sanity+1);if((item.quality??item.condition??45)<25){s.player.health=Math.max(0,s.player.health-2);addLog(s,'Bebés agua contaminada. La sed baja, pero el contenido te hace daño.','danger');}else addLog(s,'Bebes agua recuperada. La cantidad se consume y la calidad del contenido no mejora por estar filtrada.','action');spendItemTime(s,1);return;}
 if(id==='canteen'){if((item.contents??0)<=0){addLog(s,'La cantimplora está vacía. Llenala desde una fuente de agua disponible.','warning');return;}item.contents=(item.contents??0)-1;s.player.hydration=Math.min(100,(s.player.hydration??70)+25);if((item.contentsQuality??45)<25){s.player.health=Math.max(0,s.player.health-2);addLog(s,'Bebés de la cantimplora, pero el agua almacenada está contaminada.','danger');}else addLog(s,'Bebés de la cantimplora. Queda '+item.contents+' unidad(es); la calidad del agua sigue siendo la misma.','action');spendItemTime(s,1);return;}
 if(id==='field-medkit'){if((item.contents??0)<=0){addLog(s,'El botiquín está vacío. Necesitás reponer suministros antes de tratar una lesión.','warning');return;}if(s.player.health>=100){addLog(s,'No tenés una lesión que justifique gastar un suministro.','warning');return;}item.contents=(item.contents??0)-1;s.player.health=Math.min(100,s.player.health+15);addLog(s,'Usás un suministro del botiquín y tratás una lesión menor. Quedan '+item.contents+'.','action');spendItemTime(s,10);return;}
 if(id==='medical-supplies'){if(s.player.health>=100){addLog(s,'No tenés una lesión que justifique consumir este suministro.','warning');return;}item.quantity--;s.player.health=Math.min(100,s.player.health+8);addLog(s,'Usás un suministro médico individual. No reemplaza una atención más compleja.','action');spendItemTime(s,8);return;}
 if(id==='industrial-cloth'||id==='degreaser'){const target=s.player.inventory.filter(i=>i.id!==item.id&&['tool','device','battery'].includes((hydrateItem(i),i.kind??''))&&(i.dirt??0)>0).sort((a,b)=>(b.dirt??0)-(a.dirt??0))[0];if(target){performInventoryAction(s,target.id,'clean');return;}if(id==='industrial-cloth'&&s.player.inventory.some(i=>canonicalItemId(i)==='water'&&i.quantity>0)){performInventoryAction(s,item.id,'wash');return;}addLog(s,'No hay una superficie compatible que necesite limpieza. No se consume el producto.','warning');return;}
 if(id==='lubricant'){const target=s.player.inventory.filter(i=>i.id!==item.id&&['tool','device'].includes((hydrateItem(i),i.kind??''))&&(i.wear??0)>0).sort((a,b)=>(b.wear??0)-(a.wear??0))[0];if(!target){addLog(s,'No hay un mecanismo compatible que necesite lubricación.','warning');return;}performInventoryAction(s,target.id,'maintain');return;}
 if(id==='electrical-tape'){const cable=s.player.inventory.find(i=>i.id!==item.id&&['copper-cable','copper-wire'].includes(canonicalItemId(i))&&(i.insulation??0)<100);if(!cable){addLog(s,'No hay un cable compatible que necesite aislamiento.','warning');return;}performInventoryAction(s,cable.id,'insulate');return;}
 if(id==='fuel-canister'){const generator=s.player.inventory.find(i=>canonicalItemId(i)==='generator');if(!generator){addLog(s,'No tenés un generador compatible para usar este combustible.','warning');return;}performInventoryAction(s,generator.id,'refuel');return;}
 if(id==='generator'){if((item.fuel??65)<=0&&!item.powered){addLog(s,'El generador no tiene combustible.','warning');return;}item.powered=!item.powered;addLog(s,item.powered?'Encendés el generador. Consume combustible mientras funciona.':'Apagás el generador.','action');spendItemTime(s,1);return;}
 if(id==='respirator'||id==='canvas-backpack'||id==='work-gloves'){performInventoryAction(s,item.id,item.equipped?'unequip':'equip');return;}
 if(id==='mechanical-parts'||id==='scrap'){const target=s.player.inventory.find(i=>i.id!==item.id&&['tool','device'].includes((hydrateItem(i),i.kind??''))&&(i.integrity??i.condition??100)<80);if(target){performInventoryAction(s,target.id,'repair');return;}addLog(s,item.name+' necesita una reparación o proceso compatible; no se consume por sí solo.','warning');return;}
 if(id==='filter-cartridge'){const mask=s.player.inventory.find(i=>canonicalItemId(i)==='respirator'&&i.quantity>0);if(mask){performInventoryAction(s,mask.id,'replace-filter');return;}addLog(s,'Necesitás una máscara compatible para instalar este filtro.','warning');return;}
 if(id==='electronic-components'){addLog(s,'Los componentes requieren inspección o pruebas con un equipo compatible; no forman un dispositivo por sí solos.','warning');return;}
 if(id==='copper-cable'){addLog(s,'Seleccioná Opciones para cortar, pelar o aislar el cable. Cada operación cambia la longitud disponible.','warning');return;}
 if(id==='radio'||id==='industrial-flashlight'){
  if((item.integrity??100)<15){addLog(s,item.name+' no funciona: su integridad es demasiado baja.','warning');return;}if((item.moisture??0)>=80){addLog(s,item.name+' falla por humedad interna. Primero hay que secarlo y revisar los contactos.','warning');return;}
  const battery=s.player.inventory.find(i=>i.id===item.installedBatteryId&&canonicalItemId(i)==='industrial-battery'&&i.quantity>0);
  if(!item.powered&&(!battery||(battery.charge??0)<=0)){addLog(s,item.name+' no tiene una batería compatible instalada con carga. Seleccioná una batería del inventario y usá «Instalar batería».','warning');return;}
  item.powered=!item.powered;if(id==='industrial-flashlight')refreshVisibility(s);if(item.powered){item.powerUseMinutes=0;applyWear(item,.2);addLog(s,id==='radio'?'Enciendes la radio. Consume la batería instalada; solo oirás emisiones si hay transmisores al alcance.':'Enciendes la linterna. Consume la batería instalada y la suciedad de la lente reduce la luz.','action');}else addLog(s,'Apagas '+item.name+'.','action');spendItemTime(s,1);return;
 }
 if(id==='industrial-battery'){const device=s.player.inventory.find(i=>i.quantity>0&&i.kind==='device'&&!i.installedBatteryId&&(i.compatibility??[]).includes(canonicalItemId(item)));if(!device){addLog(s,'No hay una radio o linterna compatible libre para instalar esta batería.','warning');return;}device.installedBatteryId=item.id;addLog(s,'Instalás la batería en '+device.name+'. La carga permanece en la batería y el dispositivo la consumirá mientras esté encendido.','action');spendItemTime(s,2);return;}
 addLog(s,item.name+' no tiene un uso directo aquí. Inspeccioná sus opciones contextuales.','warning');
}
function spendItemTime(s:WorldState,minutes:number):void{for(let i=0;i<minutes;i++){s.elapsedWorldMs=(s.elapsedWorldMs??0)+60000;consumePoweredEnergy(s);ageItemsByWorldTime(s);tickWorld(s);}s.lastClockUpdate=Date.now();}
function consumePoweredEnergy(s:WorldState):void{let lightChanged=false;const inventories=[s.player.inventory,...s.actors.filter(a=>a.alive).map(a=>a.inventory??[])];for(const inventory of inventories){for(const device of inventory){if(!device.powered)continue;device.powerUseMinutes=(device.powerUseMinutes??0)+1;if(device.powerUseMinutes<10)continue;device.powerUseMinutes=0;if(canonicalItemId(device)==='generator'){device.fuel=Math.max(0,(device.fuel??65)-1);if((device.fuel??0)<=0){device.powered=false;if(inventory===s.player.inventory)addLog(s,'El generador se apaga al quedarse sin combustible.','warning');}continue;}const battery=inventory.find(i=>i.id===device.installedBatteryId&&canonicalItemId(i)==='industrial-battery');if(!battery||(battery.charge??0)<=0){device.powered=false;if(inventory===s.player.inventory&&canonicalItemId(device)==='industrial-flashlight')lightChanged=true;if(inventory===s.player.inventory)addLog(s,device.name+' se apaga: la batería está agotada o ya no está instalada.','warning');continue;}battery.charge=Math.max(0,(battery.charge??0)-1);if(battery.charge===0){device.powered=false;if(inventory===s.player.inventory&&canonicalItemId(device)==='industrial-flashlight')lightChanged=true;if(inventory===s.player.inventory)addLog(s,device.name+' se apaga al agotarse la batería.','warning');}}}if(lightChanged)refreshVisibility(s); }
function ageItemsByWorldTime(s:WorldState):void{const minute=Math.floor((s.elapsedWorldMs??0)/60000);if(minute===0||minute%60!==0)return;const playerSheltered=['building','door'].includes(tileAt(s,s.player.x,s.player.y)?.terrain??'floor');const actors=s.actors.filter(a=>a.alive);const all=[{id:'player',inventory:s.player.inventory,sheltered:playerSheltered,actor:undefined as Actor|undefined},...actors.map(actor=>({id:actor.id,inventory:actor.inventory??[],sheltered:['building','door'].includes(tileAt(s,actor.x,actor.y)?.terrain??'floor'),actor}))];for(const entry of all){for(const item of entry.inventory){hydrateItem(item);if(entry.sheltered||!['tool','material','battery','device','protective','container','filter','cleaning'].includes(item.kind??''))continue;const priorMoisture=item.moisture??0;item.dirt=Math.min(100,(item.dirt??0)+1);if(['device','battery','tool','material','filter'].includes(item.kind??''))item.moisture=Math.min(100,priorMoisture+(item.kind==='device'||item.kind==='battery'?2:1));if((item.moisture??0)>=65&&['device','battery','tool'].includes(item.kind??'')){const moistureDamage=Math.max(.2,(100-(item.quality??60))/50);item.integrity=Math.max(0,(item.integrity??item.condition??100)-moistureDamage);item.condition=item.integrity;if(item.kind==='battery')item.charge=Math.max(0,(item.charge??0)-1);if(entry.id==='player'&&priorMoisture<65)addLog(s,item.name+' empieza a mostrar deterioro por humedad. Secarlo ahora puede evitar más daño.','warning');}}if(!entry.actor)continue;const actor=entry.actor;const context=(actor.goal+' '+actor.lifeMission.motivation+' '+actor.lifeMission.description+' '+actor.mind.privateGoal+' '+actor.personality).toLocaleLowerCase('es');if(!/(repar|manten|generador|mecánic|electric|técnic|maquin|herramient)/.test(context))continue;const target=entry.inventory.find(i=>i.quantity>0&&['tool','device'].includes(i.kind??'')&&(i.integrity??i.condition??100)<68);const tool=entry.inventory.find(i=>i.quantity>0&&['maintenance-wrench','insulated-pliers','industrial-screwdriver'].includes(canonicalItemId(i)));const parts=entry.inventory.find(i=>i.quantity>0&&['mechanical-parts','scrap'].includes(canonicalItemId(i)));if(!target||!tool||!parts)continue;const chance=actor.social.traits.selfControl>55?.65:.4;const decision=stream(s.seed,'npc.maintenance.'+actor.id+'.'+minute).next();if(decision>chance)continue;parts.quantity--;hydrateItem(tool);applyWear(tool,2);target.integrity=Math.min(100,(target.integrity??target.condition??50)+(canonicalItemId(parts)==='mechanical-parts'?18:8));target.condition=target.integrity;target.wear=Math.max(0,(target.wear??0)-8);target.maintenanceHistory=[...(target.maintenanceHistory??[]),'mantenimiento autónomo de '+actor.name+' en minuto '+minute];if(distance(s.player,actor)<=3)addLog(s,actor.name+' usa '+parts.name+' y una herramienta para mantener '+target.name+'.','event',actor.id);}}

function recordItemPractice(s:WorldState,item:Item,action:string):void{
 const map:Record<string,{skill:SkillName;base:number;difficulty:number;quality:number}>={repair:{skill:'mechanics',base:8,difficulty:1,quality:.9},'repair-insulation':{skill:'electronics',base:7,difficulty:.9,quality:.9},clean:{skill:'maintenance',base:2,difficulty:.35,quality:1},wash:{skill:'maintenance',base:2,difficulty:.25,quality:1},maintain:{skill:'maintenance',base:4,difficulty:.55,quality:1},'cut-cable':{skill:'electronics',base:4,difficulty:.55,quality:.9},'strip-cable':{skill:'electronics',base:4,difficulty:.6,quality:.9},'install-battery':{skill:'electronics',base:5,difficulty:.6,quality:1},'replace-filter':{skill:'maintenance',base:4,difficulty:.45,quality:1},recharge:{skill:'electronics',base:3,difficulty:.4,quality:1},dry:{skill:'maintenance',base:1,difficulty:.2,quality:1},inspect:{skill:'mechanics',base:2,difficulty:.4,quality:1},refuel:{skill:'maintenance',base:2,difficulty:.3,quality:1},fill:{skill:'resource-management',base:2,difficulty:.3,quality:1},treat:{skill:'first-aid',base:8,difficulty:.8,quality:.8}};
 const spec=map[action];if(!spec)return;s.player.progression??=createProgression();const itemClass=item.kind??canonicalItemId(item);const result=awardPractice(s.player.progression,{...spec,key:action+':'+itemClass,context:item.id,outcome:'success',tick:s.tick,learning:1});
 if(result.awarded>0)addLog(s,'Aprendés '+result.awarded.toFixed(1)+' XP en '+spec.skill+'.'+(result.levelUp?' Nueva pericia: nivel '+result.level+'.':''),'event');
}
export function performInventoryAction(s:WorldState,itemId:string,action:string):boolean{
 const item=s.player.inventory.find(i=>i.id===itemId&&i.quantity>0);if(!item){addLog(s,'Ese objeto ya no está en tu inventario.','warning');return false;}const inv=s.player.inventory;for(const carried of inv)hydrateItem(carried);hydrateItem(item);const id=canonicalItemId(item);
 const consume=(...ids:string[]):Item|undefined=>{const resource=inv.find(i=>i.quantity>0&&ids.includes(canonicalItemId(i)));if(resource){resource.quantity--;return resource;}return undefined;};
 if(action==='use'){useItem(s,itemId);recordItemPractice(s,item,action);return true;}
 if(action==='install-battery'){if(item.kind==='battery'){useItem(s,itemId);recordItemPractice(s,item,action);return true;}if(item.kind==='device'){const battery=inv.find(i=>i.quantity>0&&canonicalItemId(i)==='industrial-battery'&&(item.compatibility??[]).includes(canonicalItemId(i))&&!inv.some(d=>d.installedBatteryId===i.id));if(!battery){addLog(s,'No hay una batería disponible sin instalar.','warning');return false;}item.installedBatteryId=battery.id;addLog(s,'Instalás '+battery.name+' en '+item.name+'.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;}addLog(s,'Este objeto no admite una batería.','warning');return false;}
 if(action==='inspect'){const details=[item.name,'integridad '+Math.round(item.integrity??item.condition??100)+'%', 'desgaste '+Math.round(item.wear??0)+'%', 'suciedad '+Math.round(item.dirt??0)+'%', 'humedad '+Math.round(item.moisture??0)+'%',item.quality!==undefined?'calidad '+Math.round(item.quality)+'%':'',item.charge!==undefined?'carga '+Math.round(item.charge)+'/'+Math.round(item.maxCharge??100):'',item.fuel!==undefined?'combustible '+Math.round(item.fuel)+'/'+Math.round(item.maxFuel??100):'',item.lengthMeters!==undefined?'longitud '+item.lengthMeters.toFixed(1)+' m':'',item.insulation!==undefined?'aislamiento '+Math.round(item.insulation)+'%':'',item.contents!==undefined?'contenido '+item.contents+'/'+(item.capacity??'sin límite'):'',item.installedBatteryId?'batería instalada '+item.installedBatteryId:'',item.installedFilterId?'filtro instalado '+item.installedFilterId:'',item.contamination?'contaminación '+item.contamination:'',item.material?'material '+item.material:'',item.compatibility?.length?'compatible con '+item.compatibility.join(', '):'',item.risks?.length?'riesgos '+item.risks.join(', '):'',item.provenance?'procedencia '+item.provenance:''].filter(Boolean).join(' · ');addLog(s,details,'perception');spendItemTime(s,1);recordItemPractice(s,item,action);return true;}
 if(['clean','clean-lens','clean-terminals','wash'].includes(action)){
  if(id==='industrial-cloth'&&action==='wash'){const water=consume('water');if(!water){addLog(s,'Lavar el paño requiere agua.','warning');return false;}item.dirt=Math.max(0,(item.dirt??0)-45);item.moisture=Math.min(100,(item.moisture??0)+25);addLog(s,'Lavás el paño. Queda más limpio, pero húmedo; dejalo secar antes de usarlo en electrónica.','action');spendItemTime(s,5);recordItemPractice(s,item,action);return true;}
  const cloth=inv.find(i=>i.quantity>0&&canonicalItemId(i)==='industrial-cloth');const chemical=cloth?undefined:consume('degreaser');if(!cloth&&!chemical){addLog(s,'Necesitás un paño industrial o desengrasante para limpiar esto.','warning');return false;}
  if(cloth){const transferred=Math.min(30,item.dirt??0);if((cloth.dirt??0)>=75||cloth.contamination){item.dirt=Math.min(100,(item.dirt??0)+8);item.contamination=cloth.contamination??'residuos transferidos por un paño sucio';addLog(s,'El paño está demasiado sucio y contamina '+item.name+' en lugar de limpiarlo bien.','warning');}else{item.dirt=Math.max(0,(item.dirt??0)-35);if(item.contamination){cloth.contamination=item.contamination;item.contamination=null;}}cloth.dirt=Math.min(100,(cloth.dirt??0)+Math.max(12,transferred));cloth.moisture=Math.min(100,(cloth.moisture??0)+4);}else item.dirt=Math.max(0,(item.dirt??0)-55);
  if(action==='clean-terminals'||id==='industrial-battery')item.moisture=Math.max(0,(item.moisture??0)-Math.min(8,item.moisture??0));
  if(action==='clean-lens'||id==='industrial-flashlight')item.dirt=Math.max(0,(item.dirt??0)-20);
  item.maintenanceHistory=[...(item.maintenanceHistory??[]),'limpieza en minuto '+Math.floor((s.elapsedWorldMs??0)/60000)];addLog(s,'Limpias '+item.name+'. La suciedad baja; la integridad y la carga no se restauran.','action');spendItemTime(s,5);recordItemPractice(s,item,action);return true;
 }
 if(action==='maintain'){
  if(!consume('lubricant')){addLog(s,'El mantenimiento requiere lubricante compatible.','warning');return false;}item.wear=Math.max(0,(item.wear??0)-12);item.dirt=Math.min(100,(item.dirt??0)+3);item.maintenanceHistory=[...(item.maintenanceHistory??[]),'lubricación'];addLog(s,'Lubricás '+item.name+'. Baja el desgaste; no se reparan piezas rotas y el exceso puede atraer polvo.','action');spendItemTime(s,8);recordItemPractice(s,item,action);return true;
 }
 if(action==='repair'||action==='repair-insulation'){
  const tool=inv.find(i=>i.quantity>0&&['maintenance-wrench','insulated-pliers','industrial-screwdriver'].includes(canonicalItemId(i))&&i.id!==item.id);const parts=consume('mechanical-parts')??(hasSpecialization(s.player.progression,'mechanics','improvisation')?consume('scrap'):undefined);if(tool&&(tool.wear??0)>=(tool.durability??100)*.9){if(parts)parts.quantity++;addLog(s,tool.name+' está demasiado desgastada para una reparación fiable.','warning');return false;}if(!tool||!parts){if(parts)parts.quantity++;addLog(s,'La reparación requiere una herramienta compatible y piezas mecánicas o chatarra recuperable.','warning');return false;}hydrateItem(tool);tool.wear=Math.min(100,(tool.wear??0)+(hasSpecialization(s.player.progression,'mechanics','maintenance')?1:2));item.integrity=Math.min(100,(item.integrity??item.condition??100)+(canonicalItemId(parts)==='mechanical-parts'?(hasSpecialization(s.player.progression,'mechanics','repair')?28:22):(hasSpecialization(s.player.progression,'mechanics','repair')?14:10)));item.condition=item.integrity;item.wear=Math.max(0,(item.wear??0)-10);item.maintenanceHistory=[...(item.maintenanceHistory??[]),'reparación con '+parts.name];const repairedIntegrity=item.integrity??item.condition??0;const installedBattery=item.installedBatteryId?s.player.inventory.find(i=>i.id===item.installedBatteryId):undefined;const functional=repairedIntegrity>=80&&(item.kind!=='device'||(item.moisture??0)<80&&((installedBattery&&((installedBattery.charge??installedBattery.integrity??0)>0))||(item.fuel??0)>0||item.powered===true));const repairedQuestIds=applyQuestEvent(s,{id:'repair:'+s.seed+':'+s.tick+':'+item.id+':'+String(item.integrity),kind:'item_repaired',actorId:'player',itemId:item.id,integrity:item.integrity,functional,worldMinute:Math.floor((s.elapsedWorldMs??0)/60000),evidence:'repaired:'+item.id+':'+String(item.integrity)});for(const questId of repairedQuestIds){s.player.progression??=createProgression();const earned=awardGeneralXp(s.player.progression,12,'quest:'+questId);addLog(s,'Encargo de reparación completado: '+(s.quests.find(q=>q.id===questId)?.title??questId)+(earned?' · +'+earned+' XP general':''),'event');}addLog(s,'Reparás parcialmente '+item.name+' con '+parts.name+'. La pieza consumida desaparece y la herramienta se desgasta.','action');spendItemTime(s,hasSpecialization(s.player.progression,'mechanics','repair')?15:20);recordItemPractice(s,item,action);return true;
 }
 if(action==='dry'){
  if((item.moisture??0)<=10){addLog(s,item.name+' no necesita secado.','warning');return false;}const sheltered=['building','door'].includes(tileAt(s,s.player.x,s.player.y)?.terrain??'floor');const reduction=sheltered?55:12;item.moisture=Math.max(0,(item.moisture??0)-reduction);if(item.kind==='device'&&(item.moisture??0)<80)item.powered=false;addLog(s,sheltered?'Secás '+item.name+' bajo techo. La humedad baja sin restaurar la integridad ni la carga.':'Intentás secar '+item.name+' bajo la lluvia; la mejora es limitada y puede volver a mojarse.','action');spendItemTime(s,sheltered?10:15);recordItemPractice(s,item,action);return true;
 }
 if(action==='fill'){
  if(canonicalItemId(item)!=='canteen'){addLog(s,'Solo un contenedor compatible puede llenarse de esta forma.','warning');return false;}if((item.contents??0)>=(item.capacity??1)){addLog(s,'La cantimplora ya está llena.','warning');return false;}const water=consume('water');if(!water){addLog(s,'Necesitás una unidad de agua para llenar la cantimplora.','warning');return false;}item.contents=(item.contents??0)+1;item.contentsQuality=water.quality??water.condition??45;item.contentsContamination=water.contamination??((item.contentsQuality??45)<25?'contaminación desconocida':null);addLog(s,'Llenás la cantimplora. La calidad del agua queda registrada por separado de la limpieza del recipiente.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;
 }
 if(action==='refuel'){
  if(canonicalItemId(item)!=='generator'){addLog(s,'Este objeto no admite combustible.','warning');return false;}const canister=consume('fuel-canister');if(!canister){addLog(s,'Necesitás un bidón de combustible.','warning');return false;}item.fuel=Math.min(item.maxFuel??100,(item.fuel??0)+40);addLog(s,'Cargás combustible al generador: '+Math.round(item.fuel)+'/'+Math.round(item.maxFuel??100)+'.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;
 }
 if(action==='cut'){
  const cutter=inv.find(i=>i.quantity>0&&canonicalItemId(i)==='insulated-pliers');if(!cutter){addLog(s,'Cortar cable requiere alicates aislados.','warning');return false;}if((cutter.wear??0)>=(cutter.durability??100)*.9){addLog(s,'Los alicates están demasiado desgastados para cortar con precisión.','warning');return false;}if(canonicalItemId(item)!=='copper-cable'||item.quantity!==1){addLog(s,'Para cortar cable, separá primero los segmentos apilados.','warning');return false;}hydrateItem(item);if((item.lengthMeters??0)<=1){addLog(s,'Queda menos de un metro de cable; no se puede cortar otro segmento de un metro.','warning');return false;}item.lengthMeters=(item.lengthMeters??5)-1;const segment:Item={...item,id:item.id+'-cut-'+s.tick,name:'Segmento de cable de cobre',quantity:1,lengthMeters:1,description:'Segmento cortado; revisar aislamiento antes de conectarlo.'};inv.push(segment);const pliers=inv.find(i=>i.id!==item.id&&canonicalItemId(i)==='insulated-pliers');if(pliers){hydrateItem(pliers);applyWear(pliers,1);}addLog(s,'Cortás un metro de cable. Queda '+(item.lengthMeters??0).toFixed(1)+' m en el tramo original.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;
 }
 if(action==='strip'){
  if(canonicalItemId(item)!=='copper-cable'||item.quantity!==1){addLog(s,'Para pelar cable, separá primero los segmentos apilados.','warning');return false;}const pliers=inv.find(i=>i.quantity>0&&canonicalItemId(i)==='insulated-pliers');if(!pliers){addLog(s,'Pelar cable requiere alicates aislados.','warning');return false;}hydrateItem(item);if((item.lengthMeters??0)<.3){addLog(s,'No queda longitud suficiente para pelar otro segmento.','warning');return false;}item.lengthMeters=(item.lengthMeters??5)-.2;hydrateItem(pliers);applyWear(pliers,1);inv.push({id:'copper-wire-'+s.tick,name:'Cable de cobre pelado',quantity:1,description:'Segmento de 0,2 m sin aislamiento; necesita protección si queda expuesto.',lengthMeters:.2,weight:.04,integrity:item.integrity,condition:item.condition,material:'cobre sin aislamiento',quality:item.quality,insulation:0});addLog(s,'Pelás 20 cm de cable. Se recupera cobre, pero ese segmento ya no conserva aislamiento.','action');spendItemTime(s,3);recordItemPractice(s,item,action);return true;
 }
 if(action==='insulate'||action==='repair-insulation'){
  if(!['copper-cable','copper-wire'].includes(canonicalItemId(item))){addLog(s,'La cinta aislante solo sirve para cables compatibles.','warning');return false;}if(!consume('electrical-tape')){addLog(s,'Necesitás cinta aislante.','warning');return false;}item.insulation=100;item.integrity=Math.min(100,(item.integrity??item.condition??80)+2);item.condition=item.integrity;item.maintenanceHistory=[...(item.maintenanceHistory??[]),'aislamiento reparado'];addLog(s,'Restaurás el aislamiento con cinta. No aumenta la longitud ni repara otros daños.','action');spendItemTime(s,3);recordItemPractice(s,item,action);return true;
 }
 if(action==='restock'){
  if(canonicalItemId(item)!=='field-medkit'){addLog(s,'Solo un botiquín puede almacenar suministros médicos.','warning');return false;}if(!consume('medical-supplies')){addLog(s,'No hay suministros médicos para reponer el botiquín.','warning');return false;}item.contents=(item.contents??0)+1;addLog(s,'Guardás un suministro en el botiquín. El contenido se administra por separado del contenedor.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;
 }
 if(action==='test'){
  const id=canonicalItemId(item);if(!['electronic-components','filter-cartridge','industrial-battery','radio','industrial-flashlight'].includes(id)){addLog(s,'No hay una prueba técnica definida para este objeto.','warning');return false;}const result=id==='industrial-battery'?'carga '+Math.round(item.charge??0)+'/'+Math.round(item.maxCharge??100)+', integridad '+Math.round(item.integrity??100)+'%':id==='filter-cartridge'?'estado físico '+Math.round(item.integrity??60)+'%; saturación exacta no determinada': 'calidad estimada '+Math.round(item.quality??50)+'%, integridad '+Math.round(item.integrity??60)+'%';addLog(s,'Prueba de '+item.name+': '+result+'. No revela compatibilidades que el personaje no pueda conocer.','perception');spendItemTime(s,5);recordItemPractice(s,item,action);return true;
 }
 if(action==='sort'){
  if(!['scrap','mechanical-parts','electronic-components'].includes(canonicalItemId(item))){addLog(s,'Este objeto no necesita clasificación de materiales.','warning');return false;}item.dirt=Math.max(0,(item.dirt??0)-8);item.quality=Math.min(100,(item.quality??45)+3);item.description=item.description.replace(/ sin clasificar| clasificada/g,'')+' · material clasificado';addLog(s,'Clasificás '+item.name+'. Mejora la identificación del material, pero no crea piezas nuevas.','action');spendItemTime(s,10);recordItemPractice(s,item,action);return true;
 }
 if(action==='replace-filter'){
  if(canonicalItemId(item)!=='respirator'){addLog(s,'Solo una máscara compatible admite un cartucho de filtro.','warning');return false;}const cartridge=consume('filter-cartridge');if(!cartridge){addLog(s,'Necesitás un cartucho de filtro compatible.','warning');return false;}const oldFilter:Item={id:'used-filter-'+s.tick,name:'Filtro usado',quantity:1,description:'Cartucho retirado; eficacia residual desconocida.',condition:Math.max(0,Math.round((item.integrity??50)*.5)),provenance:'retirado de '+item.name};if(item.installedFilterId){const previous=inv.find(i=>i.id===item.installedFilterId);if(previous){previous.quantity=1;previous.name='Filtro usado';previous.description='Cartucho retirado; eficacia residual desconocida.';}else inv.push(oldFilter);}item.installedFilterId=cartridge.id;item.integrity=Math.min(100,(item.integrity??85)+2);item.maintenanceHistory=[...(item.maintenanceHistory??[]),'filtro sustituido'];addLog(s,'Sustituís el cartucho del respirador. El cartucho retirado queda en el inventario como residuo; la máscara conserva su propio desgaste.','action');spendItemTime(s,5);recordItemPractice(s,item,action);return true;
 }
 if(action==='remove-battery'){
  if(!item.installedBatteryId){addLog(s,'No hay una batería instalada en este dispositivo.','warning');return false;}const battery=inv.find(i=>i.id===item.installedBatteryId);if(!battery){addLog(s,'La referencia de la batería está dañada; el motor no inventa una pieza sustituta.','warning');return false;}item.powered=false;item.installedBatteryId=undefined;if(canonicalItemId(item)==='industrial-flashlight')refreshVisibility(s);addLog(s,'Retirás la batería de '+item.name+'. La carga y el desgaste de la batería se conservan.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;
 }
 if(action==='remove-filter'){
  if(!item.installedFilterId){addLog(s,'No hay un filtro instalado.','warning');return false;}const filter=inv.find(i=>i.id===item.installedFilterId);if(!filter){addLog(s,'La referencia del filtro está dañada; el motor no inventa un cartucho sustituto.','warning');return false;}filter.quantity=1;filter.name='Filtro usado';filter.description='Cartucho retirado; eficacia residual desconocida.';item.installedFilterId=undefined;addLog(s,'Retirás el cartucho del respirador. Su estado residual se conserva como objeto separado.','action');spendItemTime(s,2);recordItemPractice(s,item,action);return true;
 }
 if(action==='recharge'){
  if(canonicalItemId(item)!=='industrial-battery'){addLog(s,'Solo una batería recargable admite esta operación.','warning');return false;}const generator=inv.find(i=>i.quantity>0&&canonicalItemId(i)==='generator'&&i.powered&&(i.fuel??65)>=10);if(!generator){addLog(s,'Recargar requiere un generador con al menos 10 unidades de combustible.','warning');return false;}generator.fuel=Math.max(0,(generator.fuel??65)-10);generator.wear=Math.min(100,(generator.wear??0)+1);item.chargeCycles=(item.chargeCycles??0)+1;item.maxCharge=Math.max(55,(item.maxCharge??100)-1);item.charge=Math.min(item.maxCharge,(item.charge??0)+30);item.maintenanceHistory=[...(item.maintenanceHistory??[]),'recarga '+item.chargeCycles];addLog(s,'Recargás la batería hasta '+Math.round(item.charge)+'/'+Math.round(item.maxCharge)+'. El generador consume 10 unidades de combustible y la capacidad máxima cae ligeramente por el ciclo.','action');spendItemTime(s,30);recordItemPractice(s,item,action);return true;
 }
 if(action==='disassemble'){
  if(item.installedBatteryId||item.installedFilterId||inv.some(device=>device.installedBatteryId===item.id||device.installedFilterId===item.id)){addLog(s,'Retirá los componentes instalados antes de desmontar el equipo.','warning');return false;}if(['tool','device'].includes(item.kind??'')&&!inv.some(i=>i.quantity>0&&i.id!==item.id&&['industrial-screwdriver','maintenance-wrench'].includes(canonicalItemId(i)))){addLog(s,'Desmontar este objeto requiere un destornillador o una llave compatible.','warning');return false;}item.quantity--;const salvage:Item={id:id==='radio'||id==='industrial-flashlight'||id==='electronic-components'?'electronic-components':'scrap',name:id==='radio'||id==='industrial-flashlight'?'Componentes electrónicos recuperados':'Chatarra útil',quantity:id==='radio'||id==='industrial-flashlight'?1:Math.max(1,Math.floor((item.integrity??50)/45)),description:'Material recuperado de '+item.name+'. Calidad y compatibilidad variables.',condition:Math.max(15,Math.round((item.integrity??50)*.65)),provenance:'recuperado de '+item.name};const existing=inv.find(i=>i.id===salvage.id);if(existing)existing.quantity+=salvage.quantity;else inv.push(salvage);addLog(s,'Desmontás '+item.name+' y recuperás materiales imperfectos. El objeto original queda inutilizado.','action');spendItemTime(s,15);recordItemPractice(s,item,action);return true;
 }
 if(action==='discard'){if(item.installedBatteryId||item.installedFilterId||inv.some(device=>device.installedBatteryId===item.id)||inv.some(device=>device.installedFilterId===item.id)){addLog(s,'No podés descartar un componente mientras esté instalado. Retiralo del dispositivo primero.','warning');return false;}item.quantity--;if(!s.groundItems)s.groundItems=[];s.groundItems.push({id:'ground-'+item.id+'-'+s.tick+'-'+s.groundItems.length,x:s.player.x,y:s.player.y,item:{...item,quantity:1},droppedAtWorldMinute:Math.floor((s.elapsedWorldMs??0)/60000)});addLog(s,'Descartás '+item.name+'. Queda en el suelo en esta ubicación y otra persona podría recogerlo.','action');spendItemTime(s,1);recordItemPractice(s,item,action);return true;}
 if(action==='give'){addLog(s,'Seleccioná un NPC cercano para regalar el objeto.','warning');return false;}
 if(action==='equip'){if(!['canvas-backpack','work-gloves','respirator'].includes(id)){addLog(s,item.name+' no se puede equipar directamente.','warning');return false;}if(id==='canvas-backpack'&&s.player.inventory.reduce((n,i)=>n+(i.weight??.2)*i.quantity,0)>(s.player.carryCapacity??30)+8){addLog(s,'La mochila no puede aumentar capacidad: está dañada o la carga supera el límite previsto.','warning');return false;}item.equipped=true;if(id==='canvas-backpack')s.player.carryCapacity=38;addLog(s,'Equipás '+item.name+'.'+(id==='canvas-backpack'?' La capacidad de carga aumenta a 38 kg.':' La protección depende de su estado y de la amenaza concreta.'),'action');spendItemTime(s,1);recordItemPractice(s,item,action);return true;}if(action==='unequip'){item.equipped=false;if(id==='canvas-backpack')s.player.carryCapacity=30;addLog(s,'Te quitás '+item.name+'.','action');spendItemTime(s,1);recordItemPractice(s,item,action);return true;}
 addLog(s,'Esa acción todavía no está disponible para '+item.name+'.','warning');return false;
}

export function seedLabel(seed:number):string{return seed.toString(16).toUpperCase().padStart(8,'0');}
export function formatClock(s:WorldState):string{const elapsed=s.elapsedWorldMs??0;s.day=Math.floor(elapsed/86400000)+1;s.minute=Math.floor(elapsed/60000)%1440;const h=Math.floor(s.minute/60),mm=s.minute%60;const phase=h>=6&&h<18?"DÍA":"NOCHE";return "DÍA "+String(s.day).padStart(3,"0")+" · "+String(h).padStart(2,"0")+":"+String(mm).padStart(2,"0")+" · "+phase;}

/** Deterministic, engine-validated combat entry point. */
export function combatAction(s:WorldState,targetId:string,style:CombatStyle='unarmed',executionQuality=0.5,attackBonus=0){return resolveCombatAction(s,'player',targetId,style,executionQuality,attackBonus);}
export function enemyCombatAction(s:WorldState,attackerId:string,executionQuality=0.5,defenseBonus=0,damageReduction=0){return resolveCombatAction(s,attackerId,'player','unarmed',executionQuality,0,defenseBonus,damageReduction);}
export function actorCombatAction(s:WorldState,attackerId:string,targetId:string,style:CombatStyle='unarmed',executionQuality=0.5){return resolveCombatAction(s,attackerId,targetId,style,executionQuality);}

export interface PhysicalHackResult{ok:boolean;tolerated?:boolean;message:string;}
/** Engine-authoritative resolution for the physical-interface puzzle. The UI only reports whether its routing puzzle was solved. */
export function resolvePhysicalHack(s:WorldState,actorId:string,solved:boolean):PhysicalHackResult{
 const actor=s.actors.find(a=>a.id===actorId&&a.alive);
 if(!solved)return {ok:false,message:'Enlace cancelado.'};
 if(!actor||actor.bodyType!=='physical')return {ok:false,message:'No hay una interfaz física válida para ese objetivo.'};
 if(Math.hypot(actor.x-s.player.x,actor.y-s.player.y)>1.5)return {ok:false,message:'La unidad está fuera del alcance del enlace.'};
 const tolerated=actor.disposition==='helpful'&&(actor.social.relationships['player']?.trust??actor.trust??0)>=45;
 const fact='Diagnóstico de '+actor.name+': unidad física; integridad estimada '+(actor.health??100)+'/100; reserva '+(actor.stamina??100)+'/100. Se obtuvo acceso de lectura, no de control.';
 s.player.knownFacts??=[];
 if(!s.player.knownFacts.includes(fact))s.player.knownFacts.push(fact);
 let message:string;
 if(tolerated){
   recordSocialEvent(actor,{kind:'help',targetId:'player',tick:s.tick,severity:3,description:'Permitió al jugador consultar un diagnóstico limitado de su sistema físico.',interpretation:'aceptó una revisión no invasiva'});
   message='ENLACE ABIERTO: '+actor.name+' toleró el diagnóstico de solo lectura. Su autonomía permanece intacta.';
   s.log.push({tick:s.tick,text:message,kind:'event',actorId:actor.id});
 }else{
   actor.alert=Math.min(100,actor.alert+12);
   recordSocialEvent(actor,{kind:'threat',targetId:'player',tick:s.tick,severity:12,description:'El jugador abrió una interfaz de diagnóstico sin autorización explícita.',interpretation:'intrusión no consentida en un sistema privado'});
   message='ENLACE ABIERTO: obtuviste el diagnóstico de '+actor.name+', pero registró la intrusión. La confianza y la alerta pueden cambiar.';
   s.log.push({tick:s.tick,text:message,kind:'warning',actorId:actor.id});
 }
 advanceWorld(s);
 return {ok:true,tolerated,message};
}
