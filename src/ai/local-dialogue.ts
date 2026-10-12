import type {Actor,LogEntry} from '../core/types.ts';

export const LOCAL_AI_ENDPOINT='http://127.0.0.1:11434/api/chat';
export const DEFAULT_LOCAL_MODEL='qwen2.5:3b';
export const LOCAL_AI_TIMEOUT_MS=9000;

export interface DialogueContext {
 actorName:string; faction:string; personality:string; goal:string;
 disposition:string; relationship:string; memories:string[];
 playerLine:string; engineLine:string;
}

export function buildDialogueContext(actor:Actor,playerLine:string,engineLine:string):DialogueContext {
 const relation=actor.social.relationships.player;
 return {
  actorName:actor.name,faction:actor.faction,personality:actor.personality,goal:actor.goal,
  disposition:actor.disposition,
  relationship:relation?'confianza '+relation.trust+'/100; hostilidad '+relation.hostility+'/100; resentimiento '+relation.resentment+'/100; miedo '+relation.fear+'/100':'relación desconocida',
  memories:actor.social.memories.filter(memory=>memory.targetId==='player').slice(-5).map(memory=>memory.description||memory.interpretation),
  playerLine:playerLine.slice(0,160),engineLine:engineLine.slice(0,240),
 };
}

export function buildDialogueMessages(context:DialogueContext):Array<{role:'system'|'user';content:string}> {
 const system=[
  'Eres la voz de un NPC de Dysto, un RPG distópico. Habla en español rioplatense natural, sin exagerar el lunfardo.',
  'Expresa la intención de la respuesta base con la voz y personalidad del personaje.',
  'No cambies el significado, la postura, la hostilidad ni la disposición de la respuesta base. No perdones, aceptes, amenaces ni reveles información nueva que la respuesta base no contenga.',
  'No inventes hechos del mundo, recuerdos, objetos, acciones ni conocimientos. Los datos de contexto son límites, no una invitación a exponerlos.',
  'Devuelve solo lo que diría el personaje, en una o dos frases breves. Sin etiquetas, explicaciones, comillas ni narración externa.',
 ].join(' ');
 const user=[
  'PERSONAJE: '+context.actorName,'FACCIÓN: '+context.faction,
  'PERSONALIDAD: '+context.personality,'OBJETIVO: '+context.goal,
  'DISPOSICIÓN: '+context.disposition,'RELACIÓN CON EL JUGADOR: '+context.relationship,
  'RECUERDOS RELEVANTES: '+(context.memories.join(' | ')||'ninguno registrado'),
  'EL JUGADOR DIJO: '+context.playerLine,'INTENCIÓN QUE DEBES CONSERVAR: '+context.engineLine,
  'Reformula la respuesta base con una voz individual, sin añadir hechos.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:user}];
}

export function cleanNpcLine(value:string):string {
 return value.replace(/<think>[\s\S]*?<\/think>/gi,'')
  .replace(/^\s*(respuesta|npc|personaje)\s*:\s*/i,'').trim()
  .replace(/^["'«]+|["'»]+$/g,'').replace(/\s+/g,' ').trim().slice(0,320);
}

export async function generateLocalNpcLine(context:DialogueContext,options:{endpoint?:string;model?:string;signal?:AbortSignal}={}):Promise<string> {
 const controller=new AbortController();
 const abort=()=>controller.abort();
 options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,LOCAL_AI_TIMEOUT_MS);
 try {
  const response=await fetch(options.endpoint??LOCAL_AI_ENDPOINT,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({model:options.model??DEFAULT_LOCAL_MODEL,messages:buildDialogueMessages(context),stream:false,keep_alive:'10m',options:{temperature:0.75,num_predict:72,num_ctx:2048}}),
   signal:controller.signal,
  });
  if(!response.ok)throw new Error('El modelo local respondió '+response.status);
  const data=await response.json() as {message?:{content?:unknown}};
  const line=typeof data.message?.content==='string'?cleanNpcLine(data.message.content):'';
  if(!line)throw new Error('El modelo local devolvió una respuesta vacía');
  return line;
 } finally {
  clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
 }
}

export function latestNpcDialogue(log:LogEntry[],actorName:string):LogEntry|undefined {
 for(let i=log.length-1;i>=0;i--){
  const entry=log[i]!;
  if(entry.kind==='dialogue'&&entry.text.startsWith(actorName+': «'))return entry;
  if(entry.kind==='dialogue'&&entry.text.startsWith('Tú: «'))return undefined;
 }
 return undefined;
}
