import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {canOfferLifeQuest,makeLifeQuest,questOfferFor} from '../src/core/character.ts';
import {ensureQuestObjectives} from '../src/core/quest-objectives.ts';
import {inspect,selectActor,talk} from '../src/core/engine.ts';
import {buildDialogueContext} from '../src/ai/local-dialogue.ts';
import {asksForIdentity,revealsIdentity} from '../src/core/identity.ts';
import {resolveAiProvider} from '../src/ai/local-dialogue.ts';

test('cada NPC recibe biografía, trauma, cognición, matices de personalidad y misión reproducibles',()=>{
  const a=generateWorld(1776),b=generateWorld(1776),c=generateWorld(1777);
  for(let i=0;i<a.actors.length;i++){
    const npc=a.actors[i]!,same=b.actors[i]!;
    assert.deepEqual(npc.mind,same.mind);
    assert.deepEqual(npc.lifeMission,same.lifeMission);
    assert.ok(npc.mind.cognition.iq>=78&&npc.mind.cognition.iq<=143);
    assert.ok(Object.keys(npc.mind.traits).length>=15);
    assert.ok(npc.mind.history.length>=1);
    assert.ok(npc.mind.knowledge.length>=3);
    assert.ok(npc.lifeMission.steps.length>=3);
  }
  assert.notDeepEqual(a.actors[0]!.mind,c.actors[0]!.mind);
});

test('no ofrece una misión a un jugador que no le gusta ni le resulta útil',()=>{
  const s=generateWorld(88),npc=s.actors[0]!;
  const result=canOfferLifeQuest(npc);
  assert.equal(result.eligible,false);
  npc.social.relationships.player!.affection=80;
  npc.social.relationships.player!.trust=55;
  assert.equal(canOfferLifeQuest(npc).eligible,true);
  npc.social.relationships.player!.hostility=85;
  assert.equal(canOfferLifeQuest(npc).eligible,false);
});

test('la partida inicial incluye al menos un NPC que te considera útil por su confianza previa',()=>{
  const s=generateWorld();
  const eligible=s.actors.find(a=>canOfferLifeQuest(a).eligible);
  assert.ok(eligible,'la población procedural incluye a alguien dispuesto a confiar una tarea');
});

test('un NPC elegible puede ofrecer un encargo y el jugador aceptarlo explícitamente',()=>{
  const s=generateWorld(89),npc=s.actors.find(a=>canOfferLifeQuest(a).eligible)!;
  s.player.x=npc.x+1;s.player.y=npc.y;
  npc.social.relationships.player!.affection=80;
  npc.social.relationships.player!.trust=70;
  selectActor(s,npc.id);
  talk(s,'¿Tenés algún encargo?');
  assert.equal(s.quests.length,1);
  assert.equal(s.quests[0]!.status,'offered');
  talk(s,'acepto');
  assert.equal(s.quests[0]!.status,'accepted');
  assert.equal(s.quests[0]!.acceptedAtTick!==null,true);
  assert.ok(s.quests[0]!.deadlineTick>s.tick);
});


test('examinar un NPC solo revela señales observables y nunca su biografía interna',()=>{
  const s=generateWorld(991),npc=s.actors[0]!;
  s.player.x=npc.x;s.player.y=npc.y;s.selectedActorId=npc.id;s.selectedTile={x:npc.x,y:npc.y};
  inspect(s);
  const output=s.log.map(e=>e.text).join('\n');
  assert.doesNotMatch(output,/IQ|misión vital|trauma|historia:|conocimientos:|fortalezas:|limitaciones:|años|razonamiento|personalidad \(/i);
});


test('una oferta directa de ayuda como «te ayudo con eso» activa el sistema de encargos',()=>{
  const s=generateWorld(),npc=s.actors.find(a=>canOfferLifeQuest(a).eligible)!;
  s.player.x=npc.x+1;s.player.y=npc.y;
  selectActor(s,npc.id);
  talk(s,'te ayudo con eso?');
  assert.equal(s.quests.length,1);
  assert.equal(s.quests[0]!.giverId,npc.id);
  assert.equal(s.quests[0]!.status,'offered');
  assert.ok(s.log.some(entry=>entry.text.includes('te propone un encargo')));
});

test('el recuerdo de una conversación vuelve al contexto individual del NPC',()=>{ const s=generateWorld(991),npc=s.actors.find(a=>canOfferLifeQuest(a).eligible)!; s.player.x=npc.x+1;s.player.y=npc.y;selectActor(s,npc.id);talk(s,'Te ayudo con eso');const memory=npc.social.memories.find(m=>m.targetId==='player'&&m.kind==='conversation');assert.ok(memory);assert.match(memory!.description,/Te ayudo con eso/);const context=buildDialogueContext(npc,'¿Y entonces?','');assert.ok(context.memories.some(m=>m.includes('Te ayudo con eso')));});

test('el contexto de diálogo conserva las siete dimensiones de la relación',()=>{
  const s=generateWorld(992),npc=s.actors[0]!;
  npc.social.relationships.player={affection:31,trust:42,respect:53,resentment:64,fear:75,debt:86,hostility:97};
  const context=buildDialogueContext(npc,'hola','');
  for(const dimension of ['confianza 42/100','hostilidad 97/100','resentimiento 64/100','miedo 75/100','respeto 53/100','afecto 31/100','deuda 86/100']) assert.ok(context.relationship.includes(dimension),dimension);
});

test('una misión personal puede generar el siguiente encargo tras completar el anterior',()=>{
 const s=generateWorld(906),npc=s.actors[0]!;
 npc.social.relationships.player!.respect=80;
 npc.lifeMission.progress=1;
 s.quests.push({id:'quest-old',giverId:npc.id,missionId:npc.lifeMission.id,title:npc.lifeMission.title,description:'Anterior',objective:'Investigar',requirements:[],reward:'Nada',status:'completed',offeredAtTick:0,acceptedAtTick:0,deadlineTick:100,objectiveType:'investigate_and_report',progress:1,evidence:'tile:1,1:road'});
 const next=questOfferFor(s,npc);
 assert.ok(next);
 assert.notEqual(next.id,'quest-old');
 assert.match(next.objective,/Investiga|Recupera|Entrégame|Despeja/);
 assert.match(next.description,/Primer paso/);
});

test('el tipo de objetivo depende del problema real y no del número de paso',()=>{
 const s=generateWorld(907),npc=s.actors[0]!;
 npc.lifeMission.title='Reparar el generador del refugio';
 npc.lifeMission.description='El generador del refugio está averiado y no mantiene la corriente.';
 npc.lifeMission.steps=['reunir información','conseguir lo que falta','resolver el obstáculo principal','decidir qué sacrificar para terminar'];
 npc.lifeMission.progress=0;
 const repair=makeLifeQuest(npc,0);
 assert.equal(repair.objectiveType,'repair_item');
 assert.match(repair.objective,/repar/i);
 npc.lifeMission.title='Reunir chatarra para reforzar la entrada';
 npc.lifeMission.description='Hace falta recoger chatarra para reforzar la entrada del refugio.';
 npc.lifeMission.progress=0;
 assert.equal(makeLifeQuest(npc,0).objectiveType,'collect_scrap');
});

test('el contexto de un NPC puede incluir su entorno observado sin convertirlo en conocimiento omnisciente',()=>{
  const s=generateWorld(993),npc=s.actors[0]!;
  const context=buildDialogueContext(npc,'¿Qué estás haciendo?','','terreno inmediato scrap; una persona no identificada a 2 m');
  assert.match(context.observedSurroundings,/terreno inmediato scrap/);
  assert.match(context.observedSurroundings,/persona no identificada/);
  assert.ok(context.actorName);
});

test('la partida empieza con un conocimiento parcial de identidades, no con amnesia total',()=>{const s=generateWorld(3001);assert.ok(s.actors.slice(0,3).every(a=>a.knownToPlayer));assert.ok(s.actors.slice(3).every(a=>!a.knownToPlayer));});


test('preguntar la identidad no revela a un NPC hasta que la respuesta incluye su nombre real',()=>{
  assert.equal(asksForIdentity('¿Quién sos?'),true);
  assert.equal(asksForIdentity('hola, qué hacés'),false);
  assert.equal(revealsIdentity('¿Quién sos?','Soy yo, ¿qué querés?', 'Mara Venn'),false);
  assert.equal(revealsIdentity('¿Cómo te llamás?','Me llamo Mara Venn.', 'Mara Venn'),true);
  assert.equal(revealsIdentity('¿Quién sos?','Mara Venn, la guardia del distrito.', 'Mara Venn'),true);
  assert.equal(revealsIdentity('¿Quién sos?','Me llamo Ivo Salcedo.', 'Mara Venn'),false);
});

test('OpenCode es el proveedor permanente independientemente de la URL',()=>{assert.equal(resolveAiProvider(''), 'opencode');assert.equal(resolveAiProvider('?ai=opencode'),'opencode');assert.equal(resolveAiProvider('?ai=ollama'),'opencode');assert.equal(resolveAiProvider('?ai=unknown'),'opencode');});

test('la ficha procedural incluye contradicciones, motivaciones y una voz propia que alimentan el diálogo',()=>{const a=generateWorld(401),b=generateWorld(402);const x=a.actors[0]!,y=b.actors[0]!;assert.ok(x.mind.motivations);assert.equal(Object.keys(x.mind.motivations!).length,8);assert.ok(x.mind.communication);assert.ok(x.mind.contradictions!.length>0);assert.ok(x.mind.defenseMechanisms!.length>0);assert.ok(x.mind.privateGoal);assert.notDeepEqual(x.mind,y.mind);const context=buildDialogueContext(x,'hola','');assert.match(context.personality,/Contradicciones internas:/);assert.match(context.personality,/Motivaciones prioritarias:/);});


test('un encargo sobre una zona disputada propone investigar la amenaza, no observar algo genérico',()=>{
 const s=generateWorld(912),npc=s.actors[0]!;
 npc.lifeMission.title='Evitar que le quiten su zona de recolección';
 npc.lifeMission.description='Quiere conservar el acceso a la zona de recolección que sostiene al refugio.';
 npc.lifeMission.steps=['reunir información','conseguir lo que falta','resolver el obstáculo principal','decidir qué sacrificar para terminar'];
 npc.lifeMission.needs=['información fiable','la cooperación de otra persona'];
 const q=makeLifeQuest(npc,0);
 assert.equal(q.objectiveType,'investigate_and_report');
 assert.match(q.title,/Averiguar quién amenaza la zona de recolección/);
 assert.equal(q.objectiveTopic,'zona de recolección');
 const objectives=ensureQuestObjectives(q);
 assert.match(objectives[0]!.description,/zona de recolección/);
 assert.match(objectives[0]!.description,/quién intenta ocuparla/);
 assert.match(objectives[1]!.description,/Comunicar|informar/);
});
