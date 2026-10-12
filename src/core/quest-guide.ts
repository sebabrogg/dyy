import type {NpcQuest,WorldState,QuestGuideEntry,Tile} from './types.ts';

export interface QuestConversationAnalysis {
 questId:string|null;
 kind:'lead'|'assistance'|'progress'|'completion'|'irrelevant';
 summary:string;
 confidence:number;
 location:{x:number;y:number;terrain:string}|null;
 locationClaim:string|null;
}

function terrainCatalog(tiles:Tile[]):string{return tiles.filter(tile=>tile.terrain==='scrap'||tile.terrain==='building'||tile.terrain==='door'||tile.terrain==='road').map(tile=>`(${tile.x},${tile.y}) ${tile.terrain}${tile.explored?' [conocido por el jugador]':' [no descubierto por el jugador]'}`).join('\n');}
function safeParse(text:string):QuestConversationAnalysis|null{
 const clean=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const start=clean.indexOf('{'),end=clean.lastIndexOf('}');if(start<0||end<=start)return null;
 try{const raw=JSON.parse(clean.slice(start,end+1)) as Record<string,unknown>;const kinds=['lead','assistance','progress','completion','irrelevant'];if(typeof raw.kind!=='string'||!kinds.includes(raw.kind)||typeof raw.summary!=='string')return null;const loc=raw.location&&typeof raw.location==='object'?raw.location as Record<string,unknown>:null;return {questId:typeof raw.questId==='string'?raw.questId:null,kind:raw.kind as QuestConversationAnalysis['kind'],summary:raw.summary.slice(0,240),confidence:typeof raw.confidence==='number'?Math.max(0,Math.min(1,raw.confidence)):0,location:loc&&Number.isInteger(loc.x)&&Number.isInteger(loc.y)&&typeof loc.terrain==='string'?{x:loc.x as number,y:loc.y as number,terrain:loc.terrain}:null,locationClaim:typeof raw.locationClaim==='string'?raw.locationClaim.slice(0,100):null};}catch{return null;}
}

export async function analyzeQuestConversation(state:WorldState,actorId:string,playerLine:string,npcLine:string,options:{endpoint?:string;model?:string;signal?:AbortSignal}={}):Promise<NpcQuest[]>{
 const active=state.quests.filter(q=>q.status==='accepted');if(!active.length)return [];
 const endpoint=options.endpoint??(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('ai')==='opencode'?'http://127.0.0.1:11436/api/chat':'http://127.0.0.1:11435/api/chat');
 const actor=state.actors.find(item=>item.id===actorId);if(!actor)return [];
 const catalog=terrainCatalog(state.tiles);const quests=active.map(q=>({id:q.id,title:q.title,description:q.description,objective:q.objective,requirements:q.requirements}));
 const system=`Sos el analista de continuidad de un RPG. Analizás si una conversación aporta información realmente útil a un encargo aceptado. No sos el narrador y no podés inventar hechos. Un saludo, una emoción o charla cotidiana es irrelevant. lead requiere información concreta nueva vinculada al objetivo; assistance requiere una oferta o acción concreta de ayuda; progress requiere evidencia de avance; completion solo si el diálogo confirma explícitamente que el objetivo está completo. Elegí como máximo un encargo de la lista, y solo si la relación es inequívoca. La ubicación debe existir en el mapa real: solo podés devolver coordenadas exactas elegidas de la lista de terreno incluida en el mensaje. No conviertas nombres mencionados por los personajes en lugares reales. Si alguien dice “la clínica” pero el mundo no tiene un lugar con ese nombre, location debe ser null y locationClaim puede contener “clínica” como afirmación no verificada. Un tipo de terreno no equivale a un edificio con nombre ni confirma que el objeto buscado esté allí. No marques completion por promesas. Si no hay aporte útil, kind=irrelevant, questId=null, summary vacío y location=null. Devolvé únicamente JSON válido con: {"questId":string|null,"kind":"lead"|"assistance"|"progress"|"completion"|"irrelevant","summary":string,"confidence":number 0..1,"location":{"x":number,"y":number,"terrain":string}|null,"locationClaim":string|null}.`;
 const prompt=JSON.stringify({conversation:{player:playerLine,npc:npcLine},speaker:{id:actor.id,name:actor.name,position:{x:actor.x,y:actor.y},goal:actor.goal,knownTerrainNearSpeaker:state.tiles.filter(t=>t.explored&&Math.abs(t.x-actor.x)<=3&&Math.abs(t.y-actor.y)<=3).map(t=>({x:t.x,y:t.y,terrain:t.terrain}))},playerPosition:{x:state.player.x,y:state.player.y},acceptedQuests:quests,actualMapTerrain:catalog,knownLocationNames:[],instruction:'No hay catálogo de lugares con nombre en esta versión del mundo. No inventes clínica, depósito, hospital ni ningún nombre propio como ubicación real.'});
 const controller=new AbortController();const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({model:options.model??'qwen2.5:3b',messages:[{role:'system',content:system},{role:'user',content:prompt}],stream:true,keep_alive:'10m',options:{temperature:0.05,num_predict:220,num_ctx:4096}}),signal:controller.signal});if(!response.ok||!response.body)return [];
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',done=false;
  while(!done){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines){if(!line.trim())continue;try{const data=JSON.parse(line) as {message?:{content?:string};response?:string;done?:boolean};content+=data.message?.content??data.response??'';if(data.done)done=true;}catch{}}}
  const result=safeParse(content);if(!result||result.kind==='irrelevant'||result.confidence<0.65||!result.questId)return [];
  const quest=active.find(q=>q.id===result.questId);if(!quest)return [];
  let verifiedLocation:{x:number;y:number;terrain:string}|undefined;
  const spatialText=(playerLine+' '+npcLine).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const hasSpatialClue=/\b(norte|sur|este|oeste|cerca|detras|junto|lado|esquina|por alli|por ahi|enfrente|dentro|afuera|al lado|a unos metros|en esa zona|en el edificio)\b/.test(spatialText);
  const resourceQuest=/pieza|repuesto|chatarra|material/.test((quest.title+' '+quest.description+' '+quest.objective+' '+quest.requirements.join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  if(result.location&&hasSpatialClue&&!result.locationClaim){const tile=state.tiles.find(t=>t.x===result.location!.x&&t.y===result.location!.y);if(tile){const nearSpeaker=Math.max(Math.abs(tile.x-actor.x),Math.abs(tile.y-actor.y))<=3;if(nearSpeaker&&tile.terrain===result.location.terrain&&(resourceQuest?tile.terrain==='scrap':tile.terrain==='scrap'||tile.terrain==='building'||tile.terrain==='door'||tile.terrain==='road'))verifiedLocation={x:tile.x,y:tile.y,terrain:tile.terrain};}}
  const summary=result.summary.trim();if(!summary)return [];
  const entry:QuestGuideEntry={id:'guide-'+state.day+'-'+state.minute+'-'+actorId+'-'+quest.id+'-'+state.log.length,worldMinute:state.day*1440+state.minute,kind:result.kind,sourceActorId:actorId,summary,confidence:result.confidence,...(verifiedLocation?{locationX:verifiedLocation.x,locationY:verifiedLocation.y,locationDiscovered:true}:{})};
  quest.guideEntries??=[];quest.guideEntries.push(entry);quest.guideEntries=quest.guideEntries.slice(-20);
  if(verifiedLocation){quest.targetX=verifiedLocation.x;quest.targetY=verifiedLocation.y;quest.targetDiscovered=true;}
  state.log.push({tick:state.tick,text:'IA · '+quest.title+' · '+entry.summary+(result.locationClaim&&!verifiedLocation?' · Ubicación no verificada: '+result.locationClaim:''),kind:'event'});return [quest];
 }catch{return [];}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
