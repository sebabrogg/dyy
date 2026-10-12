import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {interactWorld,talk} from '../src/core/engine.ts';

test('el mismo seed reproduce el mapa y las personas',()=>{const a=generateWorld(404),b=generateWorld(404);assert.deepEqual(a.tiles,b.tiles);assert.deepEqual(a.actors.map(v=>[v.name,v.personality,v.goal,v.x,v.y]),b.actors.map(v=>[v.name,v.personality,v.goal,v.x,v.y]));});
test('una partida nueva cambia dimensiones, lugares y personajes según su seed',()=>{const worlds=[11,22,33,44,55,66,77,88].map(seed=>generateWorld(seed));assert.ok(worlds.some(w=>w.width!==worlds[0]!.width||w.height!==worlds[0]!.height));assert.ok(worlds.some(w=>w.actors.map(a=>a.name).join('|')!==worlds[0]!.actors.map(a=>a.name).join('|')));assert.ok(worlds.some(w=>w.tiles.map(t=>t.terrain).join('|')!==worlds[0]!.tiles.map(t=>t.terrain).join('|')));});
test('los NPCs generados tienen identidad propia, misión y conocimiento parcial',()=>{const w=generateWorld(904);assert.ok(w.actors.length>=8);assert.ok(w.actors.every(a=>a.mind&&a.lifeMission&&a.lifeMission.title!==undefined));assert.equal(new Set(w.actors.map(a=>a.name)).size,w.actors.length);assert.ok(w.actors.some(a=>a.knownToPlayer)&&w.actors.some(a=>!a.knownToPlayer));});
test('interactuar con una puerta descubre el lugar y no inicia el sueño',()=>{const w=generateWorld(905),place=w.locations![0]!;w.player.x=place.x+1;w.player.y=place.y;w.selectedTile={x:place.x,y:place.y};const before=w.elapsedWorldMs;interactWorld(w);assert.equal(place.discovered,true);assert.equal(w.elapsedWorldMs,before);assert.ok(w.log.some(e=>e.text.includes(place.name)));});

test('cada conversación puede dejar un recuerdo persistente del lugar',()=>{const w=generateWorld(906),place=w.locations![0]!,npc=w.actors.find(a=>place.knownByActorIds.includes(a.id))!;npc.x=place.x+1;npc.y=place.y;w.player.x=place.x+2;w.player.y=place.y;w.selectedActorId=npc.id;talk(w,'¿Qué hacés por acá?');assert.ok(npc.social.placeMemories?.some(memory=>memory.placeId===place.id&&memory.description.includes(place.name)));});
