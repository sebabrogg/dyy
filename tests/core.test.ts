import test from 'node:test';
import assert from 'node:assert/strict';
import {Random,stream} from '../src/core/rng.ts';
import {moveTo,initializeWorld} from '../src/core/engine.ts';
import {generateWorld} from '../src/world/generate.ts';

test('la generación de mundo es reproducible para una misma semilla',()=>{
 const a=generateWorld(12345),b=generateWorld(12345);
 assert.deepEqual(a.tiles,b.tiles);
 assert.deepEqual(a.actors,b.actors);
 assert.notDeepEqual(generateWorld(54321).tiles,a.tiles);
});
test('los streams nombrados no dependen del orden de consumo de otros sistemas',()=>{
 const baseline=stream(99,'actors');const expected=[baseline.nextUint32(),baseline.nextUint32(),baseline.nextUint32()];
 const map=stream(99,'map');for(let i=0;i<100;i++)map.nextUint32();
 const actual=stream(99,'actors');
 assert.deepEqual([actual.nextUint32(),actual.nextUint32(),actual.nextUint32()],expected);
});
test('el generador de números aleatorios es estable y acotado',()=>{
 const a=new Random('stable'),b=new Random('stable');
 for(let i=0;i<100;i++){assert.equal(a.nextUint32(),b.nextUint32());}
 const c=new Random(42);for(let i=0;i<100;i++){const n=c.int(2,7);assert.ok(n>=2&&n<=7);}
});
test('moverse por el mundo consume ticks y actualiza coordenadas',()=>{
 const s=generateWorld(123);initializeWorld(s);const before=s.tick;
 moveTo(s,15,13);
 assert.equal(s.player.x,15);assert.equal(s.player.y,13);assert.ok(s.tick>before);
 assert.ok(s.log.some(e=>e.kind==='action'));
});
test('el motor rechaza movimiento fuera del mapa sin cambiar la posición',()=>{
 const s=generateWorld(123);initializeWorld(s);const before={x:s.player.x,y:s.player.y,tick:s.tick};
 moveTo(s,-1,-1);
 assert.deepEqual({x:s.player.x,y:s.player.y,tick:s.tick},before);
 assert.ok(s.log.some(e=>e.kind==='warning'));
});
