import test from 'node:test';
import assert from 'node:assert/strict';
import {respondToIntent} from '../src/core/engine.ts';

test('respuestas deterministas distinguen pedir ayuda, saludar y preguntar cómo está', () => {
  const help = respondToIntent('ayuda', 'Ivo Salcedo', 'neutral');
  const greeting = respondToIntent('hola', 'Ivo Salcedo', 'neutral');
  const wellbeing = respondToIntent('como estás?', 'Ivo Salcedo', 'neutral');
  assert.notEqual(help, greeting);
  assert.notEqual(help, wellbeing);
  assert.notEqual(greeting, wellbeing);
  assert.match(help, /necesitás/i);
  assert.match(wellbeing, /días peores/i);
});

test('la intención se detecta con tildes y las respuestas cambian con la disposición', () => {
  const neutral = respondToIntent('¿Cómo estás?', 'Ivo Salcedo', 'neutral');
  const hostile = respondToIntent('¿Cómo estás?', 'Ivo Salcedo', 'hostile');
  assert.match(neutral, /días peores/i);
  assert.match(hostile, /qué te importa/i);
  assert.notEqual(neutral, hostile);
});

import {classifyUtterance} from '../src/core/social.ts';

test('el clasificador reconoce desafíos y amenazas en español con y sin tildes', () => {
  for (const phrase of ['mátame si tienes huevos', 'matame si tenes huevos', 'te voy a matar', 'te vas a morir', 'te parto la cara']) {
    assert.equal(classifyUtterance(phrase)?.kind, 'threat', phrase);
  }
});
