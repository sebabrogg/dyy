import type {Actor,LogEntry} from '../core/types.ts';

export const LOCAL_AI_ENDPOINT='http://127.0.0.1:11434/api/chat';
export const DEFAULT_LOCAL_MODEL='qwen2.5:3b';
export const LOCAL_AI_TIMEOUT_MS=9000;

export interface DialogueContext {
 actorName:string; faction:string; personality:string; goal:string;
 disposition:string; relationship:string; memories:string[];
 playerLine:string; engineLine:string; internalMind:string; lifeMission:string;
}

export function buildDialogueContext(actor:Actor,playerLine:string,engineLine:string):DialogueContext {
 const relation=actor.social.relationships.player;
 return {
  actorName:actor.name,faction:actor.faction,personality:actor.personality,goal:actor.goal,
  disposition:actor.disposition,
  relationship:relation?'confianza '+relation.trust+'/100; hostilidad '+relation.hostility+'/100; resentimiento '+relation.resentment+'/100; miedo '+relation.fear+'/100':'relación desconocida',
  memories:actor.social.memories.filter(memory=>memory.targetId==='player').slice(-8).map(memory=>memory.description||memory.interpretation),
  playerLine:playerLine.slice(0,500),engineLine:engineLine.slice(0,240),
  internalMind:JSON.stringify(actor.mind),lifeMission:JSON.stringify(actor.lifeMission),
 };
}

export function buildDialogueMessages(context:DialogueContext):Array<{role:'system'|'user';content:string}> {
 const system=[
  'Eres la voz de un NPC de Dysto, un RPG distópico. Habla en español rioplatense natural, sin exagerar el lunfardo.',
  'Interpreta el mensaje del jugador como este personaje concreto. Decide por ti mismo qué piensa, siente, quiere comunicar, ocultar, negar o preguntar, usando su personalidad, biografía interna, memoria, conocimientos, objetivos y relación con el jugador.',
  'No hay respuesta base ni diálogo prefabricado. No reveles datos privados solo porque estén en tu contexto; decide si este personaje los compartiría en esta situación.',
  'No afirmes como hechos cosas que no estén respaldadas por el contexto. Puedes mentir, equivocarte, evadir o expresar incertidumbre si encaja con el personaje, pero no cambies el estado real del mundo.',
  'Devuelve solo lo que diría el personaje, en una o dos frases breves. Sin etiquetas, explicaciones, comillas ni narración externa.',
 ].join(' ');
 const user=[
  'PERSONAJE: '+context.actorName,'FACCIÓN: '+context.faction,
  'PERSONALIDAD: '+context.personality,'OBJETIVO: '+context.goal,
  'DISPOSICIÓN: '+context.disposition,'RELACIÓN CON EL JUGADOR: '+context.relationship,
  'RECUERDOS RELEVANTES SOBRE EL JUGADOR: '+(context.memories.join(' | ')||'ninguno registrado'),
  'CONTEXTO MENTAL INTERNO (no lo recites; úsalo para razonar): '+context.internalMind,
  'MISIÓN VITAL PRIVADA: '+context.lifeMission,
  'EL JUGADOR DIJO: '+context.playerLine,
  'Responde como el personaje, de forma natural y breve. Decide según su mente y la situación, no según una plantilla.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:user}];
}

export function cleanNpcLine(value:string):string {
 return value.replace(/<think>[\s\S]*?<\/think>/gi,'')
  .replace(/^\s*(respuesta|npc|personaje)\s*:\s*/i,'').trim()
  .replace(/^["'«]+|["'»]+$/g,'').replace(/\s+/g,' ').trim().slice(0,320);
}

export async function generateLocalNpcLine(
 context:DialogueContext,
 options:{endpoint?:string;model?:string;signal?:AbortSignal;onPartial?:(text:string)=>void}={},
):Promise<string> {
 const controller=new AbortController();
 const abort=()=>controller.abort();
 options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,LOCAL_AI_TIMEOUT_MS);
 try {
  const response=await fetch(options.endpoint??LOCAL_AI_ENDPOINT,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({model:options.model??DEFAULT_LOCAL_MODEL,messages:buildDialogueMessages(context),stream:true,keep_alive:'10m',options:{temperature:0.75,num_predict:72,num_ctx:2048}}),
   signal:controller.signal,
  });
  if(!response.ok)throw new Error('El modelo local respondió '+response.status);
  if(!response.body)throw new Error('El modelo local no permite streaming');
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='',assembled='',lastPublished='';
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   buffer+=decoder.decode(value,{stream:true});
   const lines=buffer.split('\n');
   buffer=lines.pop()??'';
   for(const line of lines){
    if(!line.trim())continue;
    const chunk=JSON.parse(line) as {message?:{content?:unknown};done?:boolean};
    if(typeof chunk.message?.content==='string'){
     assembled+=chunk.message.content;
     const partial=cleanNpcLine(assembled);
     if(partial&&partial!==lastPublished){lastPublished=partial;options.onPartial?.(partial);}
    }
   }
  }
  buffer+=decoder.decode();
  if(buffer.trim()){
   const chunk=JSON.parse(buffer) as {message?:{content?:unknown}};
   if(typeof chunk.message?.content==='string')assembled+=chunk.message.content;
  }
  const line=cleanNpcLine(assembled);
  if(!line)throw new Error('El modelo local devolvió una respuesta vacía');
  if(line!==lastPublished)options.onPartial?.(line);
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
