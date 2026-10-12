import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {canOfferLifeQuest} from '../src/core/character.ts';
import {inspect,selectActor,talk} from '../src/core/engine.ts';

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
});


test('examinar un NPC solo revela señales observables y nunca su biografía interna',()=>{
  const s=generateWorld(991),npc=s.actors[0]!;
  s.player.x=npc.x;s.player.y=npc.y;s.selectedActorId=npc.id;s.selectedTile={x:npc.x,y:npc.y};
  inspect(s);
  const output=s.log.map(e=>e.text).join('\n');
  assert.doesNotMatch(output,/IQ|misión vital|trauma|historia:|conocimientos:|fortalezas:|limitaciones:|años|razonamiento|personalidad \(/i);
});
