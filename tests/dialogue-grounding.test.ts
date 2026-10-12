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


test('el contexto de diálogo admite transcripción e inventario reales del NPC',()=>{
 const withState={...context,conversationHistory:['Tú: cuchillo','Bautista: Tengo una hoja de sierra.'],npcInventory:['hoja de sierra x1 [id=saw]']};
 const messages=buildDialogueMessages(withState);const system=messages.map(message=>message.content).join('\n');
 assert.match(system,/TRANSCRIPCIÓN RECIENTE/);
 assert.match(system,/Bautista: Tengo una hoja de sierra/);
 assert.match(system,/INVENTARIO DEL NPC/);
 assert.match(system,/hoja de sierra x1/);
});

test('evita fragmentos mezclados y amenazas desproporcionadas tras un insulto',()=>{
 assert.match(validateNpcLineGrounding('Andaba Toward the garaje.',context),/me mezclaron las palabras/i);
 assert.equal(validateNpcLineGrounding('Si seguís con eso te arranco la cabeza.',{...context,playerLine:'imbecil'}),'No me hables así. Si querés seguir, hablame claro.');
});
