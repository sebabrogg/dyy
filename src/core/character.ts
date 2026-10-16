import {stream} from './rng.ts';
import type {Actor, LifeMission, NpcMind, NpcQuest, WorldState} from './types.ts';

const origins=['un bloque de viviendas de la UAC','un asentamiento móvil de Gruta','un distrito industrial de la EME','un refugio levantado tras los bombardeos','una colonia fronteriza'];
const upbringings=['creció cuidando de familiares que dependían de él','fue criado por una comunidad que compartía los recursos','pasó la infancia cambiando de hogar','creció bajo una disciplina rígida','tuvo una infancia relativamente estable hasta que empezó la guerra'];
const educations=['aprendió el oficio trabajando junto a alguien experimentado','recibió educación técnica incompleta','estudió en una escuela pública controlada por su facción','aprendió principalmente por su cuenta','recibió formación práctica y poca educación formal'];
const pastEvents=[
 {event:'perdió a una persona importante durante una evacuación',impact:'le cuesta aceptar separaciones repentinas',tags:['loss','separation']},
 {event:'fue traicionado por alguien de confianza',impact:'comprueba las intenciones antes de comprometerse',tags:['betrayal','trust']},
 {event:'tuvo que mantener a su familia durante una escasez',impact:'prioriza los recursos y las obligaciones cercanas',tags:['scarcity','family']},
 {event:'sobrevivió a un enfrentamiento entre facciones',impact:'evalúa las salidas y los riesgos antes de actuar',tags:['violence','danger']},
 {event:'vio cómo una autoridad castigaba a un inocente',impact:'desconfía de las justificaciones oficiales',tags:['authority','injustice']},
 {event:'fracasó al intentar salvar a alguien',impact:'puede sobrecompensar o evitar situaciones parecidas',tags:['guilt','failure']},
 {event:'fue acogido por desconocidos cuando no tenía nada',impact:'recuerda las deudas y los gestos de solidaridad',tags:['kindness','debt']}
];
const traumaEvents=[
 {event:'quedó atrapado durante un bombardeo',triggers:['explosiones','espacios cerrados','alarmas'],copingStyle:'controlar las salidas y mantener un plan de escape'},
 {event:'sufrió violencia bajo custodia',triggers:['uniformes','amenazas de autoridad','puertas bloqueadas'],copingStyle:'ocultar el miedo y vigilar a quien tiene poder'},
 {event:'perdió a alguien por falta de medicamentos',triggers:['hospitales saturados','escasez médica','personas enfermas'],copingStyle:'buscar recursos de reserva y actuar con urgencia'},
 {event:'fue abandonado durante una huida',triggers:['promesas vagas','grupos que se marchan','despedidas repentinas'],copingStyle:'evitar depender de una sola persona'},
 {event:'presenció la muerte de un compañero por una decisión impulsiva',triggers:['órdenes precipitadas','armas desenfundadas','planes sin salida'],copingStyle:'frenar la acción y exigir una alternativa'}
];
const knowledgePool=[
 {topic:'política',belief:'las facciones justifican sus abusos con discursos de seguridad',source:'experience' as const},
 {topic:'economía local',belief:'las medicinas y las baterías sirven como moneda de emergencia',source:'experience' as const},
 {topic:'historia',belief:'los relatos oficiales sobre el final de la guerra omiten hechos importantes',source:'education' as const},
 {topic:'rumores',belief:'alguien de la zona está comprando identidades y registros',source:'rumor' as const},
 {topic:'seguridad',belief:'las rutas principales son más fáciles de vigilar que los pasajes de servicio',source:'experience' as const},
 {topic:'tecnología',belief:'algunos equipos Psico-Link conservan registros después de apagarse',source:'inference' as const},
 {topic:'sociedad',belief:'la gente suele proteger primero a quienes considera de los suyos',source:'experience' as const}
];
const skillNames=['negociación','mecánica','medicina','supervivencia','observación','sigilo','combate','investigación','primeros auxilios','logística','reparación','persuasión'];
const needPool=['comida segura','un lugar donde dormir','medicamentos','dinero o bienes de intercambio','protección para alguien cercano','información fiable','repuestos','reconocimiento','independencia'];
const valuePool=['lealtad','autonomía','justicia','seguridad','familia','conocimiento','libertad','orden','solidaridad','competencia'];
const fearPool=['perder a alguien cercano','quedar bajo control de una facción','volver a depender de un traidor','morir sin resolver un asunto pendiente','ser considerado inútil','perder el control bajo presión'];
const strengthPool=['mantiene la calma cuando hay un plan claro','recuerda detalles de conversaciones','sabe reparar o improvisar herramientas','lee bien los cambios de humor','aguanta condiciones físicas duras','conoce las rutinas de su barrio','convence sin levantar la voz','detecta riesgos antes de comprometerse'];
const limitPool=['le cuesta confiar en desconocidos','se precipita cuando se siente humillado','evita pedir ayuda incluso cuando la necesita','se bloquea cuando una situación recuerda su trauma','sobreestima su capacidad para controlar a otros','carece de fuerza o resistencia física','interpreta el desacuerdo como una falta de respeto','se distrae cuando tiene varias urgencias a la vez'];
const traitKeys=['openness','conscientiousness','extraversion','agreeableness','emotionalStability','empathy','impulsivity','pride','curiosity','paranoia','riskTolerance','loyalty','vengefulness','patience','needForApproval','selfReliance','cruelty','generosity'] as const;
function choose<T>(r:ReturnType<typeof stream>,xs:readonly T[]):T{return r.pick(xs)}
function score(r:ReturnType<typeof stream>):number{return r.int(8,92)}
export function generateNpcMind(seed:number,id:string,role:string,faction:string):NpcMind{
 const r=stream(seed,'npc.mind.'+id+'.'+faction),age=r.int(19,71),chosenEvents=[...pastEvents].sort(()=>r.next()-.5).slice(0,2),trauma=r.next()<.78?choose(r,traumaEvents):null;
 const traits=Object.fromEntries(traitKeys.map(k=>[k,score(r)])) as unknown as NpcMind['traits'];
 // Role competence is a bias, not a guarantee: a mechanic can still be bad at their own job.
 const roleSkill:Record<string,string>={'mecánico':'mecánica','sanitaria':'medicina','guardia de distrito':'observación','recolector':'supervivencia','mensajera':'sigilo','contratista':'combate','archivista':'investigación'};
 const skills=Object.fromEntries(skillNames.map(k=>[k,Math.max(0,Math.min(100,score(r)+(roleSkill[role]===k?18:0)))]));
 const strengths=[...strengthPool].sort(()=>r.next()-.5).slice(0,2),limitations=[...limitPool].sort(()=>r.next()-.5).slice(0,2);
 const knowledge=[...knowledgePool].sort(()=>r.next()-.5).slice(0,4).map(k=>({...k,confidence:r.int(25,95),verified:k.source==='experience'&&r.next()<.7}));
 const contradictions:string[]=[];
 if(traits.paranoia>62&&traits.needForApproval>58) contradictions.push('desconfía de los demás, pero necesita que lo acepten');
 if(traits.empathy>65&&traits.cruelty>55) contradictions.push('se preocupa por algunos y puede ser despiadado con otros');
 if(traits.selfReliance>65&&traits.loyalty>65) contradictions.push('quiere resolverlo todo a solas, pero no abandona a los suyos');
 if(traits.pride>65&&traits.generosity>65) contradictions.push('ayuda a otros, aunque le cuesta admitir sus errores');
 if(traits.riskTolerance>65&&traits.paranoia>60) contradictions.push('se expone a riesgos mientras sospecha de todo el mundo');
 if(!contradictions.length) contradictions.push(choose(r,['quiere independencia, pero teme quedarse sin apoyo','defiende sus principios, aunque hace excepciones por los suyos','desea cambiar de vida, pero protege las rutinas que conoce']));
 const motivations={security:score(r),belonging:score(r),autonomy:score(r),recognition:score(r),curiosity:score(r),revenge:score(r),care:score(r),purpose:score(r)};
 if(traits.paranoia>65) motivations.security=Math.min(100,motivations.security+12);
 if(traits.empathy>65) motivations.care=Math.min(100,motivations.care+12);
 if(traits.vengefulness>65) motivations.revenge=Math.min(100,motivations.revenge+15);
 if(traits.selfReliance>65) motivations.autonomy=Math.min(100,motivations.autonomy+10);
 const communication={directness:score(r),formality:score(r),verbosity:score(r),humor:score(r),disclosure:score(r),questionFrequency:score(r),conflictStyle:choose(r,['avoid','negotiate','confront','manipulate'] as const)};
 if(traits.extraversion>70) communication.verbosity=Math.max(communication.verbosity,55);
 if(traits.paranoia>70) communication.disclosure=Math.min(communication.disclosure,35);
 const defenseMechanisms=[choose(r,['racionaliza sus decisiones cuando siente culpa','evita conversaciones que podrían romper un vínculo','usa el humor para esquivar la incomodidad','se vuelve controlador cuando pierde seguridad','se distancia antes de que puedan rechazarlo','convierte el miedo en trabajo y actividad','minimiza sus propios errores'])];
 const selfImage=choose(r,['quiere que lo consideren competente','necesita parecer más fuerte de lo que se siente','se ve como alguien que cumple su palabra','cree que nadie conoce su verdadero esfuerzo','quiere pasar inadvertido y conservar su libertad']);
 const privateGoal=choose(r,['reunir recursos para abandonar el asentamiento','recuperar la confianza de alguien a quien falló','descubrir quién está desviando suministros','conseguir independencia sin dejar desprotegida a su gente','demostrar que una decisión pasada fue correcta','encontrar a una persona de su antigua vida','construir algo que sobreviva a la próxima crisis']);
 const secret=r.next()<.58?choose(r,['oculta una deuda que amenaza su posición','mintió sobre cómo consiguió algo importante','mantiene contacto con alguien de otra facción','abandonó a alguien durante una crisis y no se lo ha perdonado','sabe más sobre una avería de lo que admite']):'';
 return {age,origin:choose(r,origins),upbringing:choose(r,upbringings),education:choose(r,educations),history:chosenEvents.map(e=>({age:r.int(8,Math.max(9,age-1)),...e})),traumas:trauma?[{...trauma,intensity:r.int(25,90),active:false}]:[],cognition:{iq:r.int(78,143),memory:score(r),reasoning:score(r),socialInference:score(r),learning:score(r),practicalJudgment:score(r),stressTolerance:score(r)},traits,skills,strengths,limitations,needs:[...needPool].sort(()=>r.next()-.5).slice(0,3),values:[...valuePool].sort(()=>r.next()-.5).slice(0,2),fears:[...fearPool].sort(()=>r.next()-.5).slice(0,2),knowledge,currentMood:choose(r,['cansancio contenido','alerta','irritación','esperanza cautelosa','preocupación','apatía funcional']),copingStyle:trauma?.copingStyle??choose(r,['aislarse y resolverlo a solas','hablar con alguien de confianza','convertir la ansiedad en trabajo','hacer bromas para cambiar de tema','planificar para recuperar control']),motivations,communication,contradictions,defenseMechanisms,selfImage,privateGoal,secret};
}
export function generateLifeMission(seed:number,actor:Pick<Actor,'id'|'name'|'goal'|'personality'|'faction'>):LifeMission{
 const r=stream(seed,'npc.life-mission.'+actor.id),goal=actor.goal;
 const obstacles=['carece de recursos suficientes','una persona con poder bloquea su avance','no tiene toda la información necesaria','sus obligaciones compiten con este objetivo','conseguirlo puede poner en peligro a alguien cercano'];
 const needs=['información fiable','materiales o repuestos','la cooperación de otra persona','tiempo sin interrupciones','acceso a un lugar restringido'];
 return {id:'life-'+actor.id,title:goal.charAt(0).toLocaleUpperCase('es')+goal.slice(1),description:actor.name+' intenta '+goal+'. Este objetivo sigue existiendo aunque el jugador no intervenga.',motivation:choose(r,['proteger a alguien cercano','reparar un error del pasado','ganar autonomía','demostrar que es capaz','evitar que la comunidad pierda algo importante','saldar una deuda moral']),steps:['reunir información','conseguir lo que falta','resolver el obstáculo principal','decidir qué sacrificar para terminar'],progress:0,status:'active',needs:[choose(r,needs),choose(r,needs)],obstacle:choose(r,obstacles),deadlineTick:r.next()<.45?r.int(60,500):null,secret:r.next()<.35?choose(r,['oculta una deuda','no cuenta toda la verdad sobre el objetivo','protege a alguien implicado','considera abandonar si el coste aumenta']):null};
}
export function canOfferLifeQuest(actor:Actor):{eligible:boolean;reason:string;utility:number;liking:number}{
 const rel=actor.social.relationships.player??{affection:0,trust:0,respect:0,resentment:0,fear:0,debt:0,hostility:0};
 const helped=actor.social.memories.some(m=>m.targetId==='player'&&(m.kind==='help'||m.kind==='saved'))||actor.social.knowledge.some(k=>k.subjectId==='player'&&(k.kind==='help'||k.kind==='saved'));
 const utility=Math.max(rel.respect,rel.debt*0.8,helped?65:0,actor.disposition==='helpful'&&rel.trust>=45?45:0),liking=rel.affection*.55+rel.trust*.45;
 if(!actor.alive||actor.lifeMission.status!=='active')return {eligible:false,reason:'no tiene un objetivo que pueda ofrecer ahora',utility,liking};
 if(rel.hostility>=60||rel.resentment>=70)return {eligible:false,reason:'todavía guarda demasiado resentimiento',utility,liking};
 if(utility>=42)return {eligible:true,reason:'considera que puedes ser útil',utility,liking};
 if(liking>=43&&rel.trust>=25)return {eligible:true,reason:'se siente suficientemente cómodo contigo',utility,liking};
 return {eligible:false,reason:'todavía no confía en ti ni ve una utilidad clara',utility,liking};
}
export function makeLifeQuest(actor:Actor,tick:number):NpcQuest{
 const mission=actor.lifeMission,step=mission.steps[Math.min(mission.progress,mission.steps.length-1)]??mission.description;
 const context=(mission.title+' '+mission.description+' '+step+' '+mission.obstacle+' '+mission.needs.join(' ')).toLocaleLowerCase('es');
 const territory=/zona de recolecci[oó]n|territorio|disputa por el terreno|quitarle.{0,24}(?:zona|terreno|recursos)/i.test(context);
 // Pick an objective that matches the current stage and the actual world mechanics, not just its index.
 let objectiveType:NpcQuest['objectiveType']='investigate_and_report';
 if(!territory&&/reparar|aver[ií]a|generador|motor|cableado|m[aá]quina/i.test(context))objectiveType='repair_item';
 else if(!territory&&/despejar|retirar.{0,20}(?:escombro|obst[aá]culo)|bloquea el paso/i.test(context))objectiveType='clear_obstacle';
 else if(!territory&&/entregar|llevar.{0,20}(?:pieza|repuesto|recurso)|necesita.{0,20}(?:pieza|repuesto)/i.test(context))objectiveType='deliver_item';
 else if(!territory&&/reunir recursos|reunir chatarra|conseguir materiales|recoger chatarra|falta chatarra/i.test(context))objectiveType='collect_scrap';
 const topic=territory?'zona de recolección':/generador/i.test(context)?'generador':/bombeo|bomba/i.test(context)?'sistema de bombeo':/antena|radio/i.test(context)?'radio o antena':undefined;
 const title=territory?'Averiguar quién amenaza la zona de recolección':objectiveType==='repair_item'?'Encontrar y reparar la avería':objectiveType==='clear_obstacle'?'Despejar el obstáculo':objectiveType==='deliver_item'?'Conseguir y entregar el repuesto':objectiveType==='collect_scrap'?'Reunir los materiales que faltan':mission.title;
 const objective=territory?'Inspeccionar la zona de recolección y registrar una señal verificable de quién intenta ocuparla.':objectiveType==='repair_item'?'Examinar el equipo averiado y repararlo hasta que vuelva a funcionar.':objectiveType==='clear_obstacle'?'Retirar el obstáculo que bloquea el paso.':objectiveType==='deliver_item'?'Entregar el repuesto solicitado al NPC.':objectiveType==='collect_scrap'?'Recoger chatarra real del escenario y llevarla al solicitante.':'Investigar el problema concreto descrito por el solicitante y volver con un dato verificable.';
 const questDescription=territory?actor.name+' depende de esta zona para conseguir comida y materiales. En los últimos días alguien ha movido las marcas del límite y han aparecido huellas cerca de los puntos de recolección. Si pierde el terreno, la comunidad perderá una fuente importante de suministros. No está claro quién lo hace ni si busca robar recursos o expulsar a los recolectores. Primer paso: inspeccionar las marcas y el terreno para encontrar señales concretas.':mission.description+' Primer paso: '+step+'.';
 return {id:'quest-'+actor.id+'-'+mission.id+'-'+mission.progress,giverId:actor.id,missionId:mission.id,title,description:questDescription,objective,requirements:[...mission.needs],reward:'la recompensa depende de lo que el NPC pueda ofrecer y de cómo termine el asunto',status:'offered',offeredAtTick:tick,acceptedAtTick:null,deadlineTick:tick+120+mission.needs.length*24,objectiveType,progress:0,evidence:null,requiredItemId:objectiveType==='deliver_item'?'scrap':null,...(topic?{objectiveTopic:topic}:{})};
}
export function questOfferFor(s:WorldState,actor:Actor):NpcQuest|null{
 const decision=canOfferLifeQuest(actor);if(!decision.eligible)return null;
 if(s.quests.some(q=>q.giverId===actor.id&&q.missionId===actor.lifeMission.id&&(q.status==='offered'||q.status==='accepted')))return null;
 return makeLifeQuest(actor,s.tick);
}
