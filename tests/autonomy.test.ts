import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {chooseAutonomousDirection} from '../src/core/autonomy.ts';

test('la autonomía tiene en cuenta las relaciones conocidas y no solo la posición',()=>{
 const s=generateWorld(711),a=s.actors[0]!,b=s.actors[1]!;
 a.x=5;a.y=5;b.x=7;b.y=5;a.social.contacts[b.id]=1;
 a.social.relationships[b.id]={affection:95,trust:95,respect:80,resentment:0,fear:0,debt:0,hostility:0};
 a.mind.traits.extraversion=100;a.mind.motivations!.belonging=100;a.mind.traits.curiosity=0;a.mind.traits.openness=0;a.mind.traits.riskTolerance=0;a.mind.traits.conscientiousness=0;a.mind.traits.patience=0;
 const direction=chooseAutonomousDirection(a,[b],()=>0.1);
 assert.deepEqual(direction,{dx:1,dy:0});
});

test('una relación hostil cercana puede pesar más que la exploración',()=>{
 const s=generateWorld(712),a=s.actors[0]!,b=s.actors[1]!;
 a.x=5;a.y=5;b.x=6;b.y=5;a.alert=30;a.social.contacts[b.id]=1;
 a.social.relationships[b.id]={affection:0,trust:0,respect:0,resentment:90,fear:80,debt:0,hostility:100};
 a.mind.traits.paranoia=100;a.mind.traits.riskTolerance=0;a.mind.traits.curiosity=0;a.mind.traits.openness=0;a.mind.traits.extraversion=0;a.mind.traits.conscientiousness=0;a.mind.traits.patience=0;a.mind.traits.impulsivity=0;
 const direction=chooseAutonomousDirection(a,[b],()=>0.1);
 assert.deepEqual(direction,{dx:-1,dy:0});
});

test('la misma personalidad puede quedarse quieta cuando el contexto eleva la alerta',()=>{
 const s=generateWorld(713),a=s.actors[0]!;
 a.alert=0;a.mind.traits.curiosity=100;a.mind.traits.openness=100;a.mind.traits.riskTolerance=100;a.mind.traits.conscientiousness=0;a.mind.traits.patience=0;
 const calm=chooseAutonomousDirection(a,[],()=>0.1);
 a.alert=100;
 const alert=chooseAutonomousDirection(a,[],()=>0.1);
 assert.ok(calm);
 assert.equal(alert,null);
});
