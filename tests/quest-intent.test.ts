import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWorkIntent} from '../src/core/quest-intent.ts';

test('entiende preguntas naturales sobre encargos con distintos sinónimos',()=>{
  for(const line of ['¿Tenés algún encargo para mí?','¿Tienes algún recado?','¿Hay algún mandado que pueda hacer?','¿Necesitás que te dé una mano con algo?','¿Buscás a alguien para hacer un trabajo?','¿Querés que haga algo por vos?','¿Qué necesitás de mí?']) assert.equal(classifyWorkIntent(line),'ask_for_work',line);
});

test('reconoce ofertas de ayuda sin exigir la palabra encargo',()=>{
  for(const line of ['Te ayudo con eso','¿Querés que te ayude?','Te puedo dar una mano','Puedo ayudarte']) assert.notEqual(classifyWorkIntent(line),'other',line);
});

test('una palabra suelta como encargo es ambigua y no dispara una oferta',()=>{
  assert.equal(classifyWorkIntent('encargo'),'ambiguous');
  assert.equal(classifyWorkIntent('recado'),'ambiguous');
  assert.equal(classifyWorkIntent('hola'),'other');
});
