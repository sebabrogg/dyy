import type {Actor,LogEntry} from '../core/types.ts';

export const LOCAL_AI_ENDPOINT='http://127.0.0.1:11435/api/chat';
export const DEFAULT_LOCAL_MODEL='qwen2.5:3b';
export const LOCAL_AI_TIMEOUT_MS=45000;
export const LOCAL_AI_HEALTH_TIMEOUT_MS=4000;

async function checkLocalBridge(endpoint:string,onStatus?:(status:string)=>void):Promise<void> {
 const healthUrl=endpoint.replace(/\/api\/chat\/?$/,'/health');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('DIAGNÓSTICO: el puente local no respondió en 4 segundos. Abrí http://127.0.0.1:11435/health en otra pestaña.')),LOCAL_AI_HEALTH_TIMEOUT_MS);});
 try {
  onStatus?.('IA LOCAL · comprobando puente de la PC…');
  const response=await Promise.race([fetch(healthUrl,{method:'GET',cache:'no-store'}),timeout]);
  if(!response.ok)throw new Error('DIAGNÓSTICO: el puente local responde, pero Ollama no está disponible. Revisá http://127.0.0.1:11435/health.');
  const health=await Promise.race([response.json() as Promise<{ok?:boolean;models?:string[];error?:string}>,timeout]);
  if(!health.ok)throw new Error('DIAGNÓSTICO: Ollama no está disponible. '+(health.error||'Revisá http://127.0.0.1:11435/health.'));
  if(!(health.models||[]).some(model=>model==='qwen2.5:3b'||model.startsWith('qwen2.5:3b-')))throw new Error('DIAGNÓSTICO: falta el modelo qwen2.5:3b. Ejecutá en una terminal: ollama pull qwen2.5:3b');
 } catch(error) {
  if(error instanceof Error && error.message.startsWith('DIAGNÓSTICO:'))throw error;
  throw new Error('DIAGNÓSTICO: Dysto no puede acceder al puente de tu PC. Iniciá el puente con npm run ai:bridge y permití el acceso a la red local para este sitio. Detalle: '+(error instanceof Error?error.message:String(error)));
 } finally {if(timer)clearTimeout(timer);}
}

export interface DialogueContext {
 actorName:string; faction:string; personality:string; goal:string;
 disposition:string; relationship:string; memories:string[]; playerKnowledge:string[];
 playerIdentity:string; observedPlayer:string;
 playerLine:string; engineLine:string; internalMind:string; lifeMission:string;
}

export function buildDialogueContext(actor:Actor,playerLine:string,engineLine:string):DialogueContext {
 const relation=actor.social.relationships.player;
 const allMemories=actor.social.memories.filter(memory=>memory.targetId==='player');
 const recentMemories=allMemories.slice(-8);
 const recentIds=new Set(recentMemories.map(memory=>memory.id));
 const salientMemories=allMemories.filter(memory=>!recentIds.has(memory.id)).sort((a,b)=>b.salience-a.salience).slice(0,4);
 const memories=[...new Map([...salientMemories,...recentMemories].map(memory=>[memory.id,memory])).values()].sort((a,b)=>a.tick-b.tick);
 const knowledge=actor.social.knowledge.filter(fact=>fact.targetId==='player'||fact.subjectId==='player').slice(-12);
 return {
  actorName:actor.name,faction:actor.faction,personality:actor.personality,goal:actor.goal,
  disposition:actor.disposition,
  relationship:relation?'confianza '+relation.trust+'/100; hostilidad '+relation.hostility+'/100; resentimiento '+relation.resentment+'/100; miedo '+relation.fear+'/100; respeto '+relation.respect+'/100; afecto '+relation.affection+'/100; deuda '+relation.debt+'/100':'relación desconocida',
  memories:memories.map(memory=>'T+'+memory.tick+' ['+memory.kind+', importancia '+memory.salience+'/100] '+(memory.description||memory.interpretation)),
  playerKnowledge:knowledge.map(fact=>'T+'+fact.tick+' ['+fact.source+', confianza '+fact.confidence+'/100, saltos '+fact.hops+'] '+fact.interpretation),
  playerIdentity:'La persona que tengo delante es el jugador. No conozco automáticamente su nombre, historia, estadísticas, inventario ni pensamientos. Solo puedo atribuirle identidad o características que haya observado, que me haya contado o que me hayan llegado por una fuente identificable.',
  observedPlayer:'El jugador está interactuando conmigo ahora. No deduzcas heridas, equipo, intenciones ni estado mental sin evidencia explícita.',
  playerLine:playerLine.slice(0,500),engineLine:engineLine.slice(0,240),
  internalMind:JSON.stringify(actor.mind),lifeMission:JSON.stringify(actor.lifeMission),
 };
}

export function buildDialogueMessages(context:DialogueContext):Array<{role:'system'|'user';content:string}> {
 const system=[
  'Eres la voz de un NPC de Dysto, un RPG distópico. Habla en español rioplatense natural, sin exagerar el lunfardo.',
  'Eres una persona concreta con continuidad mental, no un asistente que intenta complacer al jugador. Conoces tu propia identidad, historia, necesidades, capacidades, límites, objetivos y contradicciones; estos elementos condicionan tus decisiones.',
  'Construye tu imagen del jugador únicamente con observaciones propias, cosas que te haya dicho, recuerdos y rumores atribuidos a una fuente. Distingue hechos observados, inferencias y rumores. Puedes desconocer quién es, equivocarte o sostener una impresión injusta.',
  'No tienes acceso omnisciente al estado del juego. No conoces automáticamente el inventario, las estadísticas, la identidad real, las intenciones privadas ni los sucesos fuera de tu percepción. No uses información privada de tu contexto como si el jugador u otros personajes también la conocieran.',
  'La relación tiene dimensiones independientes: confianza, hostilidad, resentimiento, miedo, respeto, afecto y deuda. No las promedies ni las conviertas en una sola actitud: alguien puede deberte la vida y seguir odiándote, respetarte y desconfiar de ti, o temerte sin respetarte.',
  'Los recuerdos recientes dan continuidad a la conversación; los recuerdos de mayor importancia pueden seguir influyendo aunque sean antiguos. Una ayuda no borra una traición, una disculpa no garantiza perdón y una relación no cambia de golpe sin evidencia suficiente.',
  'Interpreta el mensaje del jugador como este personaje concreto. Decide qué piensa, siente, quiere comunicar, ocultar, negar o preguntar, usando personalidad, biografía, memoria, conocimiento, objetivos y relación con el jugador.',
  'No hay respuesta base ni diálogo prefabricado. No reveles datos privados solo porque estén en tu contexto; decide si este personaje los compartiría en esta situación.',
  'No afirmes como hechos cosas que no estén respaldadas por el contexto. Puedes mentir, equivocarte, evadir o expresar incertidumbre si encaja con el personaje, pero no cambies el estado real del mundo.',
  'Devuelve solo lo que diría el personaje, en una o dos frases breves. Sin etiquetas, explicaciones, comillas ni narración externa.',
 ].join(' ');
 const user=[
  'PERSONAJE: '+context.actorName,'FACCIÓN: '+context.faction,
  'PERSONALIDAD: '+context.personality,'OBJETIVO: '+context.goal,
  'DISPOSICIÓN: '+context.disposition,'RELACIÓN CON EL JUGADOR: '+context.relationship,
  'IDENTIDAD Y LÍMITES DE CONOCIMIENTO SOBRE EL JUGADOR: '+(context.playerIdentity||'Solo sé que la persona que tengo delante es el jugador; no conozco automáticamente su nombre ni su historia.'),
  'OBSERVACIÓN ACTUAL DEL JUGADOR: '+(context.observedPlayer||'No afirmes conocer estados o detalles no observados.'),
  'RECUERDOS RELEVANTES SOBRE EL JUGADOR: '+(context.memories.join(' | ')||'ninguno registrado'),
  'CONOCIMIENTO Y RUMORES SOBRE EL JUGADOR (con fuente y confianza): '+((context.playerKnowledge||[]).join(' | ')||'ninguno registrado; no inventes información previa'),
  'CONTEXTO MENTAL INTERNO (no lo recites; úsalo para razonar): '+context.internalMind,
  'MISIÓN VITAL PRIVADA: '+context.lifeMission,
  'RESULTADO REAL DEL MOTOR (no lo contradigas): '+(context.engineLine||'sin resultado especial'),
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
 options:{endpoint?:string;model?:string;signal?:AbortSignal;onPartial?:(text:string)=>void;onStatus?:(status:string)=>void}={},
):Promise<string> {
 const endpoint=options.endpoint??LOCAL_AI_ENDPOINT;
 await checkLocalBridge(endpoint,options.onStatus);
 options.onStatus?.('IA LOCAL · enviando mensaje al modelo…');
 const controller=new AbortController();
 const abort=()=>controller.abort();
 options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,LOCAL_AI_TIMEOUT_MS);
 try {
  const response=await fetch(endpoint,{
   method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},
   body:JSON.stringify({model:options.model??DEFAULT_LOCAL_MODEL,messages:buildDialogueMessages(context),stream:true,keep_alive:'10m',options:{temperature:0.75,num_predict:72,num_ctx:2048}}),
   signal:controller.signal,
  });
  if(!response.ok){let detail='';try{const body=await response.json() as {error?:unknown};if(typeof body.error==='string')detail=': '+body.error;}catch{}throw new Error('El puente local/Ollama respondió '+response.status+detail);}
  if(!response.body)throw new Error('El modelo local no permite streaming');
  options.onStatus?.('IA LOCAL · esperando respuesta del modelo…');
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
