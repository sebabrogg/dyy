import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCombatAction} from '../src/core/combat.ts';
import {generateWorld} from '../src/world/generate.ts';
import {applyPlayableCharacter} from '../src/core/playable-characters.ts';
import {actorCombatAction,initializeWorld,resolvePhysicalHack} from '../src/core/engine.ts';

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


test('NPC companion combat resolves through the authoritative engine for actor-vs-actor fights',()=>{
 const s=generateWorld(7728);initializeWorld(s);
 const attacker=s.actors[0]!,target=s.actors[1]!;
 attacker.alive=true;target.alive=true;attacker.x=4;attacker.y=4;target.x=5;target.y=4;
 attacker.health=100;attacker.stamina=100;target.health=100;target.stamina=100;
 attacker.inventory=[];target.inventory=[];
 const before=s.elapsedWorldMs??0;
 const result=actorCombatAction(s,attacker.id,target.id,'unarmed',1);
 assert.equal(result.ok,true);assert.equal(result.attackerId,attacker.id);assert.equal(result.targetId,target.id);
 assert.equal(target.health??100,result.targetHealth);assert.ok((s.elapsedWorldMs??0)>before);
});

test('generated physical and biological identities are deterministic per seed and actor',()=>{
 const a=generateWorld(7729),b=generateWorld(7729);
 assert.deepEqual(a.actors.map(x=>[x.id,x.bodyType,x.glyph]),b.actors.map(x=>[x.id,x.bodyType,x.glyph]));
 assert.ok(a.actors.every(x=>x.bodyType==='physical'||x.bodyType==='biological'));
 assert.ok(a.actors.every(x=>x.bodyType!=='physical'||x.glyph==='▣'));
});


test('physical interface access is validated by the engine and leaves a social trace when unauthorized',()=>{
 const s=generateWorld(7730);initializeWorld(s);const actor=s.actors[0]!;
 actor.bodyType='physical';actor.x=s.player.x+1;actor.y=s.player.y;actor.disposition='neutral';actor.alert=0;
 const result=resolvePhysicalHack(s,actor.id,true);
 assert.equal(result.ok,true);assert.equal(result.tolerated,false);assert.ok(actor.alert>=12);
 assert.ok(s.player.knownFacts?.some(f=>f.includes(actor.name)));
 assert.ok(actor.social.memories.some(m=>m.kind==='threat'&&m.targetId==='player'));
 assert.ok(s.log.some(e=>e.text.includes('registró la intrusión')));
});

test('physical interface rejects a biological target and a remote target without revealing facts',()=>{
 const s=generateWorld(7731);initializeWorld(s);const actor=s.actors[0]!;
 actor.bodyType='biological';actor.x=s.player.x+1;actor.y=s.player.y;
 const biological=resolvePhysicalHack(s,actor.id,true);assert.equal(biological.ok,false);
 actor.bodyType='physical';actor.x=s.player.x+10;actor.y=s.player.y+10;
 const remote=resolvePhysicalHack(s,actor.id,true);assert.equal(remote.ok,false);
 assert.equal((s.player.knownFacts??[]).some(f=>f.includes(actor.name)),false);
});

test('trusted physical can tolerate a diagnostic without gaining or losing control',()=>{
 const s=generateWorld(7732);initializeWorld(s);const actor=s.actors[0]!;
 actor.bodyType='physical';actor.x=s.player.x+1;actor.y=s.player.y;actor.disposition='helpful';
 actor.social.relationships['player']={affection:0,trust:80,respect:25,resentment:0,fear:0,debt:0,hostility:0};
 const result=resolvePhysicalHack(s,actor.id,true);
 assert.equal(result.ok,true);assert.equal(result.tolerated,true);assert.equal(actor.alert,0);
 assert.ok(actor.social.memories.some(m=>m.kind==='help'&&m.targetId==='player'));
 assert.ok(s.log.some(e=>e.text.includes('toleró el diagnóstico')));
});


test('lethal combat records consequences only for plausible line-of-sight witnesses',()=>{
 const s=generateWorld(7733);initializeWorld(s);applyPlayableCharacter(s,'mara-venn');
 const victim=s.actors[0]!,witness=s.actors[1]!,distant=s.actors[2]!;
 s.player.x=10;s.player.y=10;victim.x=11;victim.y=10;victim.health=1;victim.alive=true;victim.inventory=[];victim.stamina=100;
 witness.x=10;witness.y=11;witness.alive=true;
 distant.x=22;distant.y=22;distant.alive=true;
 const result=resolveCombatAction(s,'player',victim.id,'unarmed',1,18);
 assert.equal(result.hit,true);assert.equal(victim.alive,false);
 assert.ok(witness.social.knowledge.some(k=>k.subjectId==='player'&&k.targetId===victim.id&&k.kind==='threat'));
 assert.ok(witness.social.memories.some(m=>m.targetId==='player'&&m.kind==='threat'));
 assert.ok(witness.alert>=18);
 assert.ok(!distant.social.knowledge.some(k=>k.targetId===victim.id&&k.kind==='threat'));
 assert.ok(s.log.some(e=>e.kind==='event'&&e.text.includes('mató a '+victim.name)));
});
