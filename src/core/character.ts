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
 return {age,origin:choose(r,origins),upbringing:choose(r,upbringings),education:choose(r,educations),history:chosenEvents.map(e=>({age:r.int(8,Math.max(9,age-1)),...e})),traumas:trauma?[{...trauma,intensity:r.int(25,90),active:false}]:[],cognition:{iq:r.int(78,143),memory:score(r),reasoning:score(r),socialInference:score(r),learning:score(r),practicalJudgment:score(r),stressTolerance:score(r)},traits,skills,strengths,limitations,needs:[...needPool].sort(()=>r.next()-.5).slice(0,3),values:[...valuePool].sort(()=>r.next()-.5).slice(0,2),fears:[...fearPool].sort(()=>r.next()-.5).slice(0,2),knowledge,currentMood:choose(r,['cansancio contenido','alerta','irritación','esperanza cautelosa','preocupación','apatía funcional']),copingStyle:trauma?.copingStyle??choose(r,['aislarse y resolverlo a solas','hablar con alguien de confianza','convertir la ansiedad en trabajo','hacer bromas para cambiar de tema','planificar para recuperar control'])};
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
export function makeLifeQuest(actor:Actor,tick:number):NpcQuest{return {id:'quest-'+actor.id+'-'+actor.lifeMission.id,giverId:actor.id,missionId:actor.lifeMission.id,title:actor.lifeMission.title,description:actor.lifeMission.description,objective:actor.lifeMission.steps[Math.min(actor.lifeMission.progress,actor.lifeMission.steps.length-1)]??actor.lifeMission.description,requirements:[...actor.lifeMission.needs],reward:'la recompensa depende de lo que el NPC pueda ofrecer y de cómo termine el asunto',status:'offered',offeredAtTick:tick,acceptedAtTick:null,deadlineTick:tick+120+actor.lifeMission.needs.length*24};}
export function questOfferFor(s:WorldState,actor:Actor):NpcQuest|null{
 const decision=canOfferLifeQuest(actor);if(!decision.eligible)return null;
 if(s.quests.some(q=>q.giverId===actor.id&&q.missionId===actor.lifeMission.id&&q.status!=='declined'&&q.status!=='failed'))return null;
 return makeLifeQuest(actor,s.tick);
}
