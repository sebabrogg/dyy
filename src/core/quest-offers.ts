import type {NpcQuest,WorldState} from './types.ts';
import {ensureQuestObjectives} from './quest-objectives.ts';

const normalize=(value:string)=>value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

/** Defensive validation for offers restored from old saves as well as newly generated ones. */
export function isValidQuestOffer(quest:NpcQuest):boolean {
 const topic=normalize(quest.objectiveTopic??'');
 const visibleText=normalize(quest.title+' '+quest.objective+' '+quest.description);
 if(!quest.title.trim()||!quest.objective.trim())return false;
 if(/(?:malgastar el tiempo|perder el tiempo|ofrecer ayuda|offered ayuda|otra forma|otra manera)/.test(topic+' '+visibleText)||/\b(?:offered|accepted|declined)\b/.test(visibleText))return false;
 // Life-mission offers have engine-defined objectives and do not need a dialogue topic.
 if(!quest.missionId.startsWith('dialogue-'))return true;
 if(/\b(?:quest|objective|status)\b/.test(visibleText))return false;
 if(quest.objectiveType==='investigate_and_report'&&(!topic||/^(?:tiempo|ayuda|algo|alguien|nada|eso|esto|una cosa)$/.test(topic)))return false;
 return true;
}

/** Turns an NPC's concrete, directed request into a real quest. Dialogue alone is never the source of truth. */
export function registerQuestFromDialogue(state:WorldState,giverId:string,npcLine:string):NpcQuest|null {
 const actor=state.actors.find(item=>item.id===giverId);if(!actor||!actor.alive)return null;
 const text=normalize(npcLine);
 // Reject conversational filler and idioms before extracting a topic. These are not world entities.
 const nonQuestChatter=/(?:\bmalgastar el tiempo\b|\bperder el tiempo\b|\bno quiero perder tiempo\b|\bno me hagas perder tiempo\b|\bsi venis a (?:ofrecer )?ayuda\b|\bsi vienes a (?:ofrecer )?ayuda\b|\boffered\b|\bhelp offered\b)/.test(text);
 if(nonQuestChatter)return null;
 // Clarification and repair moves keep a conversation going; they are not requests for world actions.
 // Without this guard, broad verbs like 'decime' turn 'decímelo de otra forma' into an investigation of 'otra forma'.
 const clarificationOnly=/(?:\bno te segui bien\b|\bno te entendi\b|\bno entendi\b|\bdecimelo de otra forma\b|\bdecimelo de otra manera\b|\bexplicamelo de otra forma\b|\bexplicamelo de otra manera\b|\brepetimelo\b|\brepeti eso\b|\bcomo dijiste\b|\bque quisiste decir\b|\bno me quedo claro\b)/.test(text);
 if(clarificationOnly)return null;
 // Internal NPC monologues, scene summaries, and model reasoning are not spoken requests.
 // Never turn first-person knowledge/suspicion notes into player-facing quests.
 const internalNarration=/(?:^|[.!?] )soy [^,.!?]{1,90}, (?:la que|el que|quien)|\bse que (?:este|esta|el|la|acaba de|no)|\btodo lo que tengo de (?:el|ella)|\bno se que (?:busca|busco|quiere|quiere)|\bsospecho que|\bes solo una impresion|\bsin mostrarle|\blo que quiero es sacarle|\bpor ahora me alcanza con|\blo que se es todo lo que tengo|\bno se de el|\bno se de ella/.test(text);
 if(!text||internalNarration||/(?:no tengo|no hay|ningun|nada de) (?:ningun )?(?:encargo|tarea|trabajo|favor|recado)/.test(text))return null;
 // Require both a request directed at the player and a concrete topic/action. Need or desire alone is not a quest.
 const asksPlayer=/(?:avisame|avisa|informame|volve y|volves y|volve|fijate|investiga|busca|averigua|consegui|traeme|lleva|entregame|decime|contame|me traes|me traigas|si escuchas|si escuchas algo|si sabes algo|necesito que|quiero que|podrias|podes|me serviria que|lo que me sirve es que|el favor es que|reparame|arreglame|repara|arregla|despeja|recupera|\b(?:baja|revisa|inspecciona|comprueba|sigue|identifica)\b)/.test(text);
 if(!asksPlayer)return null;
 // A quest noun by itself is ambiguous (the player may be offering a job to this NPC).
 // Only treat it as explicit quest framing when a verb/qualifier introduces it.
 const explicitQuest=/(?:\b(?:ten[eé]s|tienes|hay|tengo|necesito|busco|ofrezco|aceptas|quer[eé]s|quieres|es|sigue siendo|te puedo ofrecer)\s+(?:alg[uú]n|alguna|un|una|el|la|este|esta)?\s*(?:encargo|tarea|trabajo|favor|recado|misi[oó]n)\b|\bte encargo\b|\bte puedo pedir\b|\bte pido que\b|\bel favor es que\b|\bel encargo sigue en pie\b|\bla tarea sigue en pie\b)/.test(text);
 const topicMatch=text.match(/\b(?:sobre|del|de|por|acerca de)\s+(?:el|la|los|las|un|una)?\s*([a-z0-9ñ ]{2,48}?)(?=[,.!?;:]|\s+(?:y avisame|y volve|y volvé|y despues|y después|y me|despues volve|después volvé|para que|porque|que me|si podes|si pod[eé]s)|$)/i);
 let topic=(topicMatch?.[1]??'').trim().replace(/\b(?:algo|nada|esto|eso|alguien|alguna cosa)\b/g,'').trim();
 if(!topic){const concreteTopic=text.match(/\b(generador(?: de la subestacion)?|subestacion|turnos? de la manana|llave)\b/);if(concreteTopic)topic=concreteTopic[1].trim();}
 const spatialTopic=text.match(/\b(?:entra|ingresa|se mete|accede)\s+(?:a|al|a la|en|en el|en la)\s+(.+?)(?=[,.!?;:]|\s+(?:y despues|y después|y avisame|y volve|y volvé)|$)/i);
 if(spatialTopic)topic=spatialTopic[1].trim();
 if(!topic){const m=text.match(/(?:escuchas algo|sabes algo|averigua|investiga|busca|consegui|consegui|fijate si|necesito)\s+(?:si\s+)?(?:hay\s+)?(?:algo\s+)?(?:sobre\s+)?(?:del\s+|de\s+)?([a-z0-9ñ ]{2,36}?)(?=[,.!?;:]|\s+(?:y avisame|y volve|y volvé|y despues|y después|y me|despues volve|después volvé|para que|porque|que me)|$)/i);topic=(m?.[1]??'').trim();}
 topic=topic.replace(/\b(?:me|te|vos|que|si|algo|avisame|volves|volve|volvé|fijate|por favor)\b/g,'').trim();
 if(!explicitQuest&&!/(?:avisame|fijate|investiga|busca|averigua|decime|contame|si escuchas|si sabes algo|necesito que|quiero que|me serviria que|lo que me sirve es que|traeme|entregame|repara|arregla|despeja|consegui|recupera|baja|revisa|inspecciona|comprueba|sigue|identifica)/.test(text))return null;
 const worldMinute=Math.floor((state.elapsedWorldMs??0)/60000);
 let objectiveType:NpcQuest['objectiveType']='investigate_and_report';let requiredItemId:string|null=null;
 const knownItems=[...state.player.inventory,...state.actors.filter(a=>a.id!==giverId).flatMap(a=>a.inventory??[]),...(state.groundItems??[]).map(g=>g.item)];const repairItems=[...knownItems,...(actor.inventory??[])];
 const mentionsRepair=/\b(?:repara|reparar|arregla|arreglar|reparame|arreglame)\b/.test(text);
 const mentionsDelivery=/\b(?:traeme|trae|entregame|entrega|lleva|me traes|me traigas)\b/.test(text);
 const mentionsScrap=/\b(?:chatarra|pieza de metal)\b/.test(text);const mentionsRubble=/\b(?:escombros|bloqueo|obstaculo)\b/.test(text);
 const itemMentioned=knownItems.find(item=>{const name=normalize(item.name);const id=normalize(item.id).replace(/-/g,' ');return (name.length>3&&text.includes(name))||(id.length>3&&text.includes(id))||(normalize(item.id)==='battery'&&/\b(?:bateria|pila)\b/.test(text))||(normalize(item.id)==='scrap'&&/\bchatarra\b/.test(text));});
 if(mentionsRepair){const repairTarget=repairItems.find(item=>{const name=normalize(item.name);return name.length>3&&text.includes(name);});const shelterGenerator=/\bgenerador\b/.test(text)&&/(?:refugio|base|refugio)/.test(text);if(repairTarget){if((repairTarget.integrity??repairTarget.condition??100)>=80)return null;objectiveType='repair_item';requiredItemId=repairTarget.id;topic=repairTarget.name;}else if(shelterGenerator){objectiveType='repair_item';requiredItemId='shelter-generator';topic='el generador del refugio';}else return null;}
 else if(mentionsDelivery){if(!itemMentioned)return null;objectiveType='deliver_item';requiredItemId=itemMentioned.id;topic=itemMentioned.name;}
 else if(/\b(?:despeja|despejar|retira|retirar|quita|quitar)\b/.test(text)&&mentionsRubble&&state.tiles.some(tile=>tile.terrain==='scrap')){objectiveType='clear_obstacle';topic='los escombros';}
 else if(/\b(?:consegui|conseguir|recupera|recuperar|junta|juntar|busca|buscar)\b/.test(text)&&mentionsScrap){objectiveType='collect_scrap';requiredItemId='scrap';topic='chatarra';}
 else if(!/(?:investiga|averigua|fijate si|informame|avisame|decime|contame|si escuchas|si sabes algo|necesito que averigues|quiero que averigues|observa|examina|inspecciona|revisa|baja|averigua quien|averigua donde)/.test(text))return null;
 if(objectiveType==='investigate_and_report'){
  const normalizedTopic=normalize(topic).replace(/^(?:el|la|los|las|un|una)\s+/,'').trim();
  const abstractTopic= /^(?:nada|ningun encargo|un favor|una cosa|eso|esto|malgastar el tiempo|perder el tiempo|el tiempo|tiempo|ayuda|ofrecer ayuda|ofrecida ayuda|offered ayuda|otra forma|otra manera|algo|alguien|una impresion)$/.test(normalizedTopic);
  const leakedInternal= /\b(?:offered|accepted|declined|quest|objective|status)\b/.test(normalizedTopic);
  const knownActor=state.actors.some(candidate=>candidate.id!==giverId&&normalize(candidate.name)===normalizedTopic);
  const knownItem=[...state.player.inventory,...state.actors.flatMap(candidate=>candidate.inventory??[]),...(state.groundItems??[]).map(g=>g.item)].some(item=>normalize(item.name)===normalizedTopic||normalize(item.id).replace(/-/g,' ')===normalizedTopic);
  const concretePlaceOrObject=/\b(?:generador|bomba|bombeo|agua|estacion|refugio|puerta|pasillo|edificio|ruinas|sector|zona|entrada|salida|terminal|radio|vehiculo|vehiculo|camion|deposito|medico|clinica|torre|antena|motor|maquina|panel|cable|escombros|bloqueo|puesto|campamento|almacen|pozo|tuberia|conducto|bateria|pila|arma|cerradura|puente|camino|pared|ventilacion|filtro|tanque|valvula)\b/.test(normalizedTopic);
  if(normalizedTopic.length<3||abstractTopic||leakedInternal||(!knownActor&&!knownItem&&!concretePlaceOrObject))return null;
 }
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
