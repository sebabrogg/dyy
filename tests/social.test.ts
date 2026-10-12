import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {recordSocialEvent,relationshipTo,shouldAttack,classifyUtterance,summarizeRelationship,ageSocialMemories} from '../src/core/social.ts';

function actor(seed=77){return generateWorld(seed).actors[0]!;}

test('los rasgos sociales se generan de forma reproducible y por stream independiente',()=>{
 const a=actor(12),b=actor(12);
 assert.deepEqual(a.social,b.social);
 assert.notDeepEqual(actor(13).social.traits,a.social.traits);
});

test('un insulto deja memoria y aumenta resentimiento, no una penalización efímera',()=>{
 const a=actor();
 recordSocialEvent(a,{kind:'insult',targetId:'player',tick:2,severity:18,description:'me insultó'});
 const r=relationshipTo(a);
 assert.equal(a.social.memories.length,1);
 assert.equal(a.social.memories[0]!.kind,'insult');
 assert.ok(r.resentment>0);
 assert.ok(r.hostility>0);
});

test('ayudar o salvar no elimina automáticamente un agravio anterior',()=>{
 const a=actor();
 recordSocialEvent(a,{kind:'betrayal',targetId:'player',tick:1,severity:35,description:'me traicionó'});
 const before=relationshipTo(a).resentment;
 recordSocialEvent(a,{kind:'saved',targetId:'player',tick:2,severity:80,description:'me salvó la vida'});
 const after=relationshipTo(a);
 assert.equal(after.resentment,before);
 assert.ok(after.debt>0);
 assert.ok(after.trust>0);
});

test('una disculpa puede reducir resentimiento sin borrar recuerdos',()=>{
 const a=actor();
 recordSocialEvent(a,{kind:'insult',targetId:'player',tick:1,severity:30,description:'insulto'});
 const before=relationshipTo(a).resentment;
 recordSocialEvent(a,{kind:'apology',targetId:'player',tick:2,severity:25,description:'disculpa',sincerity:100,repairEffort:100});
 assert.ok(relationshipTo(a).resentment<before);
 assert.equal(a.social.memories.length,2);
});

test('los mismos agravios no fuerzan la misma reacción en personalidades distintas',()=>{
 const a=actor(42),b=actor(43);
 a.social.traits.vengefulness=90;a.social.traits.selfControl=5;
 b.social.traits.vengefulness=5;b.social.traits.selfControl=90;
 for(const x of [a,b])recordSocialEvent(x,{kind:'insult',targetId:'player',tick:1,severity:60,description:'humillación',public:true});
 assert.notEqual(shouldAttack(a,'player',20,-10),shouldAttack(b,'player',20,-10));
});

test('clasificar un insulto no convierte una frase amable posterior en borrado social',()=>{
 assert.equal(classifyUtterance('Sos un imbécil')?.kind,'insult');
 assert.equal(classifyUtterance('Lo siento, fue mi culpa')?.kind,'apology');
 assert.equal(classifyUtterance('El clima está horrible') ,null);
});

test('la relación puede conservar deuda y hostilidad al mismo tiempo',()=>{
 const a=actor();
 recordSocialEvent(a,{kind:'threat',targetId:'player',tick:1,severity:45,description:'amenaza'});
 recordSocialEvent(a,{kind:'saved',targetId:'player',tick:2,severity:40,description:'rescate'});
 const r=relationshipTo(a);
 assert.ok(r.debt>0&&r.hostility>0);
 assert.match(summarizeRelationship(a),/hostilidad|agravios|desconfía|distante/);
});

test('la memoria puede perder intensidad con el tiempo sin borrar el hecho registrado',()=>{
 const a=actor();
 a.social.traits.grudge=10;a.social.traits.reconciliation=85;
 recordSocialEvent(a,{kind:'insult',targetId:'player',tick:1,severity:25,description:'insulto'});
 const initial=relationshipTo(a).resentment;
 const memoryCount=a.social.memories.length;
 ageSocialMemories(a,288*30);
 assert.ok(relationshipTo(a).resentment<initial);
 assert.equal(a.social.memories.length,memoryCount);
 assert.equal(a.social.memories[0]!.description,'insulto');
});

test('hablar integra insultos en el motor y una frase amable no reinicia la relación',async()=>{
 const {talk}=await import('../src/core/engine.ts');
 const world=generateWorld(101);
 const a=world.actors[1]!;
 world.player.x=a.x;world.player.y=a.y;world.selectedActorId=a.id;
 talk(world,'Sos un imbécil');
 const resentmentAfterInsult=relationshipTo(a).resentment;
 assert.ok(resentmentAfterInsult>0);
 talk(world,'Buen día');
 assert.equal(a.social.memories.length,1);
 assert.ok(relationshipTo(a).resentment>resentmentAfterInsult-0.01);
});
