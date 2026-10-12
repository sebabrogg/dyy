import type {Actor,LogEntry} from '../core/types.ts';

export const LOCAL_AI_ENDPOINT='http://127.0.0.1:11435/api/chat';
export const OPENCODE_AI_ENDPOINT='http://127.0.0.1:11436/api/chat';
export const DEFAULT_LOCAL_MODEL='qwen2.5:3b';
export function resolveAiProvider(_search:string):'opencode'{return 'opencode';}

export const LOCAL_AI_TIMEOUT_MS=120000;
export const LOCAL_AI_HEALTH_TIMEOUT_MS=4000;

async function checkLocalBridge(endpoint:string,onStatus?:(status:string)=>void,provider:'ollama'|'opencode'='ollama'):Promise<void> {
 const healthUrl=endpoint.replace(/\/api\/chat\/?$/,'/health');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('DIAGNÓSTICO: el puente local no respondió en 4 segundos. Abrí '+healthUrl+' en otra pestaña.')),LOCAL_AI_HEALTH_TIMEOUT_MS);});
 try {
  onStatus?.(provider==='opencode'?'IA OPENCODE · comprobando el servidor de la PC…':'IA LOCAL · comprobando puente de la PC…');
  const response=await Promise.race([fetch(healthUrl,{method:'GET',cache:'no-store'}),timeout]);
  if(!response.ok)throw new Error('DIAGNÓSTICO: el puente local responde, pero el proveedor no está disponible. Revisá '+healthUrl+'.');
  const health=await Promise.race([response.json() as Promise<{ok?:boolean;models?:string[];error?:string}>,timeout]);
  if(!health.ok)throw new Error('DIAGNÓSTICO: '+(provider==='opencode'?'OpenCode':'Ollama')+' no está disponible. '+(health.error||'Revisá '+healthUrl+'.'));
  if(provider==='ollama'&&!(health.models||[]).some(model=>model==='qwen2.5:3b'||model.startsWith('qwen2.5:3b-')))throw new Error('DIAGNÓSTICO: falta el modelo qwen2.5:3b. Ejecutá en una terminal: ollama pull qwen2.5:3b');
 } catch(error) {
  if(error instanceof Error && error.message.startsWith('DIAGNÓSTICO:'))throw error;
  throw new Error('DIAGNÓSTICO: Dysto no puede acceder al puente de tu PC. Iniciá el puente local correspondiente y permití el acceso a la red local para este sitio. Detalle: '+(error instanceof Error?error.message:String(error)));
 } finally {if(timer)clearTimeout(timer);}
}

export interface DialogueContext {
 actorName:string; faction:string; personality:string; goal:string;
 disposition:string; relationship:string; memories:string[]; playerKnowledge:string[];
 playerIdentity:string; observedPlayer:string;
 playerLine:string; engineLine:string; internalMind:string; lifeMission:string; observedSurroundings:string;
 socialContext:string;
}

export function buildDialogueContext(actor:Actor,playerLine:string,engineLine:string,observedSurroundings='No hay observaciones del entorno disponibles.',socialContext='No hay más relaciones o lugares conocidos disponibles.'):DialogueContext {
 const relation=actor.social.relationships.player;
 const allMemories=actor.social.memories;
 const recentMemories=allMemories.slice(-8);
 const recentIds=new Set(recentMemories.map(memory=>memory.id));
 const salientMemories=allMemories.filter(memory=>!recentIds.has(memory.id)).sort((a,b)=>b.salience-a.salience).slice(0,4);
 const memories=[...new Map([...salientMemories,...recentMemories].map(memory=>[memory.id,memory])).values()].sort((a,b)=>a.tick-b.tick);
 const knowledge=actor.social.knowledge.slice(-16);
 return {
  actorName:actor.name,faction:actor.faction,personality:actor.personality,goal:actor.goal,
  disposition:actor.disposition,
  relationship:relation?'confianza '+relation.trust+'/100; hostilidad '+relation.hostility+'/100; resentimiento '+relation.resentment+'/100; miedo '+relation.fear+'/100; respeto '+relation.respect+'/100; afecto '+relation.affection+'/100; deuda '+relation.debt+'/100':'relación desconocida',
  memories:memories.map(memory=>'T+'+memory.tick+' [objetivo '+(memory.targetId==='player'?'jugador':memory.targetId)+', '+memory.kind+', importancia '+memory.salience+'/100] '+(memory.description||memory.interpretation)),
  playerKnowledge:knowledge.map(fact=>'T+'+fact.tick+' ['+fact.source+', confianza '+fact.confidence+'/100, saltos '+fact.hops+'] '+fact.interpretation),
  playerIdentity:'La persona que tengo delante es el jugador. No conozco automáticamente su nombre, historia, estadísticas, inventario ni pensamientos. Solo puedo atribuirle identidad o características que haya observado, que me haya contado o que me hayan llegado por una fuente identificable.',
  observedPlayer:'El jugador está interactuando conmigo ahora. No deduzcas heridas, equipo, intenciones ni estado mental sin evidencia explícita.',
  playerLine:playerLine.slice(0,500),engineLine:engineLine.slice(0,240),
  internalMind:JSON.stringify(actor.mind),lifeMission:JSON.stringify(actor.lifeMission),observedSurroundings,socialContext,
 };
}

export function buildDialogueMessages(context:DialogueContext):Array<{role:'system'|'user';content:string}> {
 const system=[
  'Eres la voz de un NPC de Dysto, un RPG distópico. Habla en español rioplatense natural, sin exagerar el lunfardo.',
  'Eres una persona concreta con continuidad mental, no un asistente que intenta complacer al jugador. Conoces tu propia identidad, historia, necesidades, capacidades, límites, objetivos y contradicciones; estos elementos condicionan tus decisiones.',
  'Construye tu imagen del jugador únicamente con observaciones propias, cosas que te haya dicho, recuerdos y rumores atribuidos a una fuente. Distingue hechos observados, inferencias y rumores. Puedes desconocer quién es, equivocarte o sostener una impresión injusta.',
  'No tienes acceso omnisciente al estado del juego. No conoces automáticamente el inventario, las estadísticas, la identidad real, las intenciones privadas ni los sucesos fuera de tu percepción. No uses información privada de tu contexto como si el jugador u otros personajes también la conocieran.',
  'Tu ubicación importa. Solo menciona lugares que conoces y que figuran en los lugares reales de tu entorno. Si no sabes dónde está algo, dilo o da una pista incierta; no inventes clínicas, depósitos, edificios ni coordenadas. Distingue entre conocer un lugar y saber que un objeto está allí.',
  'La relación tiene dimensiones independientes: confianza, hostilidad, resentimiento, miedo, respeto, afecto y deuda. No las promedies ni las conviertas en una sola actitud: alguien puede deberte la vida y seguir odiándote, respetarte y desconfiar de ti, o temerte sin respetarte.',
  'REGLA CRÍTICA DE CONTINUIDAD: la lista MEMORIAS y CONOCIMIENTO DEL JUGADOR es la única evidencia de interacciones anteriores. Si no hay memoria de una conversación, no digas «otra vez», «ya te lo dije», «como la última vez» ni des por compartido un pasado. Si no hay evidencia de una agresión, nunca afirmes que golpeaste, atacaste o amenazaste al jugador. No inventes nombres, apodos, disputas, objetos que proteges ni hechos de tu biografía para rellenar silencios. La relación desconocida significa que no tienes historia personal confirmada con el jugador; puedes ser cauteloso, pero no actuar como si lo conocieras.',
  'Los recuerdos recientes dan continuidad a la conversación; los recuerdos de mayor importancia pueden seguir influyendo aunque sean antiguos. Una ayuda no borra una traición, una disculpa no garantiza perdón y una relación no cambia de golpe sin evidencia suficiente.',
  'Interpreta el mensaje del jugador como este personaje concreto. Decide qué piensa, siente, quiere comunicar, ocultar, negar o preguntar, usando personalidad, biografía, memoria, conocimiento, objetivos y relación con el jugador.',
  'No hay respuesta base ni diálogo prefabricado. No reveles datos privados solo porque estén en tu contexto; decide si este personaje los compartiría en esta situación.',
  'Interpreta la intención completa del mensaje, no palabras aisladas. Si el jugador pregunta si tenés encargos, recados, mandados, tareas, trabajo o algo que puedas confiarle, respondé directamente según si realmente tenés una propuesta. Si el contexto del motor dice que acabás de ofrecer un encargo, reconocelo en diálogo natural, explicá brevemente qué necesitás y no le preguntes al jugador si él tiene un encargo. Si el motor indica que no tenés ningún encargo para ofrecer, decilo con naturalidad y no des vuelta la pregunta para preguntarle si él tiene uno. La hoja de encargos complementa la conversación, nunca la reemplaza. Si el jugador solo dice una palabra ambigua como «encargo», pedí aclaración en vez de disparar una oferta.',
  'No afirmes como hechos cosas que no estén respaldadas por el contexto. Puedes mentir, equivocarte, evadir o expresar incertidumbre si encaja con el personaje, pero no cambies el estado real del mundo.',
  'Devuelve solo lo que diría el personaje, en una o dos frases breves. No uses etiquetas ni explicaciones externas. No narres gestos entre asteriscos; si una acción física es imprescindible, intégrala de forma breve en la prosa y no la repitas.',
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
  'PUNTO DE VISTA PROPIO: sos '+context.actorName+'. Tenés una vida, recuerdos, necesidades, objetivos y motivos para estar donde estás. Podés explicar qué estabas haciendo si lo sabés; no inventes una explicación segura si no la recordás. No sos omnisciente ni conocés hechos fuera de tus sentidos, recuerdos o fuentes. No confundas la interfaz del juego con tu mundo.',
  'ENTORNO OBSERVADO AHORA: '+context.observedSurroundings+'. Solo esto y tus recuerdos justifican lo que sabés del lugar. No afirmes haber visto personajes, objetos o sucesos que no aparecen aquí ni en tus recuerdos.',
  'PERSONAS, RELACIONES Y LUGARES QUE RECORDÁS: '+(context.socialContext||'sin información adicional registrada'),
  'MISIÓN VITAL PRIVADA: '+context.lifeMission,
  'RESULTADO REAL DEL MOTOR (no lo contradigas): '+(context.engineLine||'sin resultado especial'),
  'EL JUGADOR DIJO: '+context.playerLine,
  'Responde como el personaje, de forma natural y breve. Decide según su mente y la situación, no según una plantilla. Prioriza palabras y silencios; no escribas acciones entre asteriscos, gestos teatrales ni descripciones de acciones salvo que sean indispensables para entender lo que ocurre. No repitas un gesto o una idea ya expresados.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:user}];
}

export function cleanNpcLine(value:string):string {
 const cleaned=value.replace(/<think>[\s\S]*?<\/think>/gi,'')
  .replace(/^\s*(respuesta|npc|personaje)\s*:\s*/i,'')
  .replace(/\*[^*]{1,160}\*/g,' ')
  .replace(/\s+/g,' ').trim()
  .replace(/^[\"'«]+|[\"'»]+$/g,'').trim();
 if(/\bmodule\s+x\b|we['’]ll\s+we\s+ourselves|[\u4e00-\u9fff]/i.test(cleaned))return '';
 const parts=cleaned.split(/(?<=[.!?])\s+/);
 const unique=parts.filter((part,index)=>parts.findIndex(other=>other.toLocaleLowerCase('es')===part.toLocaleLowerCase('es'))===index);
 return unique.join(' ').replace(/\s+/g,' ').trim().slice(0,320);
}

export function validateNpcLineGrounding(value:string,context:DialogueContext):string {
 const line=cleanNpcLine(value);
 if(!line)return 'No te conozco lo suficiente como para asumir qué pasó antes. Contame qué necesitás y te escucho.';
 const evidence=[...(context.memories??[]),...(context.playerKnowledge??[])].join(' ').toLocaleLowerCase('es');
 const normalized=line.toLocaleLowerCase('es');
 const unsupportedPast=[/\botra vez\b/,/\bya te lo dije\b/,/\como te dije\b/,/\la última vez\b/,/\ya hablamos de esto\b/,/\te lo advertí\b/];
 if(unsupportedPast.some(pattern=>pattern.test(normalized))&&!/(habl|advert|dij|convers|discut|encuentr|avis|repet)/i.test(evidence))return 'No tengo claro si ya hablamos antes. Decime qué está pasando y vemos qué puedo hacer.';
 const claimsViolence=/(te pegu[eé]|te golpe[eé]|te ataqu[eé]|te agred[ií]|te di una paliza|te amenac[eé])/i.test(normalized);
 if(claimsViolence&&!/(golpe|peg[oó]|ataqu|agresi|amenaz|pelea|combate|dañ[oó])/i.test(evidence))return 'Pará, no voy a inventar que pasó algo entre nosotros. Te estoy escuchando: explicame qué ocurre.';
 return line;
}

export async function generateLocalNpcLine(
 context:DialogueContext,
 options:{endpoint?:string;model?:string;sessionKey?:string;signal?:AbortSignal;onPartial?:(text:string)=>void;onStatus?:(status:string)=>void}={},
):Promise<string> {
 const provider=resolveAiProvider(typeof window!=='undefined'?window.location.search:'');
 const endpoint=options.endpoint??(provider==='opencode'?OPENCODE_AI_ENDPOINT:LOCAL_AI_ENDPOINT);
 await checkLocalBridge(endpoint,options.onStatus,provider);
 options.onStatus?.(provider==='opencode'?'IA OPENCODE · enviando mensaje…':'IA LOCAL · enviando mensaje al modelo…');
 const controller=new AbortController();
 let timedOut=false;
 const abort=()=>controller.abort();
 options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;abort();},LOCAL_AI_TIMEOUT_MS);
 try {
  const response=await fetch(endpoint,{
   method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},
   body:JSON.stringify({model:options.model??DEFAULT_LOCAL_MODEL,sessionKey:options.sessionKey??context.actorName,messages:buildDialogueMessages(context),stream:true,keep_alive:'10m',options:{temperature:0.75,num_predict:72,num_ctx:2048}}),
   signal:controller.signal,
  });
  if(!response.ok){let detail='';try{const body=await response.json() as {error?:unknown};if(typeof body.error==='string')detail=': '+body.error;}catch{}throw new Error('El puente local/'+(provider==='opencode'?'OpenCode':'Ollama')+' respondió '+response.status+detail);}
  if(!response.body)throw new Error('El modelo local no permite streaming');
  options.onStatus?.(provider==='opencode'?'IA OPENCODE · esperando respuesta…':'IA LOCAL · esperando respuesta del modelo…');
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='',assembled='',modelDone=false;
  while(!modelDone){
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
     // No publiques texto crudo del modelo antes de validar continuidad y hechos.

    }
    if(chunk.done===true){modelDone=true;break;}
   }
  }
  if(modelDone)await reader.cancel().catch(()=>{});
  buffer+=decoder.decode();
  if(buffer.trim()){
   const chunk=JSON.parse(buffer) as {message?:{content?:unknown}};
   if(typeof chunk.message?.content==='string')assembled+=chunk.message.content;
  }
  const line=validateNpcLineGrounding(assembled,context);
  if(!line)throw new Error('El modelo local devolvió una respuesta vacía');
  options.onPartial?.(line);
  return line;
 } catch(error) {
  if(timedOut)throw new Error('Ollama no generó una respuesta en 120 segundos. Revisá la carga de la PC y el puente local; el modelo puede estar tardando en arrancar.');
  throw error;
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
