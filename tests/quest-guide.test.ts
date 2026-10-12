import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeQuestConversation} from '../src/core/quest-guide.ts';
import {generateWorld} from '../src/world/generate.ts';
import type {WorldState} from '../src/core/types.ts';

function fixture(seed:number):{state:WorldState;questId:string;actorId:string}{
 const state=generateWorld(seed),giver=state.actors[0]!,speaker=state.actors[1]!;
 const questId='quest-generator';state.quests.push({id:questId,giverId:giver.id,missionId:'mission-generator',title:'Conseguir piezas para el generador',description:'El generador del refugio necesita repuestos.',objective:'Encontrar piezas y volver a informar.',requirements:['piezas','generador'],reward:'confianza',status:'accepted',offeredAtTick:0,acceptedAtTick:0,deadlineTick:100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});
 return {state,questId,actorId:speaker.id};
}
function fakeModel(answer:Record<string,unknown>){const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({message:{role:'assistant',content:JSON.stringify(answer)},done:true})+'\n',{status:200,headers:{'Content-Type':'application/x-ndjson'}});return ()=>{globalThis.fetch=original;};}

test('la IA registra una pista relevante y solo acepta coordenadas de terreno real',async()=>{
 const {state,questId,actorId}=fixture(123);const location=state.locations!.find(item=>item.knownByActorIds.includes(actorId));assert.ok(location);const restore=fakeModel({questId,kind:'lead',summary:'El NPC afirma haber visto piezas cerca de '+location.name+'.',confidence:0.91,locationId:location.id,locationClaim:null});
 try{const changed=await analyzeQuestConversation(state,actorId,'¿Sabes algo de las piezas?','Vi piezas cerca de '+location.name.toLowerCase()+'.');assert.equal(changed.length,1);assert.equal(changed[0]!.guideEntries?.[0]?.kind,'lead');assert.equal(changed[0]!.targetX,location.x);assert.equal(changed[0]!.targetY,location.y);assert.equal(location.discovered,true);}finally{restore();}
});
test('una charla cotidiana no se registra como pista',async()=>{
 const {state,actorId}=fixture(456);const restore=fakeModel({questId:null,kind:'irrelevant',summary:'',confidence:0.99,locationId:null,locationClaim:null});
 try{const changed=await analyzeQuestConversation(state,actorId,'Hola, ¿cómo estás?','Estoy cansado.');assert.deepEqual(changed,[]);assert.equal(state.quests[0]!.guideEntries,undefined);}finally{restore();}
});
test('un lugar inventado no recibe coordenadas ni se convierte en destino',async()=>{
 const {state,questId,actorId}=fixture(789);const location=state.locations!.find(item=>item.knownByActorIds.includes(actorId))!;const restore=fakeModel({questId,kind:'lead',summary:'El NPC dice que vio piezas cerca de la clínica abandonada.',confidence:0.88,locationId:null,locationClaim:'clínica abandonada'});
 try{const changed=await analyzeQuestConversation(state,actorId,'¿Dónde hay piezas?','Vi piezas cerca de la clínica abandonada.');assert.equal(changed.length,1);assert.equal(changed[0]!.targetX,undefined);assert.equal(changed[0]!.targetDiscovered,undefined);assert.equal(location.discovered,false);assert.match(state.log.at(-1)!.text,/Ubicación no verificada/);}finally{restore();}
});

test('cada lugar nombrado existe sobre una puerta real y se genera de forma reproducible',()=>{const a=generateWorld(2468),b=generateWorld(2468);assert.ok((a.locations?.length??0)>0);assert.deepEqual(a.locations,b.locations);for(const location of a.locations??[]){assert.equal(a.tiles.find(t=>t.x===location.x&&t.y===location.y)?.terrain,'door');}});
