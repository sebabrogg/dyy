import type {NpcQuest,WorldState,QuestGuideEntry} from './types.ts';

export interface QuestConversationAnalysis {
 questId:string|null;
 kind:'lead'|'assistance'|'progress'|'completion'|'irrelevant';
 summary:string;
 confidence:number;
 locationId:string|null;
 locationClaim:string|null;
}

function safeParse(text:string):QuestConversationAnalysis|null{
 const clean=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const start=clean.indexOf('{'),end=clean.lastIndexOf('}');if(start<0||end<=start)return null;
 try{const raw=JSON.parse(clean.slice(start,end+1)) as Record<string,unknown>;const kinds=['lead','assistance','progress','completion','irrelevant'];if(typeof raw.kind!=='string'||!kinds.includes(raw.kind)||typeof raw.summary!=='string')return null;return {questId:typeof raw.questId==='string'?raw.questId:null,kind:raw.kind as QuestConversationAnalysis['kind'],summary:raw.summary.slice(0,240),confidence:typeof raw.confidence==='number'?Math.max(0,Math.min(1,raw.confidence)):0,locationId:typeof raw.locationId==='string'?raw.locationId:null,locationClaim:typeof raw.locationClaim==='string'?raw.locationClaim.slice(0,100):null};}catch{return null;}
}

export async function analyzeQuestConversation(state:WorldState,actorId:string,playerLine:string,npcLine:string,options:{endpoint?:string;model?:string;signal?:AbortSignal}={}):Promise<NpcQuest[]>{
 const active=state.quests.filter(q=>q.status==='accepted');if(!active.length)return [];
 const endpoint=options.endpoint??(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('ai')==='opencode'?'http://127.0.0.1:11436/api/chat':'http://127.0.0.1:11435/api/chat');
 const actor=state.actors.find(item=>item.id===actorId);if(!actor)return [];
 const locations=(state.locations??[]).filter(location=>location.knownByActorIds.includes(actorId)).map(location=>({id:location.id,name:location.name,kind:location.kind,x:location.x,y:location.y}));const quests=active.map(q=>({id:q.id,title:q.title,description:q.description,objective:q.objective,requirements:q.requirements}));
 const system=`Sos el analista de continuidad de un RPG. Analizás si una conversación aporta información realmente útil a un encargo aceptado. No sos el narrador y no podés inventar hechos. Un saludo, una emoción o charla cotidiana es irrelevant. lead requiere información concreta nueva vinculada al objetivo; assistance requiere una oferta o acción concreta de ayuda; progress requiere evidencia de avance; completion solo si el diálogo confirma explícitamente que el objetivo está completo. Elegí como máximo un encargo de la lista, y solo si la relación es inequívoca. Solo podés identificar un lugar mediante un id de la lista de lugares reales que el NPC conoce. No inventes nombres ni coordenadas. Si el diálogo menciona un lugar inexistente o que el NPC no conoce, locationId debe ser null y locationClaim debe contener el nombre no verificado. La existencia del lugar no demuestra que el objeto esté allí: registrá una pista, no una confirmación. No marques completion por promesas. Si no hay aporte útil, kind=irrelevant, questId=null, summary vacío y locationId=null. Devolvé únicamente JSON válido con: {"questId":string|null,"kind":"lead"|"assistance"|"progress"|"completion"|"irrelevant","summary":string,"confidence":number 0..1,"locationId":string|null,"locationClaim":string|null}.`;
 const prompt=JSON.stringify({conversation:{player:playerLine,npc:npcLine},speaker:{id:actor.id,name:actor.name,position:{x:actor.x,y:actor.y},goal:actor.goal,knownTerrainNearSpeaker:state.tiles.filter(t=>t.explored&&Math.abs(t.x-actor.x)<=3&&Math.abs(t.y-actor.y)<=3).map(t=>({x:t.x,y:t.y,terrain:t.terrain}))},playerPosition:{x:state.player.x,y:state.player.y},acceptedQuests:quests,actualNamedLocations:locations,instruction:'Solo estos lugares existen y el NPC solo conoce los que aparecen en esta lista. No inventes clínica, depósito, hospital ni ningún otro lugar fuera de la lista.'});
 const controller=new AbortController();const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({model:options.model??'qwen2.5:3b',messages:[{role:'system',content:system},{role:'user',content:prompt}],stream:true,keep_alive:'10m',options:{temperature:0.05,num_predict:220,num_ctx:4096}}),signal:controller.signal});if(!response.ok||!response.body)return [];
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',done=false;
  while(!done){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines){if(!line.trim())continue;try{const data=JSON.parse(line) as {message?:{content?:string};response?:string;done?:boolean};content+=data.message?.content??data.response??'';if(data.done)done=true;}catch{}}}
  const result=safeParse(content);if(!result||result.kind==='irrelevant'||result.confidence<0.65||!result.questId)return [];
  const quest=active.find(q=>q.id===result.questId);if(!quest)return [];
  const namedLocation=(state.locations??[]).find(location=>location.id===result.locationId&&location.knownByActorIds.includes(actorId));
  const spatialText=(playerLine+' '+npcLine).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const hasSpatialClue=/\b(norte|sur|este|oeste|cerca|detras|junto|lado|esquina|por alli|por ahi|enfrente|dentro|afuera|al lado|a unos metros|en esa zona|en el edificio|en la|en el)\b/.test(spatialText);
  const normalizePlace=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const mentionsPlace=!!namedLocation&&spatialText.includes(normalizePlace(namedLocation.name))||!!namedLocation&&spatialText.includes(normalizePlace(namedLocation.name.split(' ')[0]!));
  const verifiedLocation=namedLocation&&hasSpatialClue&&mentionsPlace&&!result.locationClaim?{x:namedLocation.x,y:namedLocation.y,terrain:'door',id:namedLocation.id}:undefined;
  const summary=result.summary.trim();if(!summary)return [];
  const entry:QuestGuideEntry={id:'guide-'+state.day+'-'+state.minute+'-'+actorId+'-'+quest.id+'-'+state.log.length,worldMinute:state.day*1440+state.minute,kind:result.kind,sourceActorId:actorId,summary,confidence:result.confidence,...(verifiedLocation?{locationX:verifiedLocation.x,locationY:verifiedLocation.y,locationDiscovered:true}:{})};
  quest.guideEntries??=[];quest.guideEntries.push(entry);quest.guideEntries=quest.guideEntries.slice(-20);
  if(verifiedLocation){quest.targetX=verifiedLocation.x;quest.targetY=verifiedLocation.y;quest.targetDiscovered=true;const location=state.locations?.find(item=>item.id===verifiedLocation.id);if(location)location.discovered=true;}
  state.log.push({tick:state.tick,text:'IA · '+quest.title+' · '+entry.summary+(result.locationClaim&&!verifiedLocation?' · Ubicación no verificada: '+result.locationClaim:''),kind:'event'});return [quest];
 }catch{return [];}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
