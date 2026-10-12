import type {NpcQuest} from './types.ts';

function normalize(text:string):string {
 return text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}

export function resolveQuestFollowup(line:string,quests:NpcQuest[],giverId:string):string|null {
 const clean=normalize(line);
 const asksStatus=(/\b(encargo|tarea|trabajo|mision|propuesta)\b/.test(clean)&&/\b(sigue|todavia|aun|aparece|desaparecio|abierto|vigente|estado|paso|por que|porque|tenes|tienes|activo|activa)\b/.test(clean))||/\b(?:ya no me aparece|no me aparece|porque ya no|por que ya no|donde quedo)\b/.test(clean);
 if(!asksStatus)return null;
 const active=quests.filter(q=>q.giverId===giverId&&(q.status==='accepted'||q.status==='offered')).sort((a,b)=>b.offeredAtTick-a.offeredAtTick)[0];
 if(!active)return 'Ahora mismo no tengo ningún encargo tuyo registrado como pendiente o aceptado. No quiero inventarte otro: si te había ofrecido uno, revisemos qué pasó con ese.';
 if(active.status==='accepted')return 'Sí, sigue en pie. Es «'+active.title+'». El objetivo es: '+active.objective+' Lo tengo registrado como aceptado; no cambió por esta conversación.';
 return 'Sigue pendiente, pero todavía no figura como aceptado. Es «'+active.title+'»: '+active.objective+' Si lo querés, aceptalo para dejarlo registrado.';
}

export function fallbackNpcReply(line:string,quests:NpcQuest[],giverId:string):string {
 return resolveQuestFollowup(line,quests,giverId)??'Se me cortó la idea un momento. Te escuché, pero prefiero pedirte que me lo repitas antes que darte una respuesta inventada.';
}

export function sanitizeNpcLine(raw:string):string {
 let text=raw.replace(/[\u3400-\u9fff\uf900-\ufaff]/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1').replace(/^\s*["'“”]+|["'“”]+\s*$/g,'').replace(/\s+/g,' ').trim();
 text=text.replace(/([.!?])\s*\d{2,}(?:[.,]\d+)?\s*(?:metros?|m)\b.*$/i,'$1').trim();
 text=text.replace(/\b(?:respuesta del npc|assistant|assistant:|respuesta:|como modelo de lenguaje)\b[:\s]*/gi,'').trim();
 if(!text||/\b(?:no consigo responder ahora|error interno|stack trace)\b/i.test(text))return '';
 return text.slice(0,700).trim();
}
