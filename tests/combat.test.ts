import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCombatAction} from '../src/core/combat.ts';
import {generateWorld} from '../src/world/generate.ts';
import {applyPlayableCharacter} from '../src/core/playable-characters.ts';
import {initializeWorld} from '../src/core/engine.ts';

test('combat rejects invalid targets and attacks outside actual reach without changing health',()=>{const s=generateWorld(7721);initializeWorld(s);const target=s.actors.find(a=>a.alive)!;s.player.x=0;s.player.y=0;target.x=8;target.y=8;const health=(target as any).health??100;const r=resolveCombatAction(s,'player',target.id);assert.equal(r.ok,false);assert.equal((target as any).health??100,health);});
test('combat requires compatible real inventory for blade/firearm actions',()=>{const s=generateWorld(7722);initializeWorld(s);const target=s.actors.find(a=>a.alive)!;target.x=s.player.x+1;target.y=s.player.y;const r=resolveCombatAction(s,'player',target.id,'firearm');assert.equal(r.ok,false);assert.match(r.message,/arma de fuego/);});
test('valid close combat applies persistent health, wound, stamina, log and time consequences deterministically',()=>{const s=generateWorld(7723);initializeWorld(s);applyPlayableCharacter(s,'mara-venn');const target=s.actors.find(a=>a.alive)!;target.x=s.player.x+1;target.y=s.player.y;(target as any).health=100;(target as any).stamina=100;const before=s.elapsedWorldMs??0;const a=resolveCombatAction(s,'player',target.id,'unarmed',1);const health=(target as any).health;assert.equal(a.ok,true);assert.equal(typeof a.hit,'boolean');assert.equal(health,100-(a.damage??0));assert.ok((target as any).stamina<100);if(a.hit)assert.ok((target as any).wounds.length>0);assert.ok((s.elapsedWorldMs??0)>before);assert.ok(s.log.some(l=>l.text===a.message));const s2=generateWorld(7723);initializeWorld(s2);applyPlayableCharacter(s2,'mara-venn');const target2=s2.actors.find(a=>a.alive)!;target2.x=s2.player.x+1;target2.y=s2.player.y;(target2 as any).health=100;(target2 as any).stamina=100;const b=resolveCombatAction(s2,'player',target2.id,'unarmed',1);assert.equal(a.damage,b.damage);assert.equal(a.hit,b.hit);});
test('combat can use only equipped or carried compatible tools and wears the selected weapon',()=>{const s=generateWorld(7724);initializeWorld(s);const target=s.actors.find(a=>a.alive)!;target.x=s.player.x+1;target.y=s.player.y;s.player.inventory.push({id:'test-pipe',name:'Tubo de hierro',quantity:1,description:'Tubo pesado',kind:'tool',condition:80,integrity:80,quality:80});const r=resolveCombatAction(s,'player',target.id,'blunt');assert.equal(r.ok,true);const pipe=s.player.inventory.find(i=>i.id==='test-pipe')!;assert.ok((pipe.wear??0)>0);assert.ok((pipe.integrity??80)<80);});


test('incoming attacks persist player health, wounds, and stamina in the authoritative world state',()=>{
 const s=generateWorld(7724);initializeWorld(s);applyPlayableCharacter(s,'mara-venn');
 const enemy=s.actors.find(a=>a.alive)!;enemy.x=s.player.x+1;enemy.y=s.player.y;enemy.health=100;enemy.stamina=100;enemy.inventory=[];
 s.player.inventory=[];s.player.health=100;s.player.stamina=100;
 const r=resolveCombatAction(s,enemy.id,'player','unarmed',1,18);
 assert.equal(r.ok,true);assert.equal(r.hit,true);assert.equal(s.player.health,r.targetHealth);assert.ok(s.player.health<100);assert.ok((s.player.stamina??100)<100);
});

test('evasion modifiers cannot increase incoming damage and are resolved deterministically',()=>{
 const make=(seed:number)=>{const s=generateWorld(seed);initializeWorld(s);applyPlayableCharacter(s,'mara-venn');const enemy=s.actors.find(a=>a.alive)!;enemy.x=s.player.x+1;enemy.y=s.player.y;enemy.health=100;enemy.stamina=100;enemy.inventory=[];s.player.inventory=[];s.player.health=100;s.player.stamina=100;return {s,enemy};};
 const a=make(7725);const b=make(7725);
 const baseline=resolveCombatAction(a.s,a.enemy.id,'player','unarmed',1,18,0,0);
 const evaded=resolveCombatAction(b.s,b.enemy.id,'player','unarmed',1,18,35,.8);
 assert.ok((evaded.damage??0)<=(baseline.damage??0));
 assert.ok((evaded.targetHealth??100)>=(baseline.targetHealth??100));
 assert.equal(b.s.player.health,evaded.targetHealth);
});

test('disarm is a non-damaging contest affected by combat stats and costs stamina',()=>{
 const s=generateWorld(7726);initializeWorld(s);applyPlayableCharacter(s,'mara-venn');
 const enemy=s.actors.find(a=>a.alive)!;enemy.x=s.player.x+1;enemy.y=s.player.y;enemy.health=100;enemy.stamina=100;enemy.inventory=[{id:'test-blade',name:'cuchillo',quantity:1,description:'Hoja de prueba',equipped:true}];
 s.player.inventory=[];s.player.health=100;s.player.stamina=100;
 const r=resolveCombatAction(s,'player',enemy.id,'disarm');
 assert.equal(r.ok,true);assert.equal(r.damage,0);assert.equal(enemy.health,100);assert.ok((s.player.stamina??100)<100);
});
