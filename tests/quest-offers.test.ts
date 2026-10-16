import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {registerQuestFromDialogue} from '../src/core/quest-offers.ts';

test('una propuesta concreta en voseo crea un encargo visible',()=>{
  const state=generateWorld(42017);
  const npc=state.actors.find(actor=>actor.alive)!;
  const quest=registerQuestFromDialogue(state,npc.id,'Tengo uno, sí. El generador de la subestación pierde potencia y nadie sabe si es mantenimiento, pieza mala o mano ajena. Bajá, revisá, y volvé con lo que encuentres — sin heroicidades, eso sí.');
  assert.ok(quest,'la propuesta concreta del NPC debe crear un encargo');
  assert.equal(quest.status,'offered');
  assert.match(quest.title,/generador|subestación|potencia|revis/i);
  assert.match(quest.description+' '+quest.objective,/generador|subestación|potencia/i);
});
