import type {NpcQuest,WorldState} from './types.ts';
import {ensureQuestObjectives} from './quest-objectives.ts';

const normalize=(value:string)=>value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

/** Turns an NPC's concrete, directed request into a real quest. Dialogue alone is never the source of truth. */
export function registerQuestFromDialogue(state:WorldState,giverId:string,npcLine:string):NpcQuest|null {
 const actor=state.actors.find(item=>item.id===giverId);if(!actor||!actor.alive)return null;
 const text=normalize(npcLine);
 if(!text||/(?:no tengo|no hay|ningun|nada de) (?:ningun )?(?:encargo|tarea|trabajo|favor|recado)/.test(text))return null;
 // Require both a request directed at the player and a concrete topic/action. Need or desire alone is not a quest.
 const asksPlayer=/(?:avisame|avisa|informame|volv[eé] y|volves y|volves|volvé|fijate|investiga|busca|averigua|averigua|consegui|consegu[ií]|traeme|tra[eé]me|lleva|entregame|decime|contame|me traes|me traigas|si escuchas|si escuchas algo|si sabes algo|necesito que|quiero que|podrias|podes|me serviria que|lo que me sirve es que|el favor es que|reparame|arreglame|repara|arregla|despeja|recupera)/.test(text);
 if(!asksPlayer)return null;
 // A quest noun by itself is ambiguous (the player may be offering a job to this NPC).
 // Only treat it as explicit quest framing when a verb/qualifier introduces it.
 const explicitQuest=/(?:\b(?:ten[eé]s|tienes|hay|tengo|necesito|busco|ofrezco|aceptas|quer[eé]s|quieres|es|sigue siendo|te puedo ofrecer)\s+(?:alg[uú]n|alguna|un|una|el|la|este|esta)?\s*(?:encargo|tarea|trabajo|favor|recado|misi[oó]n)\b|\bte encargo\b|\bte puedo pedir\b|\bte pido que\b|\bel favor es que\b|\bel encargo sigue en pie\b|\bla tarea sigue en pie\b)/.test(text);
 const topicMatch=text.match(/\b(?:sobre|del|de|por|acerca de)\s+(?:el|la|los|las|un|una)?\s*([a-z0-9ñ ]{2,48}?)(?=[,.!?;:]|\s+(?:y avisame|y volve|y volvé|y me|para que|porque|que me|si podes|si pod[eé]s)|$)/i);
 let topic=(topicMatch?.[1]??'').trim().replace(/\b(?:algo|nada|esto|eso|alguien|alguna cosa)\b/g,'').trim();
 if(!topic){const m=text.match(/(?:escuchas algo|sabes algo|averigua|investiga|busca|consegui|consegui|fijate si|necesito)\s+(?:si\s+)?(?:hay\s+)?(?:algo\s+)?(?:sobre\s+)?(?:del\s+|de\s+)?([a-z0-9ñ ]{2,36}?)(?=[,.!?;:]|\s+(?:y avisame|y volve|y volvé|y me|para que|porque|que me)|$)/i);topic=(m?.[1]??'').trim();}
 topic=topic.replace(/\b(?:me|te|vos|que|si|algo|avisame|volves|volve|volvé|fijate|por favor)\b/g,'').trim();
 if(!explicitQuest&&!/(?:avisame|fijate|investiga|busca|averigua|decime|contame|si escuchas|si sabes algo|necesito que|quiero que|me serviria que|lo que me sirve es que|traeme|entregame|repara|arregla|despeja|consegui|recupera)/.test(text))return null;
 const worldMinute=Math.floor((state.elapsedWorldMs??0)/60000);
 let objectiveType:NpcQuest['objectiveType']='investigate_and_report';let requiredItemId:string|null=null;
 const knownItems=[...state.player.inventory,...state.actors.filter(a=>a.id!==giverId).flatMap(a=>a.inventory??[]),...(state.groundItems??[]).map(g=>g.item)];const repairItems=[...knownItems,...(actor.inventory??[])];
 const mentionsRepair=/\b(?:repara|reparar|arregla|arreglar|reparame|arreglame)\b/.test(text);
 const mentionsDelivery=/\b(?:traeme|trae|entregame|entrega|lleva|me traes|me traigas)\b/.test(text);
 const mentionsScrap=/\b(?:chatarra|pieza de metal)\b/.test(text);const mentionsRubble=/\b(?:escombros|bloqueo|obstaculo)\b/.test(text);
 const itemMentioned=knownItems.find(item=>{const name=normalize(item.name);const id=normalize(item.id).replace(/-/g,' ');return (name.length>3&&text.includes(name))||(id.length>3&&text.includes(id))||(normalize(item.id)==='battery'&&/\b(?:bateria|pila)\b/.test(text))||(normalize(item.id)==='scrap'&&/\bchatarra\b/.test(text));});
 if(mentionsRepair){const repairTarget=repairItems.find(item=>{const name=normalize(item.name);return name.length>3&&text.includes(name);});if(!repairTarget||(repairTarget.integrity??repairTarget.condition??100)>=80)return null;objectiveType='repair_item';requiredItemId=repairTarget.id;topic=repairTarget.name;}
 else if(mentionsDelivery){if(!itemMentioned)return null;objectiveType='deliver_item';requiredItemId=itemMentioned.id;topic=itemMentioned.name;}
 else if(/\b(?:despeja|despejar|retira|retirar|quita|quitar)\b/.test(text)&&mentionsRubble&&state.tiles.some(tile=>tile.terrain==='scrap')){objectiveType='clear_obstacle';topic='los escombros';}
 else if(/\b(?:consegui|conseguir|recupera|recuperar|junta|juntar|busca|buscar)\b/.test(text)&&mentionsScrap){objectiveType='collect_scrap';requiredItemId='scrap';topic='chatarra';}
 else if(!/(?:avisame|fijate|investiga|busca|averigua|decime|contame|si escuchas|si sabes algo|informame|necesito que averigues|quiero que averigues)/.test(text))return null;
 if(objectiveType==='investigate_and_report'&&(topic.length<3||/^(?:nada|ningun encargo|un favor|una cosa|eso|esto)$/.test(topic)))return null;
 // The follow-up turn may confirm an earlier offer; do not mint a second copy.
 const topicKey=normalize(topic||requiredItemId||objectiveType);
 const duplicate=state.quests.find(q=>q.giverId===giverId&&['offered','accepted'].includes(q.status)&&normalize(q.title+' '+q.description+' '+q.objective).includes(topicKey));
 if(duplicate)return duplicate;
 const titleTopic=topic.charAt(0).toLocaleUpperCase('es')+topic.slice(1).replace(/[.!?]+$/,'');
 const fallbackTitle=objectiveType==='deliver_item'?'Entregar '+titleTopic:objectiveType==='repair_item'?'Reparar '+titleTopic:objectiveType==='collect_scrap'?'Conseguir '+titleTopic:objectiveType==='clear_obstacle'?'Despejar '+titleTopic:'Averiguar qué se sabe sobre '+titleTopic;const title=fallbackTitle.length>54?fallbackTitle.slice(0,51).trim()+'…':fallbackTitle;
 const objective=objectiveType==='deliver_item'?'Entregale '+titleTopic+' a '+actor.name+'.':objectiveType==='repair_item'?'Repara '+titleTopic+' hasta que alcance al menos un 80 % de integridad.':objectiveType==='collect_scrap'?'Recupera una pieza de chatarra y vuelve a informar a '+actor.name+'.':objectiveType==='clear_obstacle'?'Despeja escombros reales y vuelve a informar a '+actor.name+'.':'Averigua qué se sabe sobre '+topic+' y vuelve a informarle a '+actor.name+'.';
 const stableKey=topicKey.replace(/[^a-z0-9]+/g,'-').slice(0,24);let sequence=state.quests.length+1;let id='quest-'+state.seed.toString(36)+'-'+giverId.replace(/[^a-z0-9-]/gi,'').slice(0,18)+'-'+sequence.toString(36);while(state.quests.some(q=>q.id===id))id='quest-'+state.seed.toString(36)+'-'+giverId.replace(/[^a-z0-9-]/gi,'').slice(0,18)+'-'+(++sequence).toString(36);
 const quest:NpcQuest={id,giverId,missionId:'dialogue-'+giverId+'-'+stableKey,requestText:npcLine.trim().slice(0,500),title,description:npcLine.trim().slice(0,320),objective,requirements:[],reward:'Por acordar con '+actor.name+'.',status:'offered',offeredAtTick:state.tick,acceptedAtTick:null,deadlineTick:state.tick+240,offeredAtWorldMinute:worldMinute,acceptedAtWorldMinute:null,deadlineWorldMinute:worldMinute+2880,objectiveType,progress:0,evidence:null,requiredItemId,objectiveTopic:objectiveType==='investigate_and_report'?topic:undefined};
 ensureQuestObjectives(quest);state.quests.push(quest);return quest;
}
