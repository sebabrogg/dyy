import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {recordSocialEvent,relationshipTo,shouldAttack,decideSocialAction,classifyUtterance,summarizeRelationship,ageSocialMemories,recordObservedSocialEvent,shareSocialRumor} from '../src/core/social.ts';

function actor(seed=77){return generateWorld(seed).actors[0]!;}

test('los rasgos sociales se generan de forma reproducible y por stream independiente',()=>{
 const a=actor(12),b=actor(12);
 assert.deepEqual(a.social,b.social);
 assert.notDeepEqual(actor(13).social.traits,a.social.traits);
});

test('un insulto deja memoria y aumenta resentimiento, no una penalización efímera',()=>{
 const a=actor();
 recordSocialEvent(a,{kind:'insult',targetId:'player',tick:2,severity:18,description:'me insultó'});
 const r=a.social.relationships.player!;
 assert.equal(a.social.memories.filter(m=>m.kind==='insult').length,1);
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
 const r=a.social.relationships.player!;
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
 assert.equal(a.social.memories.filter(m=>m.kind==='insult').length,1);
 assert.equal(a.social.memories.filter(m=>m.kind==='conversation').length,1);
 assert.equal(a.social.memories.length,2);
 assert.ok(relationshipTo(a).resentment>resentmentAfterInsult-0.01);
});

test('una disculpa se recuerda como disculpa, no como una ofensa duplicada',async()=>{
 const {talk}=await import('../src/core/engine.ts');
 const world=generateWorld(102);
 const a=world.actors[1]!;
 world.player.x=a.x;world.player.y=a.y;world.selectedActorId=a.id;
 talk(world,'Sos un imbécil');
 const resentmentAfterInsult=relationshipTo(a).resentment;
 talk(world,'Perdón, lo siento');
 assert.ok(relationshipTo(a).resentment<resentmentAfterInsult);
 assert.equal(a.social.memories.filter(m=>m.kind==='apology').length,1);
 assert.equal(a.social.memories.filter(m=>m.kind==='conversation').length,0);
 assert.match(a.social.memories.find(m=>m.kind==='apology')!.interpretation,/disculpa/);
});

test('solo los testigos cercanos con línea de visión conocen un agravio',()=>{
 const w=generateWorld(31);
 const target=w.actors[0]!,witness=w.actors[1]!,distant=w.actors[2]!;
 w.player.x=target.x;w.player.y=target.y;
 witness.x=target.x+1;witness.y=target.y;
 distant.x=target.x+12;distant.y=target.y;
 for(const tile of w.tiles)tile.terrain='floor';
 const seen=recordObservedSocialEvent(w,{eventId:'evt-1',sourceId:'player',targetId:target.id,kind:'insult',tick:4,severity:20,description:'insulto en voz alta'});
 assert.ok(seen.includes(witness.id));
 assert.equal(distant.social.knowledge.some(k=>k.eventId==='evt-1'),false);
});

test('una pared impide que un NPC observe una interacción',()=>{
 const w=generateWorld(32),target=w.actors[0]!,witness=w.actors[1]!;
 w.player.x=target.x;w.player.y=target.y;
 witness.x=target.x+2;witness.y=target.y;
 for(const tile of w.tiles)tile.terrain='floor';
 const wall=w.tiles.find(t=>t.x===target.x+1&&t.y===target.y)!;wall.terrain='wall';
 const seen=recordObservedSocialEvent(w,{eventId:'evt-wall',sourceId:'player',targetId:target.id,kind:'threat',tick:5,severity:25,description:'amenaza'});
 assert.equal(seen.includes(witness.id),false);
});

test('los rumores requieren un contacto explícito, pierden confianza y no se propagan indefinidamente',()=>{
 const w=generateWorld(33),[a,b,c]=w.actors;
 assert.ok(a&&b&&c);
 for(const actor of w.actors){actor.social.contacts={};actor.social.knowledge=[];}
 a!.social.knowledge.push({eventId:'rumor-1',subjectId:'player',targetId:b!.id,kind:'insult',tick:2,confidence:90,source:'witness',interpretation:'lo vio',hops:0});
 a!.social.contacts[b!.id]=100;b!.social.contacts[c!.id]=100;
 b!.x=a!.x+1;b!.y=a!.y;c!.x=b!.x+1;c!.y=b!.y;
 assert.equal(shareSocialRumor(w,a!.id,b!.id,'rumor-1'),true);
 const received=b!.social.knowledge.find(k=>k.eventId==='rumor-1')!;
 assert.equal(received.source,'rumor');
 assert.ok(received.confidence<90);
 assert.equal(shareSocialRumor(w,b!.id,c!.id,'rumor-1'),true);
 const second=c!.social.knowledge.find(k=>k.eventId==='rumor-1')!;
 assert.equal(second.hops,2);
 assert.equal(shareSocialRumor(w,c!.id,a!.id,'rumor-1'),false);
});

test('un rumor no atraviesa una red sin contacto',()=>{
 const w=generateWorld(34),[a,b]=w.actors;
 assert.ok(a&&b);
 a!.social.knowledge.push({eventId:'isolated',subjectId:'player',targetId:b!.id,kind:'betrayal',tick:1,confidence:80,source:'witness',interpretation:'lo vio',hops:0});
 a!.social.contacts={};
 assert.equal(shareSocialRumor(w,a!.id,b!.id,'isolated'),false);
 assert.equal(b!.social.knowledge.some(k=>k.eventId==='isolated'),false);
});

test('la decisión social distingue rechazo de ataque y es determinista',()=>{
 const a=actor();
 const r=a.social.relationships.player!;
 r.hostility=60;r.resentment=70;r.fear=0;
 a.social.traits.vengefulness=0;a.social.traits.selfControl=100;a.social.traits.reconciliation=50;
 assert.equal(decideSocialAction(a),'refuse');
 a.social.traits.vengefulness=100;a.social.traits.selfControl=0;a.social.traits.reconciliation=0;
 assert.equal(decideSocialAction(a,'player',100,0),'attack');
 assert.equal(decideSocialAction(a,'player',100,0),decideSocialAction(a,'player',100,0));
});
