import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDialogueMessages,cleanNpcLine,latestNpcDialogue,type DialogueContext} from '../src/ai/local-dialogue.ts';
import type {LogEntry} from '../src/core/types.ts';

const context:DialogueContext={
 actorName:'Marta',faction:'UAC',personality:'desconfiada y orgullosa',
 goal:'proteger el puesto de control',disposition:'hostile',
 relationship:'confianza 10/100; hostilidad 80/100',memories:['el jugador la insultó'],
 playerLine:'Ayudame.',engineLine:'No tengo nada que hablar con vos. Andate.',
};

test('el prompt limita al modelo a expresar una intención ya decidida por el motor',()=>{
 const messages=buildDialogueMessages(context);
 assert.equal(messages.length,2);
 assert.match(messages[0]!.content,/No cambies el significado/);
 assert.match(messages[0]!.content,/No inventes hechos/);
 assert.match(messages[1]!.content,/INTENCIÓN QUE DEBES CONSERVAR/);
 assert.match(messages[1]!.content,/Marta/);
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
