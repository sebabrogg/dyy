import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDialogueMessages,cleanNpcLine,latestNpcDialogue,type DialogueContext} from '../src/ai/local-dialogue.ts';
import type {LogEntry} from '../src/core/types.ts';

const context:DialogueContext={
 actorName:'Marta',faction:'UAC',personality:'desconfiada y orgullosa',
 goal:'proteger el puesto de control',disposition:'hostile',
 relationship:'confianza 10/100; hostilidad 80/100',memories:['el jugador la insultó'],
 playerLine:'Ayudame.',engineLine:'',internalMind:'{\"trauma\":[],\"traits\":{}}',lifeMission:'{\"title\":\"proteger el puesto\"}',
};

test('el prompt deja decidir al modelo desde la mente interna sin respuesta prefabricada',()=>{
 const messages=buildDialogueMessages(context);
 assert.equal(messages.length,2);
 assert.match(messages[0]!.content,/No hay respuesta base ni diálogo prefabricado/);
 assert.match(messages[0]!.content,/No afirmes como hechos/);
 assert.match(messages[1]!.content,/CONTEXTO MENTAL INTERNO/);
 assert.match(messages[1]!.content,/MISIÓN VITAL PRIVADA/);
 assert.match(messages[0]!.content,/no un asistente que intenta complacer/);
 assert.match(messages[0]!.content,/No tienes acceso omnisciente/);
 assert.match(messages[1]!.content,/IDENTIDAD Y LÍMITES DE CONOCIMIENTO SOBRE EL JUGADOR/);
 assert.match(messages[1]!.content,/no conozco automáticamente su nombre ni su historia/);
 assert.match(messages[1]!.content,/CONOCIMIENTO Y RUMORES SOBRE EL JUGADOR/);
 assert.match(messages[1]!.content,/Marta/);
 assert.match(messages[1]!.content,/RESULTADO REAL DEL MOTOR/);
});

test('limpia envoltorios y limita la longitud de la línea del NPC',()=>{
 assert.equal(cleanNpcLine('  «No confío en vos.»  '),'No confío en vos.');
 assert.equal(cleanNpcLine('<think>razonamiento privado</think> No.   Andate.'),'No. Andate.');
 assert.equal(cleanNpcLine('Respuesta: No.'),'No.');
 assert.equal(cleanNpcLine('x'.repeat(400)).length,320);
});

test('encuentra solo la respuesta más reciente del NPC y no la del jugador',()=>{
 const npc:LogEntry={tick:1,text:'Marta: «No.»',kind:'dialogue'};
 const player:LogEntry={tick:2,text:'Tú: «Bueno.»',kind:'dialogue'};
 assert.equal(latestNpcDialogue([npc,player],'Marta'),undefined);
 assert.equal(latestNpcDialogue([npc],'Marta'),npc);
});

test('consume respuestas NDJSON en streaming y solo publica la respuesta final validada',async()=>{
 const chunks=[
  '{"message":{"content":"No "},"done":false}\n',
  '{"message":{"content":"confío en vos."},"done":false}\n',
  '{"message":{"content":""},"done":true}\n',
 ];
 const encoder=new TextEncoder();
 const oldFetch=globalThis.fetch;
 let chatContentType='';
 globalThis.fetch=async(input,init)=>{
  if(String(input).endsWith('/health'))return new Response(JSON.stringify({ok:true,models:['qwen2.5:3b']}),{status:200,headers:{'Content-Type':'application/json'}});
  chatContentType=new Headers(init?.headers).get('Content-Type')||'';
  return new Response(new ReadableStream({
   start(controller){for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));controller.close();}
  }),{status:200,headers:{'Content-Type':'application/x-ndjson'}});
 };
 try {
  const {generateLocalNpcLine}=await import('../src/ai/local-dialogue.ts');
  const partials:string[]=[];
  const result=await generateLocalNpcLine(context,{onPartial:value=>partials.push(value)});
  assert.equal(result,'No confío en vos.');
  assert.equal(chatContentType,'text/plain;charset=UTF-8');
  assert.deepEqual(partials,['No confío en vos.']);
 } finally {globalThis.fetch=oldFetch;}
});


test('termina al recibir done=true aunque el puente no cierre el stream',async()=>{
 const encoder=new TextEncoder();
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  if(String(input).endsWith('/health'))return new Response(JSON.stringify({ok:true,models:['qwen2.5:3b']}),{status:200,headers:{'Content-Type':'application/json'}});
  return new Response(new ReadableStream({
   start(controller){controller.enqueue(encoder.encode('{"message":{"content":"Estoy ocupado."},"done":false}\n{"message":{"content":""},"done":true}\n'));}
  }),{status:200,headers:{'Content-Type':'application/x-ndjson'}});
 };
 try {
  const {generateLocalNpcLine}=await import('../src/ai/local-dialogue.ts');
  const result=await Promise.race([
   generateLocalNpcLine(context),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('el stream no terminó')),500))
  ]);
  assert.equal(result,'Estoy ocupado.');
 } finally {globalThis.fetch=oldFetch;}
});

test('el diálogo elimina acciones entre asteriscos y evita gestos repetidos',()=>{assert.equal(cleanNpcLine('*se encoge de hombros* No sé. *se encoge de hombros*'),'No sé.');});
