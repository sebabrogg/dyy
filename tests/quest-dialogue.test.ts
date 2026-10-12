import test from 'node:test';
import assert from 'node:assert/strict';
import type {NpcQuest} from '../src/core/types.ts';
import {fallbackNpcReply,resolveQuestFollowup,sanitizeNpcLine} from '../src/core/quest-dialogue.ts';

const quest=(status:'offered'|'accepted'='accepted'):NpcQuest=>({id:'q-1',giverId:'vera',missionId:'m-1',title:'Encontrar a Negro Barrientos',description:'Averiguar dónde está Negro Barrientos',objective:'Preguntar en el puesto de trueque por Negro Barrientos',requirements:[],reward:'Información',status,offeredAtTick:2,acceptedAtTick:status==='accepted'?3:null,deadlineTick:100,objectiveType:'investigate_and_report',progress:0,evidence:null,requiredItemId:null});

test('las preguntas sobre un encargo recuperan el mismo objetivo aceptado',()=>{
 const q=quest();
 const reply=resolveQuestFollowup('¿sigue en pie el encargo?', [q], 'vera');
 assert.ok(reply?.includes(q.title));assert.ok(reply?.includes(q.objective));assert.ok(reply?.includes('aceptado'));
 assert.equal(resolveQuestFollowup('¿por qué ya no me aparece el encargo?', [q], 'vera')?.includes(q.title),true);
 assert.equal(resolveQuestFollowup('porque ya no me aparece', [q], 'vera')?.includes(q.title),true);
});

test('una propuesta pendiente no se presenta como aceptada',()=>{
 const q=quest('offered');
 const reply=resolveQuestFollowup('¿sigue en pie el encargo?', [q], 'vera');
 assert.ok(reply?.includes('pendiente'));assert.ok(reply?.includes(q.title));
});

test('no se inventa un encargo si no hay ninguno pendiente',()=>{
 const reply=fallbackNpcReply('¿sigue en pie el encargo?', [], 'vera');
 assert.match(reply,/ningún encargo.*registrado/i);
 assert.equal(resolveQuestFollowup('hola', [], 'vera'),null);
});

test('la limpieza elimina fuga de contexto y respuestas rotas',()=>{
 assert.equal(sanitizeNpcLine('Quedó en el aire.863 metros, decime el número así lo busco.'),'Quedó en el aire.');
 assert.equal(sanitizeNpcLine('Podemos revisar eso 分配 mañana.'),'Podemos revisar eso mañana.');
 assert.equal(sanitizeNpcLine('No consigo responder ahora.'),'');
});
