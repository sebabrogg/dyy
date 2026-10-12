import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {giveInventoryItemToSelectedActor,interactWorld,talk} from '../src/core/engine.ts';

test('el mismo seed reproduce el mapa y las personas',()=>{const a=generateWorld(404),b=generateWorld(404);assert.deepEqual(a.tiles,b.tiles);assert.deepEqual(a.actors.map(v=>[v.name,v.personality,v.goal,v.x,v.y]),b.actors.map(v=>[v.name,v.personality,v.goal,v.x,v.y]));});
test('una partida nueva cambia dimensiones, lugares y personajes según su seed',()=>{const worlds=[11,22,33,44,55,66,77,88].map(seed=>generateWorld(seed));assert.ok(worlds.some(w=>w.width!==worlds[0]!.width||w.height!==worlds[0]!.height));assert.ok(worlds.some(w=>w.actors.map(a=>a.name).join('|')!==worlds[0]!.actors.map(a=>a.name).join('|')));assert.ok(worlds.some(w=>w.tiles.map(t=>t.terrain).join('|')!==worlds[0]!.tiles.map(t=>t.terrain).join('|')));});
test('los NPCs generados tienen identidad propia, misión y conocimiento parcial',()=>{const w=generateWorld(904);assert.ok(w.actors.length>=8);assert.ok(w.actors.every(a=>a.mind&&a.lifeMission&&a.lifeMission.title!==undefined));assert.equal(new Set(w.actors.map(a=>a.name)).size,w.actors.length);assert.ok(w.actors.some(a=>a.knownToPlayer)&&w.actors.some(a=>!a.knownToPlayer));});
test('las puertas generadas conectan suelo exterior con un interior transitable',()=>{
 const w=generateWorld(1905),byPos=new Map(w.tiles.map(t=>[`${t.x},${t.y}`,t]));
 const walkable=new Set(['floor','road','scrap','grass']);
 assert.ok(w.locations!.length>0,'el mundo debe generar entradas');
 for(const place of w.locations!){
  const door=byPos.get(`${place.x},${place.y}`)!;
  assert.equal(door.terrain,'door');
  const neighbors=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>byPos.get(`${place.x+dx},${place.y+dy}`));
  assert.ok(neighbors.some(t=>t&&walkable.has(t.terrain)),'la puerta debe conectar con el exterior transitable');
  assert.ok(neighbors.some(t=>t?.terrain==='floor'),'la puerta debe conectar con un interior transitable');
 }
});

test('interactuar con una puerta descubre el lugar y no inicia el sueño',()=>{const w=generateWorld(905),place=w.locations![0]!;w.player.x=place.x+1;w.player.y=place.y;w.selectedTile={x:place.x,y:place.y};const before=w.elapsedWorldMs;interactWorld(w);assert.equal(place.discovered,true);assert.equal(w.player.x,place.x,'interactuar debe llevar al jugador a través de la puerta');assert.equal(w.player.y,place.y);assert.equal(w.elapsedWorldMs,before);assert.ok(w.log.some(e=>e.text.includes(place.name)));});

test('cada conversación puede dejar un recuerdo persistente del lugar',()=>{const w=generateWorld(906),place=w.locations![0]!,npc=w.actors.find(a=>place.knownByActorIds.includes(a.id))!;npc.x=place.x+1;npc.y=place.y;w.player.x=place.x+2;w.player.y=place.y;w.selectedActorId=npc.id;talk(w,'¿Qué hacés por acá?');assert.ok(npc.social.placeMemories?.some(memory=>memory.placeId===place.id&&memory.description.includes(place.name)));});

test('entregar desde el inventario transfiere una unidad al NPC seleccionado',()=>{
 const w=generateWorld(7123),actor=w.actors.find(a=>a.alive)!;
 actor.x=w.player.x+1;actor.y=w.player.y;actor.inventory=[];w.selectedActorId=actor.id;
 w.player.inventory=[{id:'ration',name:'Ración comprimida',quantity:2,description:'Comida de larga duración'}];
 assert.equal(giveInventoryItemToSelectedActor(w,'ration'),true);
 assert.equal(w.player.inventory[0]!.quantity,1);
 assert.equal(actor.inventory[0]!.name,'Ración comprimida');
 assert.equal(actor.inventory[0]!.quantity,1);
 assert.ok(w.log.some(e=>e.text.includes('Le entregas Ración comprimida')));
});
test('no se puede entregar desde el inventario a un NPC lejano',()=>{
 const w=generateWorld(7124),actor=w.actors.find(a=>a.alive)!;
 actor.x=w.player.x+8;actor.y=w.player.y;w.selectedActorId=actor.id;
 w.player.inventory=[{id:'water',name:'Agua',quantity:1,description:'Agua potable'}];
 assert.equal(giveInventoryItemToSelectedActor(w,'water'),false);
 assert.equal(w.player.inventory[0]!.quantity,1);
 assert.ok(!actor.inventory?.some(i=>i.id==='water'));
});
