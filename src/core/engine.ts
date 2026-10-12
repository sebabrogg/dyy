import {stream} from './rng.ts';
import {distance,indexOf,type Actor,type LogEntry,type WorldState} from './types.ts';
import {ageSocialMemories,classifyUtterance,recordSocialEvent,relationshipTo} from './social.ts';
const WALKABLE=new Set(['floor','road','scrap','grass','door']);
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export function tileAt(s:WorldState,x:number,y:number){return x<0||y<0||x>=s.width||y>=s.height?undefined:s.tiles[indexOf(x,y,s.width)];}
export function canSee(s:WorldState,a:Actor):boolean{return a.alive&&distance(s.player,a)<=7;}
export function visibleActors(s:WorldState):Actor[]{return s.actors.filter(a=>canSee(s,a));}
function addLog(s:WorldState,text:string,kind:LogEntry['kind']='world'){s.log.push({tick:s.tick,text,kind});if(s.log.length>100)s.log.shift();}
function occupied(s:WorldState,x:number,y:number,ignore?:string):boolean{return s.actors.some(a=>a.alive&&a.id!==ignore&&a.x===x&&a.y===y)||(s.player.x===x&&s.player.y===y);}
function walkable(s:WorldState,x:number,y:number):boolean{const t=tileAt(s,x,y);return !!t&&WALKABLE.has(t.terrain)&&!occupied(s,x,y);}
export function refreshVisibility(s:WorldState):void{for(const t of s.tiles)if(distance(s.player,t)<=6)t.explored=true;}
export function initializeWorld(s:WorldState):void{refreshVisibility(s);addLog(s,'La lluvia ácida cae sobre las Calderas. Un altavoz repite las condiciones del toque de queda.');addLog(s,'El puesto de control está activo. Nadie parece tener prisa por explicarte por qué.');}
function tickWorld(s:WorldState):void{
 s.tick++;s.minute+=5;if(s.minute>=1440){s.minute-=1440;s.day++;}
 s.player.hunger=Math.min(100,s.player.hunger+.25);
 const rng=stream(s.seed,'npc.ai.tick.'+s.tick);
 for(const a of s.actors.filter(v=>v.alive)){
  ageSocialMemories(a,s.tick);
  const d=distance(s.player,a);
  if(d<=5){a.lastSeenPlayerTick=s.tick;if(a.disposition==='hostile'&&d<=2){a.alert=Math.min(100,a.alert+8);if(a.alert>=32){s.player.health=Math.max(0,s.player.health-2);addLog(s,a.name+' te golpea al acercarte demasiado.', 'warning');}}else if(a.disposition==='wary')a.alert=Math.min(100,a.alert+2);}
  else a.alert=Math.max(0,a.alert-1);
  // A small deterministic idle policy: people reposition only when their local situation permits it.
  if(rng.next()<.18&&a.alert<20&&d>2){const [dx,dy]=rng.pick(DIRECTIONS);const nx=a.x+dx,ny=a.y+dy;if(walkable(s,nx,ny)){a.x=nx;a.y=ny;}}
 }
 refreshVisibility(s);
}
function pathTo(s:WorldState,tx:number,ty:number):Array<{x:number;y:number}>{
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
export function waitTurn(s:WorldState):void{tickWorld(s);addLog(s,'Dejas pasar cinco minutos. El barrio sigue funcionando sin pedirte permiso.','action');}
export function inspect(s:WorldState):void{
 const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;
 if(a&&canSee(s,a)){addLog(s,a.name+' parece '+a.personality+'. Su objetivo visible no revela toda su intención.','action');return;}
 const t=s.selectedTile?tileAt(s,s.selectedTile.x,s.selectedTile.y):tileAt(s,s.player.x,s.player.y);
 addLog(s,t?({road:'La calle está gastada por botas y vehículos de carga.',building:'Una estructura industrial bloquea el paso.',door:'Una puerta reforzada. No sabes qué hay detrás.',scrap:'Restos de maquinaria abandonada.',grass:'Vegetación enferma crece entre el hormigón.',wall:'Un muro de contención.',water:'Agua oscura y contaminada.',floor:'Hormigón húmedo, grietas y marcas de arrastre.'}[t.terrain]):'No hay nada que observar.','action');
}
export function talk(s:WorldState,text?:string):void{
 const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;
 if(!a||!canSee(s,a)){addLog(s,'No tienes a nadie seleccionado que pueda oírte.','warning');return;}
 if(distance(s.player,a)>2){addLog(s,a.name+' está demasiado lejos para conversar. Acércate primero.','warning');return;}
 const event=text?classifyUtterance(text):null;
 if(event){
  const publicInsult=/(delante de todos|en público|frente a todos|con todos mirando)/i.test(text??'');
  recordSocialEvent(a,{...event,targetId:'player',tick:s.tick,public:publicInsult,interpretation:'lo percibe como una ofensa directa',sincerity:event.kind==='apology'?35:undefined,repairEffort:0});
  if(event.kind==='threat'){a.alert=Math.min(100,a.alert+20);}
  const r=relationshipTo(a);
  if(r.hostility>=75||r.resentment>=82)a.disposition='hostile';
  else if(r.hostility>=40)a.disposition='wary';
 }
 tickWorld(s);
 const r=relationshipTo(a);
 let response:string;
 if(event?.kind==='insult')response=r.hostility>=65?'No te lo voy a olvidar. Sal de mi vista.':'¿Te pensás que podés hablarme así?';
 else if(event?.kind==='threat')response=r.fear>50?'No te acerques. Te estoy avisando.':'Amenazame otra vez y vas a ver.';
 else if(event?.kind==='apology')response=r.resentment>=35?'No alcanza con decirlo. Todavía me acuerdo de lo que hiciste.':'Te escuché. Eso no significa que esté todo arreglado.';
 else if(r.hostility>=75||r.resentment>=82)response='No tengo nada que hablar con vos. Andate.';
 else if(r.trust<20)response='No confío en vos. Decí lo que tengas que decir.';
 else response=({helpful:'No hables tan alto. Aquí las paredes tienen nómina.',neutral:'Depende de quién pregunte y de quién esté escuchando.',wary:'No te conozco. Mantén las manos donde pueda verlas.',hostile:'No estás autorizado a estar aquí.'}[a.disposition]??'No tengo nada que decirte');
 addLog(s,a.name+': «'+response+'»','dialogue');
}
export function selectActor(s:WorldState,id:string):void{const a=s.actors.find(v=>v.id===id);if(a&&canSee(s,a)){s.selectedActorId=id;s.selectedTile={x:a.x,y:a.y};}}
export function say(s:WorldState,text:string):void{const clean=text.trim();if(!clean)return;const a=s.selectedActorId?s.actors.find(v=>v.id===s.selectedActorId):undefined;if(!a||!canSee(s,a)||distance(s.player,a)>2){addLog(s,'Tu voz se pierde entre motores y lluvia. Nadie responde.','action');tickWorld(s);return;}addLog(s,'Tú: «'+clean+'»','dialogue');talk(s,clean);}
export function useItem(s:WorldState):void{
 const ration=s.player.inventory.find(i=>i.id==='ration'&&i.quantity>0);
 if(ration){ration.quantity--;s.player.hunger=Math.max(0,s.player.hunger-28);tickWorld(s);addLog(s,'Consumes una ración comprimida. El sabor es peor que el hambre.','action');return;}
 const water=s.player.inventory.find(i=>i.id==='water'&&i.quantity>0);
 if(water){water.quantity--;s.player.sanity=Math.min(100,s.player.sanity+2);tickWorld(s);addLog(s,'Bebes agua filtrada. No parece del todo segura.','action');return;}
 addLog(s,'No tienes ningún objeto utilizable.','warning');
}
export function seedLabel(seed:number):string{return seed.toString(16).toUpperCase().padStart(8,'0');}
export function formatClock(s:WorldState):string{return'DÍA '+String(s.day).padStart(3,'0')+' · '+String(Math.floor(s.minute/60)).padStart(2,'0')+':'+String(s.minute%60).padStart(2,'0');}
