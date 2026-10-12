import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNpcLineGrounding,buildDialogueMessages,type DialogueContext} from '../src/ai/local-dialogue.ts';

const context:DialogueContext={actorName:'Mara',faction:'Gruta',personality:'Reservada',goal:'Sobrevivir',disposition:'neutral',relationship:'relación desconocida',memories:[],playerKnowledge:[],playerIdentity:'No conozco su identidad',observedPlayer:'Solo lo veo ahora',playerLine:'alguien me sigue',engineLine:'',internalMind:'{}',lifeMission:'{}',observedSurroundings:'Pasillo',socialContext:'Sin relaciones conocidas'};

test('rechaza historia compartida inventada cuando el NPC no tiene recuerdos',()=>{
 assert.match(validateNpcLineGrounding('¿Otra vez lo mismo? Ya te lo dije ayer.',context),/no tengo claro si ya hablamos/i);
 assert.match(validateNpcLineGrounding('Por eso mismo te pegué.',context),/no voy a inventar/i);
});

test('conserva diálogo normal sin fingir familiaridad',()=>{
 assert.equal(validateNpcLineGrounding('¿Qué pasó? Contame dónde lo viste.',context),'¿Qué pasó? Contame dónde lo viste.');
});

test('el prompt obliga a anclar pasado y agresiones en recuerdos',()=>{
 const system=buildDialogueMessages(context)[0]!.content;
 assert.match(system,/REGLA CRÍTICA DE CONTINUIDAD/);
 assert.match(system,/nunca afirmes que golpeaste, atacaste o amenazaste/);
});
