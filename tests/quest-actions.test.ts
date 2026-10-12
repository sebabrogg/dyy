import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {interactWorld,selectActor,talk} from '../src/core/engine.ts';

function quest(s:any,type:'collect_scrap'|'deliver_item'|'clear_obstacle'){
 const giver=s.actors[0];giver.x=s.player.x+1;giver.y=s.player.y;
 const q={id:'quest-action-'+type,giverId:giver.id,missionId:giver.lifeMission.id,title:'Prueba de objetivo',description:'Prueba',objective:'Objetivo verificable',requirements:[],reward:'Nada',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick+100,objectiveType:type,progress:0,evidence:null,requiredItemId:type==='deliver_item'?'scrap':null};
 s.quests.push(q);return {giver,q};
}

test('recoger chatarra añade un recurso real y avanza el objetivo de materiales',()=>{
 const s=generateWorld(1001),{q}=quest(s,'collect_scrap');
 const tile=s.tiles.find((t:any)=>t.x===2&&t.y===2)!;tile.terrain='scrap';s.selectedTile={x:tile.x,y:tile.y};
 const before=s.player.inventory.find((i:any)=>i.id==='scrap')!.quantity;
 interactWorld(s);
 assert.equal(s.player.inventory.find((i:any)=>i.id==='scrap')!.quantity,before+1);
 assert.equal(tile.terrain,'floor');assert.equal(q.progress,1);assert.match(q.evidence,/^collected:scrap:/);
});

test('entregar chatarra consume el objeto y completa el encargo del NPC correcto',()=>{
 const s=generateWorld(1002),{giver,q}=quest(s,'deliver_item');
 const item=s.player.inventory.find((i:any)=>i.id==='scrap')!;const before=item.quantity;
 selectActor(s,giver.id);talk(s,'Te entrego la chatarra');
 assert.equal(item.quantity,before-1);assert.equal(q.status,'completed');assert.equal(q.evidence,'delivered:scrap:'+giver.id);
});

test('despejar escombros modifica el terreno y no concede chatarra',()=>{
 const s=generateWorld(1003),{q}=quest(s,'clear_obstacle');
 const tile=s.tiles.find((t:any)=>t.x===3&&t.y===3)!;tile.terrain='scrap';s.selectedTile={x:tile.x,y:tile.y};
 const before=s.player.inventory.find((i:any)=>i.id==='scrap')!.quantity;
 interactWorld(s);
 assert.equal(tile.terrain,'floor');assert.equal(q.progress,1);assert.match(q.evidence,/^cleared:/);
 assert.equal(s.player.inventory.find((i:any)=>i.id==='scrap')!.quantity,before);
});

test('no permite entregar materiales que ya no están en el inventario',()=>{
 const s=generateWorld(1004),{giver,q}=quest(s,'deliver_item');
 s.player.inventory.find((i:any)=>i.id==='scrap')!.quantity=0;
 selectActor(s,giver.id);talk(s,'Te entrego la chatarra');
 assert.equal(q.status,'accepted');assert.equal(q.progress,0);
});

test('recoger un recurso no completa el encargo hasta volver e informar',()=>{
 const s=generateWorld(1005),{giver,q}=quest(s,'collect_scrap');
 const tile=s.tiles.find((t:any)=>t.x===4&&t.y===4)!;tile.terrain='scrap';s.selectedTile={x:tile.x,y:tile.y};
 interactWorld(s);assert.equal(q.status,'accepted');assert.equal(q.progress,1);
 selectActor(s,giver.id);talk(s,'Te cuento lo que vi');
 assert.equal(q.status,'completed');
});
