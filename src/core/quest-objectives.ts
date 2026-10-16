import type {NpcQuest,WorldState} from './types.ts';

export type QuestObjectiveKind='observe_information'|'report_to_giver'|'collect_resource'|'deliver_item'|'clear_obstacle'|'repair_item';
export type QuestEventKind='actor_observed'|'resource_collected'|'item_delivered'|'obstacle_cleared'|'item_repaired'|'evidence_found'|'report_given';
export interface QuestObjective {id:string;kind:QuestObjectiveKind;description:string;required:boolean;status:'pending'|'completed';targetActorId?:string;targetItemId?:string;topic?:string;targetX?:number;targetY?:number;quantity?:number;completedByEventId?:string;completedAtWorldMinute?:number;}
export interface QuestEvent {id:string;kind:QuestEventKind;actorId:'player'|string;targetId?:string;itemId?:string;quantity?:number;x?:number;y?:number;integrity?:number;functional?:boolean;topicText?:string;worldMinute:number;evidence:string;}

const objectiveTemplates:Record<NpcQuest['objectiveType'],Array<Omit<QuestObjective,'status'|'completedByEventId'|'completedAtWorldMinute'>>>= {
 investigate_and_report:[{id:'observe',kind:'observe_information',description:'Registrar una observación relevante y verificable.',required:true,targetActorId:undefined,topic:undefined},{id:'report',kind:'report_to_giver',description:'Comunicar al solicitante lo que se averiguó.',required:true}],
 collect_scrap:[{id:'collect',kind:'collect_resource',description:'Recuperar al menos una unidad del recurso solicitado.',required:true,targetItemId:'scrap',quantity:1},{id:'report',kind:'report_to_giver',description:'Volver con el solicitante e informar del resultado.',required:true}],
 deliver_item:[{id:'deliver',kind:'deliver_item',description:'Transferir el objeto solicitado al destinatario.',required:true,targetItemId:undefined,quantity:1}],
 clear_obstacle:[{id:'clear',kind:'clear_obstacle',description:'Retirar un obstáculo real y dejar el paso libre.',required:true,targetX:undefined,targetY:undefined},{id:'report',kind:'report_to_giver',description:'Informar al solicitante de que el paso quedó despejado.',required:true}],
 repair_item:[{id:'repair',kind:'repair_item',description:'Reparar el objeto solicitado hasta alcanzar al menos un 80 % de integridad.',required:true,targetItemId:undefined}],
};

export function ensureQuestObjectives(q:NpcQuest):QuestObjective[]{
 // Repair malformed legacy offers already present in a saved game, not just newly generated quests.
 const legacyTerritory=/zona de recolecci[oó]n/i.test(q.title+' '+q.description+' '+q.objective)&&/evitar que le quiten|conservar.{0,24}zona|proteger.{0,24}zona/i.test(q.title+' '+q.description+' '+q.objective);
 if(legacyTerritory&&q.status==='offered'&&q.objectiveType==='investigate_and_report'){
  q.title='Averiguar quién amenaza la zona de recolección';
  q.description='La zona aporta alimentos y materiales al refugio. En los últimos días han aparecido huellas cerca de los puntos de recolección y alguien ha movido las marcas del límite. El solicitante teme que estén preparando una ocupación, pero no sabe quién está detrás ni si buscan robar recursos o expulsar a los recolectores. Inspeccioná las marcas y el terreno para reunir pruebas concretas.';
  q.objective='Inspeccionar las marcas del límite y buscar señales concretas de intrusión, como huellas, estacas movidas o materiales retirados.';
  q.objectiveTopic='zona de recolección';
  q.objectives=undefined;
 }
 if(q.objectives?.length){
  if(/zona de recolecci[oó]n/i.test(q.title+' '+q.description+' '+q.objective)){const o=q.objectives.find(o=>o.kind==='observe_information');const r=q.objectives.find(o=>o.kind==='report_to_giver');if(o)o.description='Inspeccionar las marcas del límite de la zona de recolección y buscar señales que permitan averiguar quién intenta ocuparla: huellas, estacas movidas o materiales retirados.';if(r)r.description='Volver con el solicitante e informar qué señales encontraste y qué indican.';}
  return q.objectives;
 }
 const templates=objectiveTemplates[q.objectiveType]??[];
 q.objectives=templates.map(o=>({...o,...(o.kind==='observe_information'&&q.objectiveTopic?{topic:q.objectiveTopic,description:/zona de recolecci[oó]n/i.test(q.objectiveTopic)?'Inspeccionar la zona de recolección y registrar una señal verificable de quién intenta ocuparla.':/\b(?:terreno|zona|lugar|sector|entrada|pasillo|ruinas|edificio)\b/i.test(q.objectiveTopic)?'Examinar '+q.objectiveTopic+' y registrar un detalle verificable.':/\b(?:persona|alguien|guardia|mensajero|vecino)\b/i.test(q.objectiveTopic)?'Observar a '+q.objectiveTopic+' y registrar una conducta o dato comprobable.':'Investigar '+q.objectiveTopic+' y obtener un dato comprobable.'}:{}),status:'pending' as const,...(['deliver_item','repair_item'].includes(q.objectiveType)?{targetItemId:q.requiredItemId??(q.objectiveType==='deliver_item'?'scrap':undefined)}:{}),...(q.targetX!==undefined&&o.kind==='clear_obstacle'?{targetX:q.targetX}:{}),...(q.targetY!==undefined&&o.kind==='clear_obstacle'?{targetY:q.targetY}:{})}));
 if(/zona de recolecci[oó]n/i.test(q.title+' '+q.description+' '+q.objective)){const o=q.objectives.find(o=>o.kind==='observe_information');const r=q.objectives.find(o=>o.kind==='report_to_giver');if(o)o.description='Inspeccionar las marcas del límite de la zona de recolección y buscar señales que permitan averiguar quién intenta ocuparla: huellas, estacas movidas o materiales retirados.';if(r)r.description='Volver con el solicitante e informar qué señales encontraste y qué indican.';}
 // Preserve evidence already recorded by older saves, but never infer success from a bare progress counter.
 if(q.evidence?.startsWith('actor:'))completeObjective(q,'observe',q.evidence,0);
 if(q.evidence?.startsWith('collected:'))completeObjective(q,'collect',q.evidence,0);
 if(q.evidence?.startsWith('cleared:'))completeObjective(q,'clear',q.evidence,0);
 if(q.evidence?.startsWith('delivered:'))completeObjective(q,'deliver',q.evidence,0);
 return q.objectives;
}
function completeObjective(q:NpcQuest,id:string,evidence:string,worldMinute:number,eventId?:string):boolean{
 const objective=q.objectives?.find(o=>o.id===id);if(!objective||objective.status==='completed')return false;
 objective.status='completed';objective.completedByEventId=eventId??evidence;objective.completedAtWorldMinute=worldMinute;return true;
}
export function applyQuestEvent(s:WorldState,event:QuestEvent):string[]{
 const completed:string[]=[];const worldMinute=event.worldMinute;
 for(const q of s.quests){if(q.status!=='accepted')continue;const objectives=ensureQuestObjectives(q);let changed=false;
  for(const o of objectives){if(o.status==='completed')continue;let valid=false;
   switch(o.kind){
    case 'observe_information': {const words=(value:string):string[]=>value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9ñ]{4,}/g)??[];const topicWords=words(o.topic??'');const evidenceWords=words(event.topicText??event.evidence);const relevantEvidence=!topicWords.length||topicWords.some(word=>evidenceWords.includes(word));const observedActor=event.targetId?s.actors.find(actor=>actor.id===event.targetId):undefined;const observedActorWords=words(observedActor?.name??'');const personTopic=/\b(?:persona|alguien|guardia|mensajero|vecino|viajero|comerciante|medico|medica|soldado)\b/i.test(o.topic??'');const relevantActor=!topicWords.length||personTopic||topicWords.some(word=>observedActorWords.includes(word));valid=event.actorId==='player'&&((event.kind==='actor_observed'&&!!event.targetId&&event.targetId!==q.giverId&&relevantActor)||(event.kind==='evidence_found'&&!!event.topicText&&relevantEvidence));break;}
    case 'collect_resource': valid=event.kind==='resource_collected'&&event.actorId==='player'&&event.itemId===(o.targetItemId??'scrap')&&(event.quantity??0)>=(o.quantity??1);break;
    case 'deliver_item': valid=event.kind==='item_delivered'&&event.actorId==='player'&&event.targetId===q.giverId&&event.itemId===(o.targetItemId??q.requiredItemId??'scrap')&&(event.quantity??0)>=(o.quantity??1);break;
    case 'clear_obstacle': valid=event.kind==='obstacle_cleared'&&event.actorId==='player'&&(o.targetX===undefined||o.targetX===event.x)&&(o.targetY===undefined||o.targetY===event.y);break;
    case 'repair_item': valid=event.kind==='item_repaired'&&event.actorId==='player'&&(!o.targetItemId||event.itemId===o.targetItemId)&&(event.integrity??0)>=80&&event.functional===true;break;
    case 'report_to_giver': valid=event.kind==='report_given'&&event.actorId==='player'&&event.targetId===q.giverId&&objectives.filter(x=>x.id!=='report').every(x=>x.status==='completed');break;
   }
   if(valid){completeObjective(q,o.id,event.evidence,worldMinute,event.id);changed=true;}
  }
  if(changed){q.progress=objectives.filter(o=>o.status==='completed').length;q.evidence=event.evidence;}
  if(objectives.length>0&&objectives.every(o=>o.status==='completed')){q.status='completed';completed.push(q.id);}
 }
 return completed;
}
export function objectiveReadiness(q:NpcQuest):{total:number;completed:number;ready:boolean;pending:string[]}{const objectives=ensureQuestObjectives(q);const pending=objectives.filter(o=>o.required&&o.status!=='completed').map(o=>o.description);return {total:objectives.length,completed:objectives.filter(o=>o.status==='completed').length,ready:pending.length===0,pending};}
