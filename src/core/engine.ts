import {stream} from './rng.ts';
import {distance,indexOf,type Actor,type LogEntry,type WorldState} from './types.ts';
import {ageSocialMemories,classifyUtterance,recordSocialEvent,recordObservedSocialEvent,shareSocialRumor,relationshipTo,shouldAttack} from './social.ts';
import {decideNpcBehavior,intentForSocialEvent,recentThreatCount} from './ai-matrix.ts';
import {questOfferFor} from './character.ts';
const WALKABLE=new Set(['floor','road','scrap','grass','door']);
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export function tileAt(s:WorldState,x:number,y:number){return x<0||y<0||x>=s.width||y>=s.height?undefined:s.tiles[indexOf(x,y,s.width)];}
export function canSee(s:WorldState,a:Actor):boolean{return a.alive&&distance(s.player,a)<=7;}
export function visibleActors(s:WorldState):Actor[]{return s.actors.filter(a=>canSee(s,a));}
function addLog(s:WorldState,text:string,kind:LogEntry['kind']='world'){s.log.push({tick:s.tick,text,kind});if(s.log.length>100)s.log.shift();}
function occupied(s:WorldState,x:number,y:number,ignore?:string):boolean{return s.actors.some(a=>a.alive&&a.id!==ignore&&a.x===x&&a.y===y)||(s.player.x===x&&s.player.y===y);}
function walkable(s:WorldState,x:number,y:number):boolean{const t=tileAt(s,x,y);return !!t&&WALKABLE.has(t.terrain)&&!occupied(s,x,y);}
export function refreshVisibility(s:WorldState):void{for(const t of s.tiles)if(distance(s.player,t)<=6)t.explored=true;}
export function initializeWorld(s:WorldState):void{refreshVisibility(s);addLog(s,'La lluvia ácida cae sobre las Calderas. Un altavoz repite las condiciones del toque de queda.','perception');addLog(s,'El puesto de control está activo. Nadie parece tener prisa por explicarte por qué.','perception');}
function resolveQuestConsequences(s:WorldState):void{
 for(const quest of s.quests){
  if(quest.status!=='accepted')continue;
  const giver=s.actors.find(a=>a.id===quest.giverId);
  const deadOrMissing=!giver||!giver.alive;
  const expired=s.tick>quest.deadlineTick;
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

function tickWorld(s:WorldState):void{
 s.tick++;
 const rng=stream(s.seed,'npc.ai.tick.'+s.tick);
 for(const a of s.actors.filter(v=>v.alive)){
  ageSocialMemories(a,s.tick);
  const d=distance(s.player,a);
  if(d<=5){a.lastSeenPlayerTick=s.tick;const rel=relationshipTo(a);if(rel.hostility>=75||rel.resentment>=82)a.disposition='hostile';else if(rel.hostility>=40&&a.disposition!=='hostile')a.disposition='wary';if(d<=2){if(a.disposition==='hostile')a.alert=Math.min(100,a.alert+8);else if(a.disposition==='wary')a.alert=Math.min(100,a.alert+2);if(a.alert>=32&&shouldAttack(a,'player',a.alert,0)){s.player.health=Math.max(0,s.player.health-2);addLog(s,a.name+' te ataca. No parece dispuesto a dejar pasar lo ocurrido.','danger');addLog(s,'El impacto te sacude; el dolor reclama tu atención.','feeling');}}}
  else a.alert=Math.max(0,a.alert-1);
  // A small deterministic idle policy: people reposition only when their local situation permits it.
  if(rng.next()<.18&&a.alert<20&&d>2){const [dx,dy]=rng.pick(DIRECTIONS);const nx=a.x+dx,ny=a.y+dy;if(walkable(s,nx,ny)){a.x=nx;a.y=ny;}}
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
export function advanceWorld(s:WorldState):void{tickWorld(s);s.elapsedWorldMs=(s.elapsedWorldMs??0)+60000;const debt=(s.player.sleepDebtMinutes??0)+1;s.player.sleepDebtMinutes=debt;const previousHunger=s.player.hunger;s.player.hunger=Math.min(100,s.player.hunger+.25);if(previousHunger<70&&s.player.hunger>=70)addLog(s,'El hambre empieza a distraerte.','feeling');if(previousHunger<90&&s.player.hunger>=90)addLog(s,'El hambre te debilita; cuesta ignorarla.','feeling');if(debt>720&&debt%30===0)s.player.sanity=Math.max(0,s.player.sanity-1);}
export function sleep(s:WorldState):void{const near=[tileAt(s,s.player.x,s.player.y),tileAt(s,s.player.x+1,s.player.y),tileAt(s,s.player.x-1,s.player.y),tileAt(s,s.player.x,s.player.y+1),tileAt(s,s.player.x,s.player.y-1)];if(!near.some(t=>t?.terrain==="door"||t?.terrain==="building")){addLog(s,"No puedes dormir a la intemperie. Busca un refugio o una entrada protegida.","warning");return;}s.player.sleepDebtMinutes=0;s.player.sanity=Math.min(100,s.player.sanity+12);s.player.hunger=Math.min(100,s.player.hunger+4);for(let minute=0;minute<480;minute++){tickWorld(s);s.elapsedWorldMs=(s.elapsedWorldMs??0)+60000;if(s.player.health<=0)break;}s.player.hunger=Math.min(100,s.player.hunger+8);s.lastClockUpdate=Date.now();addLog(s,"Dormiste ocho horas en un lugar protegido. El mundo siguió activo mientras descansabas.","feeling");}
export function waitTurn(s:WorldState):void{tickWorld(s);addLog(s,'Dejas pasar cinco minutos. El barrio sigue funcionando sin pedirte permiso.','action');}
export function inspect(s:WorldState):void{
 const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;
 if(a&&canSee(s,a)){
  const distance=Math.hypot(a.x-s.player.x,a.y-s.player.y);
  const visible=a.alert>20?'Parece alerta y pendiente de lo que ocurre a su alrededor.':distance<=2?'Está lo bastante cerca como para hablar, si quiere escucharte.':'No podés distinguir mucho más desde esta distancia.';
  addLog(s,visible,'perception');
  for(const q of s.quests.filter(q=>q.status==='accepted'&&q.objectiveType==='investigate_and_report'&&q.progress===0&&q.giverId!==a.id)){
   q.progress=1;q.evidence='actor:'+a.id;
   addLog(s,'Tu observación de '+a.name+' queda registrada para el encargo «'+q.title+'».','event');
  }
  return;
 }
 const t=s.selectedTile?tileAt(s,s.selectedTile.x,s.selectedTile.y):tileAt(s,s.player.x,s.player.y);
 addLog(s,t?({road:'La calle está gastada por botas y vehículos de carga.',building:'Una estructura industrial bloquea el paso.',door:'Una puerta reforzada. No sabes qué hay detrás.',scrap:'Restos de maquinaria abandonada.',grass:'Vegetación enferma crece entre el hormigón.',wall:'Un muro de contención.',water:'Agua estancada.',floor:'Una superficie de hormigón marcada por el uso.'}[t.terrain]??'No distinguís nada concluyente.'):'No hay nada claro que examinar.','perception');
 if(t){
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
  item.quantity--;q.progress=1;q.evidence='delivered:'+itemId+':'+a.id;q.status='completed';
  a.lifeMission.progress=Math.min(a.lifeMission.steps.length,a.lifeMission.progress+1);
  if(a.lifeMission.progress>=a.lifeMission.steps.length)a.lifeMission.status='completed';
  const rel=a.social.relationships.player;
  if(rel){rel.trust=Math.min(100,rel.trust+8);rel.respect=Math.min(100,rel.respect+5);rel.debt=Math.min(100,rel.debt+6);}
  recordSocialEvent(a,{kind:'help',targetId:'player',tick:s.tick,severity:16,description:'El jugador entregó '+item.name+' para el encargo «'+q.title+'».',interpretation:'cumplió una entrega'});
  addLog(s,'Entregaste '+item.name+' a '+a.name+'. Encargo completado: «'+q.title+'».','event');tickWorld(s);return;
 }
 const reportable=s.quests.filter(q=>q.giverId===a.id&&q.status==='accepted'&&['investigate_and_report','collect_scrap','clear_obstacle'].includes(q.objectiveType)&&q.progress>0);
 if(reportable.length&&/(informo|investigue|encontre|volvi|tengo informacion|te cuento|ya investigue|ya volvi|esto es lo que vi)/.test(clean)){
  for(const q of reportable){
   q.status='completed';
   a.lifeMission.progress=Math.min(a.lifeMission.steps.length,a.lifeMission.progress+1);
   if(a.lifeMission.progress>=a.lifeMission.steps.length)a.lifeMission.status='completed';
   const rel=a.social.relationships.player;
   if(rel){rel.trust=Math.min(100,rel.trust+8);rel.respect=Math.min(100,rel.respect+5);rel.debt=Math.min(100,rel.debt+6);}
   recordSocialEvent(a,{kind:'help',targetId:'player',tick:s.tick,severity:16,description:'El jugador cumplió el encargo «'+q.title+'» y volvió con una observación.',interpretation:'cumplió un compromiso'});
   addLog(s,'Encargo completado: «'+q.title+'». La observación registrada fue aceptada por '+a.name+'.','event');
  }
  tickWorld(s);return;
 }
 if(text?.trim()&&!event)recordSocialEvent(a,{kind:'conversation',targetId:'player',tick:s.tick,severity:8,description:'El jugador me dijo: «'+text.trim().slice(0,240)+'»',interpretation:'interacción recordada'});
 const offered=s.quests.find(q=>q.giverId===a.id&&q.status==='offered');
 if(/\b(acepto|aceptar|acepto el encargo|me encargo|lo hare|lo hago)\b/.test(clean)){
  if(offered){offered.status='accepted';offered.acceptedAtTick=s.tick;offered.deadlineTick=s.tick+120+offered.requirements.length*24;addLog(s,'Aceptaste el encargo de '+a.name+': '+offered.title+'. Objetivo actual: '+offered.objective+'.','event');tickWorld(s);return;}
  addLog(s,a.name+' no te ha ofrecido ningún encargo que puedas aceptar.','warning');return;
 }
 if(/\b(rechazo|no acepto|no me interesa|dejalo)\b/.test(clean)&&offered){offered.status='declined';addLog(s,'Rechazaste el encargo de '+a.name+'. Su objetivo personal continúa.','event');tickWorld(s);return;}
 const asksForWork=/\b(ayuda|ayudar|ayudame|ayudo|ayudarte|ayudarte con eso|puedo ayudarte|queres que te ayude|quieres que te ayude|te doy una mano|trabajo|encargo|mision|misiones|que necesitas|que necesitas de mi|en que puedo ayudar|tenes algun problema|tienes algun problema)\b/.test(clean);
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
  const quest=questOfferFor(s,a);
  if(quest){s.quests.push(quest);addLog(s,a.name+' te propone un encargo: '+quest.title+'. '+quest.description+' Para aceptarlo, responde «acepto».','dialogue');}
  else addLog(s,a.name+' no te confía ningún encargo por ahora.','world');
 }
}
export function selectActor(s:WorldState,id:string):void{const a=s.actors.find(v=>v.id===id);if(a&&canSee(s,a)){s.selectedActorId=id;s.selectedTile={x:a.x,y:a.y};}}
export function say(s:WorldState,text:string,options:{suppressDialogue?:boolean}={}):void{const clean=text.trim();if(!clean)return;const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;if(!a||!canSee(s,a)||distance(s.player,a)>2){addLog(s,'Tu voz se pierde entre motores y lluvia. Nadie responde.','action');tickWorld(s);return;}addLog(s,'Tú: «'+clean+'»','dialogue');talk(s,clean,options);}
export function giveItemFromChat(s:WorldState,text:string):boolean{const lower=text.toLowerCase();const phrases=["te voy a dar ","te doy ","toma ","te entrego ","quiero darte "];const phrase=phrases.find(p=>lower.includes(p));if(!phrase)return false;const wanted=lower.slice(lower.indexOf(phrase)+phrase.length).trim().replace(/[.!?,]+$/g,"");const actor=s.selectedActorId?s.actors.find(a=>a.id===s.selectedActorId):undefined;if(!actor||!actor.alive||!canSee(s,actor)||distance(s.player,actor)>2){addLog(s,"Necesitas estar junto a alguien para entregarle un objeto.","warning");return true;}const item=s.player.inventory.find(i=>i.quantity>0&&(wanted.includes(i.name.toLowerCase())||wanted.includes(i.id.toLowerCase())||i.name.toLowerCase().includes(wanted)));if(!item){addLog(s,"No tienes ese objeto para entregárselo.","warning");return true;}item.quantity--;if(!actor.inventory)actor.inventory=[];const existing=actor.inventory.find(i=>i.id===item.id);if(existing)existing.quantity++;else actor.inventory.push({...item,quantity:1});addLog(s,"Tú: «"+text+"»","dialogue");addLog(s,"Le entregas "+item.name+" a "+actor.name+".","action");tickWorld(s);return true;}
export function interactWorld(s:WorldState):void{
 const tile=s.selectedTile?tileAt(s,s.selectedTile.x,s.selectedTile.y):tileAt(s,s.player.x,s.player.y);
 if(!tile){addLog(s,'No hay nada con lo que puedas interactuar.','warning');return;}
 if(tile.terrain!=='scrap'){addLog(s,'No encuentras un recurso recuperable ni un montón de escombros que despejar aquí.','warning');return;}
 const clearQuest=s.quests.find(q=>q.status==='accepted'&&q.objectiveType==='clear_obstacle'&&q.progress===0);
 if(clearQuest){
  tile.terrain='floor';clearQuest.progress=1;clearQuest.evidence='cleared:'+tile.x+','+tile.y;
  addLog(s,'Despejaste los escombros. El paso queda libre para el encargo «'+clearQuest.title+'».','action');tickWorld(s);return;
 }
 const collectQuest=s.quests.find(q=>q.status==='accepted'&&q.objectiveType==='collect_scrap'&&q.progress===0);
 const item=s.player.inventory.find(i=>i.id==='scrap');
 if(item)item.quantity++;else s.player.inventory.push({id:'scrap',name:'Chatarra útil',quantity:1,description:'Piezas que todavía podrían servir.'});
 tile.terrain='floor';
 if(collectQuest){collectQuest.progress=1;collectQuest.evidence='collected:scrap:'+tile.x+','+tile.y;addLog(s,'Recuperaste una pieza y registraste el recurso para «'+collectQuest.title+'».','action');}
 else addLog(s,'Recuperaste una pieza de chatarra útil.','action');
 tickWorld(s);
}
export function useItem(s:WorldState,itemId?:string):void{
 const ration=s.player.inventory.find(i=>i.id==='ration'&&i.quantity>0&&(!itemId||i.id===itemId));
 if(ration){ration.quantity--;s.player.hunger=Math.max(0,s.player.hunger-28);tickWorld(s);addLog(s,'Consumes una ración comprimida. El sabor es peor que el hambre.','action');return;}
 const water=s.player.inventory.find(i=>i.id==='water'&&i.quantity>0&&(!itemId||i.id===itemId));
 if(water){water.quantity--;s.player.sanity=Math.min(100,s.player.sanity+2);tickWorld(s);addLog(s,'Bebes agua filtrada. No parece del todo segura.','action');return;}
 addLog(s,'No tienes ningún objeto utilizable.','warning');
}
export function seedLabel(seed:number):string{return seed.toString(16).toUpperCase().padStart(8,'0');}
export function formatClock(s:WorldState):string{const elapsed=s.elapsedWorldMs??0;s.day=Math.floor(elapsed/86400000)+1;s.minute=Math.floor(elapsed/60000)%1440;const h=Math.floor(s.minute/60),mm=s.minute%60;const phase=h>=6&&h<18?"DÍA":"NOCHE";return "DÍA "+String(s.day).padStart(3,"0")+" · "+String(h).padStart(2,"0")+":"+String(mm).padStart(2,"0")+" · "+phase;}
