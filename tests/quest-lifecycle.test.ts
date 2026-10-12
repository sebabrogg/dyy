import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld} from '../src/world/generate.ts';
import {inspect,selectActor,talk,waitTurn} from '../src/core/engine.ts';

test('un encargo aceptado fracasa si muere quien lo ofreció y el fallo queda registrado',()=>{
 const s=generateWorld(901),giver=s.actors[0]!;
 const relation=giver.social.relationships.player!;
 relation.trust=50;relation.respect=40;relation.resentment=10;
 s.quests.push({id:'quest-test',giverId:giver.id,missionId:giver.lifeMission.id,title:'Encontrar suministros',description:'Recuperar suministros',objective:'Encontrar suministros',requirements:[],reward:'Información',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick+100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 giver.alive=false;
 waitTurn(s);
 assert.equal(s.quests[0]!.status,'failed');
 assert.ok(s.log.some(entry=>entry.text.includes('ha fracasado')&&entry.text.includes('ha muerto')));
 assert.equal(relation.trust,42);
 assert.equal(relation.respect,35);
 assert.equal(relation.resentment,18);
 waitTurn(s);
 assert.equal(s.log.filter(entry=>entry.text.includes('ha fracasado')).length,1);
});

test('un encargo ofrecido pero no aceptado no fracasa automáticamente por la muerte del NPC',()=>{
 const s=generateWorld(902),giver=s.actors[0]!;
 s.quests.push({id:'quest-offered',giverId:giver.id,missionId:giver.lifeMission.id,title:'Un encargo',description:'Descripción',objective:'Objetivo',requirements:[],reward:'Nada',status:'offered',offeredAtTick:s.tick,acceptedAtTick:null,deadlineTick:s.tick+100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 giver.alive=false;
 waitTurn(s);
 assert.equal(s.quests[0]!.status,'offered');
 assert.equal(s.log.some(entry=>entry.text.includes('ha fracasado')) ,false);
});

test('un encargo aceptado fracasa al vencer su propio plazo y deja consecuencias sociales',()=>{
 const s=generateWorld(903),giver=s.actors[0]!;
 const relation=giver.social.relationships.player!;
 relation.trust=50;relation.respect=40;relation.resentment=10;
 s.quests.push({id:'quest-expired',giverId:giver.id,missionId:giver.lifeMission.id,title:'Llegar a tiempo',description:'Descripción',objective:'Objetivo',requirements:[],reward:'Nada',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 waitTurn(s);
 assert.equal(s.quests[0]!.status,'failed');
 assert.ok(s.log.some(entry=>entry.text.includes('dejaste vencer el plazo')));
 assert.equal(relation.trust,42);assert.equal(relation.respect,35);assert.ok(relation.resentment>=17.9&&relation.resentment<=18);
});

test('un encargo solo se completa con evidencia inspeccionada y un informe al NPC',()=>{
 const s=generateWorld(904),giver=s.actors[0]!,subject=s.actors[1]!;
 s.player.x=giver.x;s.player.y=giver.y+1;
 subject.x=giver.x+1;subject.y=giver.y+1;
 const relation=giver.social.relationships.player!;
 relation.trust=30;relation.respect=20;relation.debt=0;
 const missionProgress=giver.lifeMission.progress;
 s.quests.push({id:'quest-report',giverId:giver.id,missionId:giver.lifeMission.id,title:'Investigar actividad',description:'Investiga una situación',objective:'Investiga la situación y vuelve con una observación comprobable.',requirements:[],reward:'Confianza',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick+100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 selectActor(s,giver.id);talk(s,'te cuento lo que vi');
 assert.equal(s.quests[0]!.status,'accepted','una afirmación sin evidencia no completa el encargo');
 selectActor(s,subject.id);inspect(s);
 assert.equal(s.quests[0]!.progress,1);
 assert.equal(s.quests[0]!.evidence,'actor:'+subject.id);
 selectActor(s,giver.id);talk(s,'te cuento lo que vi');
 assert.equal(s.quests[0]!.status,'completed');
 assert.equal(giver.lifeMission.progress,missionProgress+1);
 assert.ok(relation.trust>=38);
 assert.ok(s.log.some(entry=>entry.text.includes('Encargo completado')));
});

test('la evidencia no puede obtenerse inspeccionando únicamente al NPC que encargó la misión',()=>{
 const s=generateWorld(905),giver=s.actors[0]!;
 s.player.x=giver.x;s.player.y=giver.y+1;
 s.quests.push({id:'quest-self',giverId:giver.id,missionId:giver.lifeMission.id,title:'Investigar',description:'Prueba',objective:'Investiga y vuelve',requirements:[],reward:'Nada',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick+100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 selectActor(s,giver.id);inspect(s);
 assert.equal(s.quests[0]!.progress,0);
});

test('un encargo con evidencia se cierra al informar con lenguaje natural',()=>{
 const s=generateWorld(906),giver=s.actors[0]!;
 s.player.x=giver.x+1;s.player.y=giver.y;selectActor(s,giver.id);
 s.quests.push({id:'quest-report',giverId:giver.id,missionId:giver.lifeMission.id,title:'Limpiar el acceso',description:'Retira los escombros',objective:'Despeja el acceso y vuelve a informar',requirements:[],reward:'Información',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick+100,objectiveType:'clear_obstacle',progress:1,evidence:'cleared:2,2',requiredItemId:null});
 talk(s,'Te informo: ya terminé el encargo.');
 assert.equal(s.quests.find(q=>q.id==='quest-report')!.status,'completed');
 assert.ok(s.log.some(entry=>entry.text.includes('Encargo completado')&&entry.text.includes('Limpiar el acceso')));
});


test('el plazo de un encargo aceptado depende del reloj del mundo, no de los turnos',()=>{
 const s=generateWorld(904),giver=s.actors[0]!;
 s.quests.push({id:'quest-clock',giverId:giver.id,missionId:giver.lifeMission.id,title:'Llegar a tiempo',description:'Descripción',objective:'Objetivo',requirements:[],reward:'Nada',status:'accepted',offeredAtTick:s.tick,acceptedAtTick:s.tick,deadlineTick:s.tick+1,deadlineWorldMinute:20,acceptedAtWorldMinute:0,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 for(let i=0;i<10;i++)waitTurn(s);
 assert.equal(s.quests[0]!.status,'accepted','muchos turnos no deben vencer el encargo si el reloj no avanzó');
 s.elapsedWorldMs=21*60000;
 waitTurn(s);
 assert.equal(s.quests[0]!.status,'failed','el encargo debe fracasar al superar su minuto límite aunque no se hayan acumulado turnos equivalentes');
});
