import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {recordSocialEvent} from '../src/core/social.ts';
import {decodeSave,encodeSave,SAVE_VERSION} from '../src/core/save.ts';

test('guardar y cargar conserva recuerdos, relaciones, conocimiento, misiones y reloj',()=>{
 const world=generateWorld(4401),npc=world.actors[0]!;
 recordSocialEvent(npc,{kind:'conversation',targetId:'player',tick:world.tick,severity:12,description:'El jugador prometió volver',interpretation:'promesa'});
 npc.social.relationships.player!.resentment=37;
 npc.social.knowledge.push({eventId:'rumor-1',subjectId:'npc-other',targetId:'player',kind:'help',tick:4,confidence:61,source:'rumor',interpretation:'dicen que ayudó a alguien',hops:1});
 const loaded=decodeSave(encodeSave(world,'2026-10-12T12:00:00.000Z'));
 assert.equal(loaded.seed,world.seed);
 assert.deepEqual(loaded.actors[0]!.social.memories,npc.social.memories);
 assert.deepEqual(loaded.actors[0]!.social.relationships,npc.social.relationships);
 assert.deepEqual(loaded.actors[0]!.social.knowledge,npc.social.knowledge);
 assert.deepEqual(loaded.quests,world.quests);
 assert.equal(loaded.tick,world.tick);
});

test('rechaza guardados corruptos o de una versión desconocida',()=>{
 assert.throws(()=>decodeSave('{'),/JSON|position|property/i);
 assert.throws(()=>decodeSave(JSON.stringify({version:SAVE_VERSION+1,state:{}})),/Versión/);
 assert.throws(()=>decodeSave(JSON.stringify({version:SAVE_VERSION,state:{seed:1}})),/estructura/);
});
