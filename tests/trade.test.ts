import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {executeTrade,evaluateTradeOffer} from '../src/core/trade.ts';

function setup(){
 const state=generateWorld(8421);const actor=state.actors[0]!;
 actor.x=state.player.x+1;actor.y=state.player.y;actor.alive=true;
 actor.goal='Reparar el generador del refugio';actor.lifeMission.needs=['chatarra','piezas para el generador'];actor.mind.needs=['repuestos','metal'];
 state.player.inventory=[{id:'scrap',name:'Chatarra',quantity:3,description:'Metal recuperado para repuestos'}];
 actor.inventory=[{id:'knife',name:'Cuchillo',quantity:1,description:'Hoja afilada'}];
 return {state,actor};
}

test('un intercambio aceptado transfiere ambos objetos y conserva cantidades',()=>{
 const {state,actor}=setup();const result=executeTrade(state,actor.id,'scrap','knife',2,1);
 assert.equal(result.accepted,true,result.reason);
 assert.equal(state.player.inventory.find(i=>i.id==='scrap')?.quantity,1);
 assert.equal(state.player.inventory.find(i=>i.id==='knife')?.quantity,1);
 assert.equal(actor.inventory?.find(i=>i.id==='scrap')?.quantity,2);
 assert.equal(actor.inventory?.some(i=>i.id==='knife'),false);
});

test('un trato rechazado no modifica ninguno de los dos inventarios',()=>{
 const {state,actor}=setup();state.player.inventory=[{id:'dust',name:'Polvo inútil',quantity:1,description:'Restos sin uso'}];
 const beforePlayer=structuredClone(state.player.inventory),beforeNpc=structuredClone(actor.inventory);
 const result=executeTrade(state,actor.id,'dust','knife',1,1);
 assert.equal(result.accepted,false);assert.match(result.reason,/No me sirve|No me convence/);
 assert.deepEqual(state.player.inventory,beforePlayer);assert.deepEqual(actor.inventory,beforeNpc);
});

test('el trueque rechaza cantidades inválidas, objetos inexistentes y NPC lejano',()=>{
 const {state,actor}=setup();
 assert.equal(executeTrade(state,actor.id,'scrap','knife',1.5,1).accepted,false);
 assert.equal(executeTrade(state,actor.id,'missing','knife').accepted,false);
 actor.x=state.player.x+8;
 assert.equal(executeTrade(state,actor.id,'scrap','knife').accepted,false);
});

test('el NPC puede aceptar un recurso alineado con sus necesidades',()=>{
 const {actor}=setup();
 const decision=evaluateTradeOffer(actor,{id:'scrap',name:'Chatarra',quantity:2,description:'Metal para repuestos'},{id:'knife',name:'Cuchillo',quantity:1,description:'Hoja afilada'},2,1);
 assert.equal(decision.accepted,true);
});

import {executeMarketTrade,marketPrice} from '../src/core/trade.ts';

test('comprar actualiza créditos e inventarios de forma atómica antes de avanzar el reloj del motor',()=>{
 const {state,actor}=setup();actor.inventory=[{id:'battery',name:'Batería industrial',quantity:2,description:'Carga útil para equipos y maquinaria',condition:100}];actor.credits=100;state.player.credits=126;
 const price=marketPrice(actor.inventory[0]!,actor,'buy');const before=state.elapsedWorldMs??0;const result=executeMarketTrade(state,actor.id,'buy','battery',1);
 assert.equal(result.accepted,true,result.reason);assert.equal(state.player.credits,126-price);assert.equal(actor.credits,100+price);assert.equal(state.player.inventory.find(i=>i.id==='battery')?.quantity,1);assert.equal(actor.inventory[0]?.quantity,1);assert.equal(state.elapsedWorldMs??0,before);
});

test('no se puede comprar sin crédito ni vender existencias que ya no existen',()=>{
 const {state,actor}=setup();actor.inventory=[{id:'battery',name:'Batería industrial',quantity:2,description:'Carga útil',condition:100}];state.player.credits=0;
 assert.equal(executeMarketTrade(state,actor.id,'buy','battery',1).accepted,false);assert.equal(actor.inventory[0]?.quantity,2);
 assert.equal(executeMarketTrade(state,actor.id,'sell','scrap',4).accepted,false);assert.equal(state.player.inventory[0]?.quantity,3);
});
