import test from 'node:test';
import assert from 'node:assert/strict';
import {applyQuestPresentation,fallbackQuestPresentation,generateQuestPresentation} from '../src/ai/quest-presentation.ts';
import {generateWorld} from '../src/world/generate.ts';
import {registerQuestFromDialogue} from '../src/core/quest-offers.ts';

test('fallback presentation remains grounded in the NPC request and engine objective',()=>{const result=fallbackQuestPresentation('Fijate si alguien entra al tanque de cloración y avisame.','Luz Silveira','Volvé con Luz y contale qué averiguaste.');assert.match(result.title,/alguien entra al tanque/i);assert.match(result.summary,/Luz Silveira pidió/);assert.match(result.summary,/Volvé con Luz/);assert.match(result.summary,/no se consideran hechos confirmados/);});
test('model output is generated as presentation only and cannot modify engine objective or reward',async()=>{const world=generateWorld(222),actor=world.actors.find(a=>a.alive)!;const quest=registerQuestFromDialogue(world,actor.id,'Fijate si alguien entra al tanque de cloración y avisame.');assert.ok(quest);const originalObjective=quest.objective,originalReward=quest.reward;const encoder=new TextEncoder();const fakeFetch:typeof fetch=async(input,init)=>{if(String(input).endsWith('/health'))return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});const body=JSON.parse(String(init?.body));assert.equal(body.messages[1].role,'user');assert.equal(body.messages[1].content.includes(quest.requestText!),true);return new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode(JSON.stringify({message:{content:JSON.stringify({title:'El tanque después del cierre',summary:'Luz sospecha que alguien entra al tanque durante cierto horario. Como la vigilan, pide que observes el lugar y vuelvas con lo que realmente descubras.'})},done:false})+'\n'));controller.enqueue(encoder.encode(JSON.stringify({message:{content:''},done:true})+'\n'));controller.close();}}),{status:200});};const presentation=await generateQuestPresentation(quest,actor,{endpoint:'http://test/api/chat',fetcher:fakeFetch});applyQuestPresentation(quest,presentation);assert.equal(quest.title,'El tanque después del cierre');assert.equal(quest.objective,originalObjective);assert.equal(quest.reward,originalReward);assert.equal(quest.presentationGenerated,true);});
test('AI unavailable returns a deterministic fallback instead of losing the quest',async()=>{const world=generateWorld(223),actor=world.actors.find(a=>a.alive)!;const quest=registerQuestFromDialogue(world,actor.id,'Fijate si escuchás algo del agua y avisame.');assert.ok(quest);const result=await generateQuestPresentation(quest,actor,{endpoint:'http://test/api/chat',fetcher:async()=>{throw new Error('offline');}});assert.ok(result.title.length>2);assert.ok(result.summary.includes(quest.requestText!));});
test('presentation prompt never receives private goals or undiscovered target coordinates',async()=>{
 const world=generateWorld(224),actor=world.actors.find(a=>a.alive)!;
 const quest=registerQuestFromDialogue(world,actor.id,'Fijate si escuchás algo del agua y avisame.');assert.ok(quest);
 quest.targetX=14;quest.targetY=19;quest.targetDiscovered=false;
 let prompt='';const encoder=new TextEncoder();
 const fakeFetch:typeof fetch=async(input,init)=>{
  if(String(input).endsWith('/health'))return new Response(JSON.stringify({ok:true}),{status:200});
  prompt=String(init?.body);
  const chunk=JSON.stringify({message:{content:JSON.stringify({title:'Averiguar qué pasa con el agua',summary:'Pide que escuches información sobre el agua y vuelvas a contarle lo que sepas, sin dar por cierta ninguna sospecha.'})},done:true})+'\n';
  return new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode(chunk));controller.close();}}),{status:200});
 };
 await generateQuestPresentation(quest,actor,{endpoint:'http://test/api/chat',fetcher:fakeFetch});
 const userMessage=JSON.parse(prompt).messages[1].content;
 assert.ok(userMessage.includes(quest.requestText!));assert.ok(!userMessage.includes(actor.goal));
 assert.ok(!userMessage.includes('"x":14'));assert.ok(!userMessage.includes('"y":19'));
});
