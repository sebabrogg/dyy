import test from 'node:test';
import assert from 'node:assert/strict';
import {relateConversationToQuests} from '../src/core/quest-guide.ts';
import {generateWorld} from '../src/world/generate.ts';

test('la guía vincula una pista concreta con un encargo aceptado y conserva su origen',()=>{
 const state=generateWorld(123);const giver=state.actors[0]!;const other=state.actors[1]!;
 state.quests.push({id:'quest-generator',giverId:giver.id,missionId:'mission-generator',title:'Conseguir piezas para el generador',description:'El generador del refugio necesita repuestos.',objective:'Encontrar piezas y volver a informar.',requirements:['piezas','generador'],reward:'confianza',status:'accepted',offeredAtTick:0,acceptedAtTick:0,deadlineTick:100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 const result=relateConversationToQuests(state,other.id,'¿Sabes algo del generador?','Vi piezas cerca de la clínica abandonada.');
 assert.equal(result.length,1);assert.equal(result[0]!.guideEntries?.[0]?.kind,'lead');assert.equal(result[0]!.guideEntries?.[0]?.sourceActorId,other.id);assert.match(result[0]!.guideEntries?.[0]?.summary??'',/clínica/i);
});
test('la guía no atribuye una charla irrelevante a un encargo',()=>{
 const state=generateWorld(456);const giver=state.actors[0]!;
 state.quests.push({id:'quest-generator',giverId:giver.id,missionId:'mission-generator',title:'Conseguir piezas para el generador',description:'Repuestos para el generador.',objective:'Encontrar piezas.',requirements:['piezas'],reward:'confianza',status:'accepted',offeredAtTick:0,acceptedAtTick:0,deadlineTick:100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 assert.deepEqual(relateConversationToQuests(state,giver.id,'hola, ¿cómo estás?','Estoy cansado, el día ha sido largo.'),[]);
});
