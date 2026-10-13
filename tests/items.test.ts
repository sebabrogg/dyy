import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {advanceWorld,interactWorld,performInventoryAction,useItem} from '../src/core/engine.ts';
import {stream} from '../src/core/rng.ts';
import {hydrateItem,itemActions,itemMass} from '../src/core/items.ts';
import {decodeSave,encodeSave} from '../src/core/save.ts';

test('los objetos antiguos reciben estados físicos persistibles sin cambiar su identidad',()=>{
 const item={id:'old-battery',name:'Batería industrial',quantity:1,description:'Recuperada',condition:64};
 hydrateItem(item);
 assert.equal(item.kind,'battery');assert.equal(item.integrity,64);assert.equal(item.charge,64);assert.equal(item.dirt,18);assert.ok(itemMass(item)>2);
 const world=generateWorld(9101);world.player.inventory.push(item);const loaded=decodeSave(encodeSave(world));const saved=loaded.player.inventory.find(i=>i.id==='old-battery')!;
 assert.equal(saved.charge,64);assert.equal(saved.material,'metal y electrolito');assert.equal(saved.dirt,18);
});

test('las opciones dependen de materiales disponibles, no de una lista universal',()=>{
 const radio={id:'radio',name:'Radio portátil',quantity:1,description:'Radio',condition:80};
 const available=itemActions(radio,[radio]);assert.ok(available.includes('use'));assert.ok(available.includes('inspect'));assert.ok(available.includes('discard'));assert.ok(!available.includes('repair'));assert.ok(!available.includes('clean'));
 const cloth={id:'cloth',name:'Paño industrial',quantity:1,description:'Paño'};
 assert.ok(itemActions(radio,[radio,cloth]).includes('clean'));
 assert.ok(!itemActions(radio,[radio]).includes('repair'));
});

test('limpiar transfiere suciedad al paño reutilizable y consume tiempo, no el paño',()=>{
 const world=generateWorld(9102);const wrench={id:'maintenance-wrench',name:'Llave de mantenimiento',quantity:1,description:'Herramienta'};const cloth={id:'industrial-cloth',name:'Paño industrial',quantity:1,description:'Paño'};world.player.inventory.push(wrench,cloth);hydrateItem(wrench);hydrateItem(cloth);const beforeDirt=wrench.dirt??0,beforeCloth=cloth.dirt??0;
 assert.equal(performInventoryAction(world,wrench.id,'clean'),true);assert.equal(wrench.dirt,Math.max(0,beforeDirt-35));assert.equal(cloth.quantity,1);assert.ok((cloth.dirt??0)>beforeCloth);assert.equal(world.elapsedWorldMs,5*60000);
});

test('reparar consume piezas, desgasta la herramienta y mejora solo la integridad del objetivo',()=>{
 const world=generateWorld(9103);const radio={id:'radio',name:'Radio portátil',quantity:1,description:'Radio',condition:35};const screwdriver={id:'industrial-screwdriver',name:'Destornillador industrial',quantity:1,description:'Herramienta',condition:90};const parts={id:'mechanical-parts',name:'Kit de piezas mecánicas',quantity:1,description:'Repuestos'};world.player.inventory.push(radio,screwdriver,parts);hydrateItem(radio);hydrateItem(screwdriver);const before=radio.integrity??0;const toolWear=screwdriver.wear??0;
 assert.equal(performInventoryAction(world,radio.id,'repair'),true);assert.ok((radio.integrity??0)>before);assert.equal(parts.quantity,0);assert.ok((screwdriver.wear??0)>toolWear);assert.equal(world.elapsedWorldMs,20*60000);
});

test('radio y linterna consumen energía de una batería instalada en vez de guardar una carga ficticia propia',()=>{
 const world=generateWorld(9104);const battery={id:'unique-battery-1',name:'Batería industrial',quantity:1,description:'Batería',condition:100};const radio={id:'unique-radio-1',name:'Radio portátil',quantity:1,description:'Radio',condition:90};world.player.inventory.push(battery,radio);hydrateItem(battery);hydrateItem(radio);
 useItem(world,battery.id);assert.equal(radio.installedBatteryId,battery.id);useItem(world,radio.id);assert.equal(radio.powered,true);const before=battery.charge;for(let i=0;i<10;i++)advanceWorld(world);assert.equal(battery.charge,(before??0)-1);assert.equal(radio.powered,true);
});

test('un dispositivo sin batería no se enciende y descartar registra una acción con tiempo',()=>{
 const world=generateWorld(9105);const radio={id:'radio',name:'Radio portátil',quantity:1,description:'Radio'};world.player.inventory.push(radio);useItem(world,radio.id);assert.notEqual(radio.powered,true);assert.ok(world.log.some(entry=>entry.text.includes('batería compatible')));
 const scrap=world.player.inventory.find(i=>i.id==='scrap')!;const before=world.elapsedWorldMs;assert.equal(performInventoryAction(world,scrap.id,'discard'),true);assert.equal(scrap.quantity,2);assert.equal(world.elapsedWorldMs,before+60000);assert.ok(world.log.some(entry=>entry.text.includes('Queda en el suelo')));assert.equal(world.groundItems?.length,1);interactWorld(world);assert.equal(world.groundItems?.length,0);assert.equal(scrap.quantity,3);
});


test('los objetos descartados existen en el mapa y no pueden recogerse si exceden la capacidad',()=>{
 const world=generateWorld(9106);world.player.carryCapacity=0;const item={id:'ground-battery',name:'Batería industrial',quantity:1,description:'Batería',condition:80,weight:2.4};world.groundItems=[{id:'ground-battery-1',x:world.player.x,y:world.player.y,item,droppedAtWorldMinute:0}];interactWorld(world);assert.equal(world.groundItems.length,1);assert.ok(world.log.some(entry=>entry.text.includes('capacidad de carga')));
 world.player.carryCapacity=30;interactWorld(world);assert.equal(world.groundItems.length,0);assert.ok(world.player.inventory.some(i=>i.id==='ground-battery'));
});

test('la cantimplora conserva por separado recipiente, cantidad y calidad del agua',()=>{
 const world=generateWorld(9107);world.player.hydration=45;const canteen={id:'canteen',name:'Cantimplora',quantity:1,description:'Recipiente'};const water={id:'water',name:'Agua recuperada',quantity:1,description:'Agua',condition:20};world.player.inventory=[];world.player.inventory.push(canteen,water);hydrateItem(canteen);hydrateItem(water);assert.equal(performInventoryAction(world,canteen.id,'fill'),true);assert.equal(canteen.contents,1);assert.equal(canteen.contentsQuality,20);assert.equal(water.quantity,0);useItem(world,canteen.id);assert.equal(canteen.contents,0);assert.ok((world.player.hydration??0)>45);
});

test('recargar batería consume combustible, tiempo y una pequeña parte de la capacidad máxima',()=>{
 const world=generateWorld(9108);const generator={id:'generator',name:'Generador portátil',quantity:1,description:'Generador',condition:80,fuel:50,maxFuel:100,powered:true};const battery={id:'battery-recharge',name:'Batería industrial',quantity:1,description:'Batería',condition:10};world.player.inventory.push(generator,battery);hydrateItem(generator);hydrateItem(battery);assert.equal(performInventoryAction(world,battery.id,'recharge'),true);assert.equal(battery.charge,40);assert.equal(battery.maxCharge,99);assert.equal(generator.fuel,37);assert.equal(world.elapsedWorldMs,30*60000);
});

test('la lluvia deteriora equipos expuestos y los NPC pueden mantener equipo por iniciativa propia',()=>{
 const world=generateWorld(9109);const battery={id:'weather-battery',name:'Batería industrial',quantity:1,description:'Batería',condition:80,moisture:64,charge:80};world.player.inventory.push(battery);hydrateItem(battery);const before=battery.integrity??0;for(let i=0;i<60;i++)advanceWorld(world);assert.ok((battery.moisture??0)>=65);assert.ok((battery.integrity??100)<before);assert.ok((battery.charge??100)<80);
 let seed=1,actorId='';for(;seed<100;seed++){const candidate=generateWorld(seed);actorId=candidate.actors[0]!.id;if(stream(seed,'npc.maintenance.'+actorId+'.60').next()<=.65)break;}const autonomous=generateWorld(seed);const actor=autonomous.actors[0]!;actor.goal='reparar generador y mantener maquinaria';actor.lifeMission.motivation='mantenimiento';actor.lifeMission.description='reparar equipo';actor.mind.privateGoal='reparar maquinaria';actor.personality='técnico';actor.social.traits.selfControl=100;const target={id:'npc-radio-test',name:'Radio portátil',quantity:1,description:'Radio averiada',condition:30};const tool={id:'npc-screwdriver-test',name:'Destornillador industrial',quantity:1,description:'Herramienta',condition:80};const parts={id:'npc-parts-test',name:'Kit de piezas mecánicas',quantity:1,description:'Piezas',condition:80};actor.inventory=[target,tool,parts];hydrateItem(target);hydrateItem(tool);hydrateItem(parts);const integrity=target.integrity??0;for(let i=0;i<60;i++)advanceWorld(autonomous);assert.ok((target.integrity??0)>integrity);assert.ok(target.maintenanceHistory?.some(entry=>entry.includes(actor.name)));
});
