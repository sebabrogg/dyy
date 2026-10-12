import type {NpcQuest,WorldState,QuestGuideEntry} from './types.ts';

const STOP=new Set(['para','como','pero','porque','donde','cuando','desde','hasta','sobre','entre','esta','este','eso','esto','tiene','tengo','hacer','hacerlo','ayuda','ayudar','encargo','buscar','busco','quiero','puedo','puede','algo','alguien','tambien','conseguir','necesito','necesita','the','and','for']);
function tokens(value:string):Set<string>{return new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{4,}/g)?.filter(word=>!STOP.has(word))??[]);}
function questTerms(q:NpcQuest):Set<string>{return tokens([q.title,q.description,q.objective,...q.requirements].join(' '));}
function hasActionSignal(text:string):'lead'|'assistance'|'progress'|'irrelevant'{const t=text.toLowerCase();if(/ya (lo|la|los|las) (encontre|consegui|entregue|repare|limpie)|he (encontrado|conseguido|entregado|reparado)|objetivo (cumplido|completado)|lo hice|aqui estan/.test(t))return 'progress';if(/te ayudo|puedo ayudar|le ayude|lo acompa|te consigo|voy a conseguir|voy a buscar|me encargo|consegui|encontre|te llevo|te traigo|reparare/.test(t))return 'assistance';if(/vi |vimos |escuche|dicen que|me dijeron|se encuentra|esta cerca|lo vi|la vi|hay (piezas|restos|materiales)|preguntale|pregunta por|busca en|cerca de|al norte|al sur|detras de|junto a/.test(t))return 'lead';return 'irrelevant';}
export function relateConversationToQuests(state:WorldState,actorId:string,playerLine:string,npcLine:string):NpcQuest[]{
 const combined=playerLine+' '+npcLine;const normalized=combined.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const messageTerms=tokens(combined);const signal=hasActionSignal(normalized);if(signal==='irrelevant'||messageTerms.size===0)return [];
 const matches=state.quests.filter(q=>q.status==='accepted').map(q=>{const terms=questTerms(q);const overlap=[...messageTerms].filter(word=>terms.has(word));return {q,overlap,score:overlap.length/Math.max(1,Math.min(terms.size,5))};}).filter(item=>item.overlap.length>=1&&item.score>=0.2).sort((a,b)=>b.score-a.score);
 if(!matches.length)return [];
 const best=matches[0]!;if(matches.length>1&&matches[1]!.score>=best.score*.9&&best.overlap.length<2)return [];
 const q=best.q;const entry:QuestGuideEntry={id:'guide-'+state.day+'-'+state.minute+'-'+actorId+'-'+q.id,worldMinute:state.day*1440+state.minute,kind:signal,sourceActorId:actorId,summary:(signal==='lead'?'Pista registrada: ':signal==='assistance'?'Ayuda relacionada: ':'Posible progreso: ')+combined.trim().slice(0,220),confidence:Math.min(0.94,0.55+best.score*.35)};
 q.guideEntries??=[];if(!q.guideEntries.some(e=>e.id===entry.id))q.guideEntries.push(entry);q.guideEntries=q.guideEntries.slice(-20);
 state.log.push({tick:state.tick,text:'GUÍA · '+q.title+' · '+entry.summary,kind:'event'});return [q];
}
