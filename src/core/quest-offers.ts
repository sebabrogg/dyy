import type {NpcQuest,WorldState} from './types.ts';

const normalize=(value:string)=>value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

/** Turns an NPC's concrete, directed request into a real quest. Dialogue alone is never the source of truth. */
export function registerQuestFromDialogue(state:WorldState,giverId:string,npcLine:string):NpcQuest|null {
 const actor=state.actors.find(item=>item.id===giverId);if(!actor||!actor.alive)return null;
 const text=normalize(npcLine);
 if(!text||/(?:no tengo|no hay|ningun|nada de) (?:ningun )?(?:encargo|tarea|trabajo|favor|recado)/.test(text))return null;
 // Require both a request directed at the player and a concrete topic/action. Need or desire alone is not a quest.
 const asksPlayer=/(?:avisame|avisa|informame|volv[eé] y|volves y|volves|volvé|fijate|investiga|busca|averigua|averigua|consegui|consegu[ií]|traeme|tra[eé]me|lleva|entregame|decime|contame|me traes|me traigas|si escuchas|si escuchas algo|si sabes algo|necesito que|quiero que|podrias|podes|me serviria que|lo que me sirve es que|el favor es que)/.test(text);
 if(!asksPlayer)return null;
 const explicitQuest=/(?:es un encargo|te encargo|tengo un encargo|un encargo para vos|una tarea para vos|te puedo pedir|te pido que|el favor es que)/.test(text);
 const topicMatch=text.match(/\b(?:sobre|del|de|por|acerca de)\s+(?:el|la|los|las|un|una)?\s*([a-z0-9ñ ]{2,48}?)(?=[,.!?;:]|\s+(?:y avisame|y volve|y volvé|y me|para que|porque|que me|si podes|si pod[eé]s)|$)/i);
 let topic=(topicMatch?.[1]??'').trim().replace(/\b(?:algo|nada|esto|eso|alguien|alguna cosa)\b/g,'').trim();
 if(!topic){const m=text.match(/(?:escuchas algo|sabes algo|averigua|investiga|busca|consegui|consegui|fijate si|necesito)\s+(?:si\s+)?(?:hay\s+)?(?:algo\s+)?(?:sobre\s+)?(?:del\s+|de\s+)?([a-z0-9ñ ]{2,36}?)(?=[,.!?;:]|\s+(?:y avisame|y volve|y volvé|y me|para que|porque|que me)|$)/i);topic=(m?.[1]??'').trim();}
 topic=topic.replace(/\b(?:me|te|vos|que|si|algo|avisame|volves|volve|volvé|fijate|por favor)\b/g,'').trim();
 if(topic.length<3||/^(?:nada|ningun encargo|un favor|una cosa|eso|esto)$/.test(topic))return null;
 // The follow-up turn may confirm an earlier offer; do not mint a second copy.
 const topicKey=normalize(topic);
 const duplicate=state.quests.find(q=>q.giverId===giverId&&['offered','accepted'].includes(q.status)&&normalize(q.title+' '+q.description+' '+q.objective).includes(topicKey));
 if(duplicate)return duplicate;
 if(!explicitQuest&&!/(?:avisame|fijate|investiga|busca|averigua|decime|contame|si escuchas|si sabes algo|necesito que|quiero que|me serviria que|lo que me sirve es que)/.test(text))return null;
 const worldMinute=Math.floor((state.elapsedWorldMs??0)/60000);
 const titleTopic=topic.charAt(0).toLocaleUpperCase('es')+topic.slice(1).replace(/[.!?]+$/,'');
 const title=/\bagua\b/.test(topicKey)?'¿Alguien sabe sobre el agua?':/gruta/.test(topicKey)?'El loco de Gruta':titleTopic.length>38?titleTopic.slice(0,35).trim()+'…':titleTopic+'?';
 const objective='Averigua qué se sabe sobre '+topic+' y vuelve a informarle a '+actor.name+'.';
 const quest:NpcQuest={id:'quest-dialogue-'+giverId+'-'+state.tick+'-'+topicKey.replace(/[^a-z0-9]+/g,'-').slice(0,24),giverId,missionId:'dialogue-'+giverId+'-'+topicKey.replace(/[^a-z0-9]+/g,'-').slice(0,32),title,description:npcLine.trim().slice(0,320),objective,requirements:[],reward:'Por acordar con '+actor.name+'.',status:'offered',offeredAtTick:state.tick,acceptedAtTick:null,deadlineTick:state.tick+240,offeredAtWorldMinute:worldMinute,acceptedAtWorldMinute:null,deadlineWorldMinute:worldMinute+2880,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null};
 state.quests.push(quest);return quest;
}
