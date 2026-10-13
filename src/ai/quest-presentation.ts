import type {NpcQuest,Actor} from '../core/types.ts';
import {DEFAULT_LOCAL_MODEL,LOCAL_AI_ENDPOINT,OPENCODE_AI_ENDPOINT,resolveAiProvider} from './local-dialogue.ts';

export interface QuestPresentation {title:string;summary:string;}

/** Stable, useful fallback when the local model is unavailable or returns invalid output. */
export function fallbackQuestPresentation(request:string,actorName:string,objective:string):QuestPresentation {
 const clean=request.replace(/\s+/g,' ').trim().replace(/^['"“”]+|['"“”]+$/g,'');
 const normalized=clean.toLocaleLowerCase('es');
 let title='Lo que necesita '+actorName;
 const action=normalized.match(/(?:necesito que|quiero que|me servir[ií]a que|lo que me sirve es que|fijate si|averigu[aá]|investig[aá]|busc[aá]|consegu[ií]|tra[eé]me|avis[aá]me|dec[ií]me|cont[aá]me)\s+(.{3,65}?)(?:[,.;]|$)/i);
 if(action?.[1])title=action[1].trim().replace(/^que\s+/i,'').replace(/[.!?]+$/,'').replace(/^./,c=>c.toLocaleUpperCase('es'));
 if(title.length>54)title=title.slice(0,51).trimEnd()+'…';
 const summary=`${actorName} pidió: «${clean.slice(0,260)}» ${objective} Esta es la petición expresada por quien la hizo; las sospechas que contiene no se consideran hechos confirmados.`;
 return {title,summary};
}

function validatePresentation(value:unknown,fallback:QuestPresentation):QuestPresentation|null {
 if(!value||typeof value!=='object')return null;
 const data=value as Record<string,unknown>;
 if(typeof data.title!=='string'||typeof data.summary!=='string')return null;
 const title=data.title.replace(/[\r\n]+/g,' ').replace(/^['"“”]+|['"“”]+$/g,'').trim();
 const summary=data.summary.replace(/\s+/g,' ').trim();
 if(title.length<3||title.length>64||summary.length<35||summary.length>520)return null;
 if(/\b(?:objetivo|recompensa|ubicaci[oó]n|misión secundaria)\s*:/i.test(title))return null;
 // Keep the engine's objective out of the model's hands: it only writes the player-facing prose.
 if(!fallback.summary||!summary)return null;
 return {title,summary};
}

export async function generateQuestPresentation(quest:NpcQuest,actor:Actor,options:{endpoint?:string;model?:string;fetcher?:typeof fetch;timeoutMs?:number}={}):Promise<QuestPresentation> {
 const request=quest.requestText??quest.description;
 const fallback=fallbackQuestPresentation(request,actor.name,quest.objective);
 // Old or malformed saves may contain a narrator's internal monologue as the request.
 // Do not ask the model to turn that leaked context into a quest title/summary.
 if(/\bsoy [^.!?]{1,100}, (?:la que|el que|quien)|\btodo lo que tengo de (?:el|ella)|\bsospecho que|\bes solo una impresion|\bsin mostrarle|\blo que quiero es sacarle|\bpor ahora me alcanza con/i.test(request))return {title:'Petición por aclarar',summary:`${actor.name} todavía no formuló una petición concreta. Hablá con el personaje para aclarar qué necesita antes de tratar esto como un encargo.`};
 const provider=resolveAiProvider(typeof window!=='undefined'?window.location.search:'');
 const endpoint=options.endpoint??(provider==='opencode'?OPENCODE_AI_ENDPOINT:LOCAL_AI_ENDPOINT);
 const fetcher=options.fetcher??fetch;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),options.timeoutMs??18000);
 try {
  const health=await fetcher(endpoint.replace(/\/api\/chat\/?$/,'/health'),{signal:controller.signal,cache:'no-store'});
  if(!health.ok)return fallback;
  const status=await health.json() as {ok?:boolean};if(!status.ok)return fallback;
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},signal:controller.signal,body:JSON.stringify({model:options.model??DEFAULT_LOCAL_MODEL,sessionKey:'dysto-quest-'+quest.id,messages:[
   {role:'system',content:'Sos el mismo NPC que hizo la petición. Redactás el título y el resumen del encargo desde tu perspectiva, con tu personalidad y sin revelar secretos que no expresaste. Respondé exclusivamente JSON válido con las claves title y summary. No agregues objetivos, pasos, recompensas, ubicaciones ni condiciones nuevas. El título debe ser concreto y natural, sin etiquetas de estilo. El resumen distingue lo que sabés, lo que sospechás y lo que querés conseguir. No conviertas una sospecha en hecho. No inventes información que no figure en la petición o el contexto.'},
   {role:'user',content:JSON.stringify({npc:actor.name,personality:actor.personality,request:quest.requestText??quest.description,engineDefinedObjective:quest.objective,rule:'El objetivo del motor es inmutable. Escribí solo título y resumen; no reveles secretos ni inventes datos.'})}
  ],stream:true,keep_alive:'10m',options:{temperature:0.62,num_predict:220,num_ctx:2048}})});
  if(!response.ok||!response.body)return fallback;
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',assembled='',done=false;
  while(!done){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines){if(!line.trim())continue;try{const chunk=JSON.parse(line) as {message?:{content?:unknown};done?:boolean};if(typeof chunk.message?.content==='string')assembled+=chunk.message.content;if(chunk.done) {done=true;break;}}catch{return fallback;}}}
  buffer+=decoder.decode();if(buffer.trim()){try{const chunk=JSON.parse(buffer) as {message?:{content?:unknown}};if(typeof chunk.message?.content==='string')assembled+=chunk.message.content;}catch{}}
  const json=assembled.match(/\{[\s\S]*\}/)?.[0];if(!json)return fallback;
  return validatePresentation(JSON.parse(json),fallback)??fallback;
 }catch{return fallback;}finally{clearTimeout(timer);}
}

export function applyQuestPresentation(quest:NpcQuest,presentation:QuestPresentation):void {
 quest.title=presentation.title;
 quest.description=presentation.summary;
 quest.presentationGenerated=true;
}
