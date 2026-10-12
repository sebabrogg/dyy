import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {canOfferLifeQuest} from '../src/core/character.ts';
import {inspect,selectActor,talk} from '../src/core/engine.ts';
import {buildDialogueContext} from '../src/ai/local-dialogue.ts';

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
  const ivo=s.actors.find(a=>a.name==='Ivo Salcedo')!;
  assert.equal(canOfferLifeQuest(ivo).eligible,true);
});

test('un NPC elegible puede ofrecer un encargo y el jugador aceptarlo explícitamente',()=>{
  const s=generateWorld(89),npc=s.actors.find(a=>a.name==='Ivo Salcedo')!;
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
  const s=generateWorld(),npc=s.actors.find(a=>a.name==='Ivo Salcedo')!;
  s.player.x=npc.x+1;s.player.y=npc.y;
  selectActor(s,npc.id);
  talk(s,'te ayudo con eso?');
  assert.equal(s.quests.length,1);
  assert.equal(s.quests[0]!.giverId,npc.id);
  assert.equal(s.quests[0]!.status,'offered');
  assert.ok(s.log.some(entry=>entry.text.includes('te propone un encargo')));
});

test('el recuerdo de una conversación vuelve al contexto individual del NPC',()=>{ const s=generateWorld(991),npc=s.actors.find(a=>a.name==='Ivo Salcedo')!; s.player.x=npc.x+1;s.player.y=npc.y;selectActor(s,npc.id);talk(s,'Te ayudo con eso');const memory=npc.social.memories.find(m=>m.targetId==='player'&&m.kind==='conversation');assert.ok(memory);assert.match(memory!.description,/Te ayudo con eso/);const context=buildDialogueContext(npc,'¿Y entonces?','');assert.ok(context.memories.some(m=>m.includes('Te ayudo con eso')));});

test('el contexto de diálogo conserva las siete dimensiones de la relación',()=>{
  const s=generateWorld(992),npc=s.actors[0]!;
  npc.social.relationships.player={affection:31,trust:42,respect:53,resentment:64,fear:75,debt:86,hostility:97};
  const context=buildDialogueContext(npc,'hola','');
  for(const dimension of ['confianza 42/100','hostilidad 97/100','resentimiento 64/100','miedo 75/100','respeto 53/100','afecto 31/100','deuda 86/100']) assert.ok(context.relationship.includes(dimension),dimension);
});
