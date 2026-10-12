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

test('migra guardados v1 asignando un plazo a los encargos antiguos sin romper partidas',()=>{
 const world=generateWorld(4402),giver=world.actors[0]!;
 world.quests.push({id:'old-quest',giverId:giver.id,missionId:giver.lifeMission.id,title:'Encargo antiguo',description:'Prueba',objective:'Volver',requirements:['medicina'],reward:'nada',status:'accepted',offeredAtTick:1,acceptedAtTick:2,deadlineTick:100});
 const old=JSON.parse(encodeSave(world)) as {version:number;state:typeof world};
 old.version=1;delete (old.state.quests[0] as Partial<typeof old.state.quests[number]>).deadlineTick;
 delete (old.state.quests[0] as Partial<typeof old.state.quests[number]>).objectiveType;
 delete (old.state.quests[0] as Partial<typeof old.state.quests[number]>).progress;
 delete (old.state.quests[0] as Partial<typeof old.state.quests[number]>).evidence;
 const loaded=decodeSave(JSON.stringify(old));
 assert.ok(loaded.quests[0]!.deadlineTick>loaded.tick);
 assert.equal(loaded.quests[0]!.status,'accepted');
 assert.equal(loaded.quests[0]!.objectiveType,'investigate_and_report');
 assert.equal(loaded.quests[0]!.progress,0);
 assert.equal(loaded.quests[0]!.evidence,null);
 assert.equal(loaded.quests[0]!.requiredItemId,null);
});
