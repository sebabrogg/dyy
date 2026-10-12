import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {waitTurn} from '../src/core/engine.ts';

test('un encargo aceptado fracasa si muere quien lo ofreció y el fallo queda registrado',()=>{
 const s=generateWorld(901),giver=s.actors[0]!;
 const relation=giver.social.relationships.player!;
 relation.trust=50;relation.respect=40;relation.resentment=10;
 s.quests.push({id:'quest-test',giverId:giver.id,missionId:giver.lifeMission.id,title:'Encontrar suministros',description:'Recuperar suministros',objective:'Encontrar suministros',requirements:[],reward:'Información',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick});
 giver.alive=false;
 waitTurn(s);
 assert.equal(s.quests[0]!.status,'failed');
 assert.ok(s.log.some(entry=>entry.text.includes('ha fracasado')&&entry.text.includes('ha muerto')));
 assert.equal(relation.trust,42);
 assert.equal(relation.respect,35);
 assert.equal(relation.resentment,18);
 waitTurn(s);
 assert.equal(s.log.filter(entry=>entry.text.includes('ha fracasado')).length,1);
});

test('un encargo ofrecido pero no aceptado no fracasa automáticamente por la muerte del NPC',()=>{
 const s=generateWorld(902),giver=s.actors[0]!;
 s.quests.push({id:'quest-offered',giverId:giver.id,missionId:giver.lifeMission.id,title:'Un encargo',description:'Descripción',objective:'Objetivo',requirements:[],reward:'Nada',status:'offered',offeredAtTick:s.tick,acceptedAtTick:null});
 giver.alive=false;
 waitTurn(s);
 assert.equal(s.quests[0]!.status,'offered');
 assert.equal(s.log.some(entry=>entry.text.includes('ha fracasado')) ,false);
});
