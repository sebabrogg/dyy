import test from 'node:test';
import assert from 'node:assert/strict';
import {registerQuestFromDialogue} from '../src/core/quest-offers.ts';
import {generateWorld} from '../src/world/generate.ts';

function setup(){const state=generateWorld(12345);const actor=state.actors.find(a=>a.alive)!;return {state,actor};}

test('registers an actionable implicit request as an offered quest with a human title',()=>{const {state,actor}=setup();const quest=registerQuestFromDialogue(state,actor.id,'Lo único que me sirve es que me avises si escuchás algo del agua, eso sí.');assert.ok(quest);assert.equal(quest.status,'offered');assert.equal(quest.title,'¿Alguien sabe sobre el agua?');assert.equal(state.quests.filter(q=>q.giverId===actor.id&&q.status==='offered').length,1);});
test('registers an explicit confirmation and does not duplicate the same request',()=>{const {state,actor}=setup();const first=registerQuestFromDialogue(state,actor.id,'Sí, es un encargo: fijate si escuchás algo del agua y avisame.');assert.ok(first);const second=registerQuestFromDialogue(state,actor.id,'Tenés razón, el encargo sigue en pie: avisame si escuchás algo del agua.');assert.equal(second?.id,first.id);assert.equal(state.quests.filter(q=>q.giverId===actor.id&&q.status==='offered').length,1);});
test('does not turn needs, denials, or vague chat into quests',()=>{const {state,actor}=setup();assert.equal(registerQuestFromDialogue(state,actor.id,'Tengo vacías las alacenas, no me sirve otra cosa.'),null);assert.equal(registerQuestFromDialogue(state,actor.id,'No tengo ningún encargo para ofrecer ahora.'),null);assert.equal(registerQuestFromDialogue(state,actor.id,'Estoy preocupado por el agua.'),null);});
test('keeps an unrelated request from duplicating an existing quest',()=>{const {state,actor}=setup();const first=registerQuestFromDialogue(state,actor.id,'Fijate si escuchás algo del agua y avisame.');assert.ok(first);const second=registerQuestFromDialogue(state,actor.id,'Sí, es un encargo, fijate si escuchás algo del agua y avisame.');assert.equal(second?.id,first.id);});
