import test from 'node:test';
import assert from 'node:assert/strict';
import {GRUTA_QUEST_CATALOG,matchGrutaQuestSeed} from '../src/core/quest-catalog.ts';

test('Gruta narrative catalog contains the 100 seeds in the design document',()=>{
 assert.equal(GRUTA_QUEST_CATALOG.length,100);
 assert.deepEqual([...new Set(GRUTA_QUEST_CATALOG.map(q=>q.domain))].sort(),['community','crisis','exploration','geopolitics','psycholink','survival','synthetics','trade']);
 assert.equal(new Set(GRUTA_QUEST_CATALOG.map(q=>q.title)).size,100);
});

test('catalog matches concrete topic clues, not generic request wording',()=>{
 assert.equal(matchGrutaQuestSeed('fijate y avisame',42),null);
 assert.equal(matchGrutaQuestSeed('Necesito que averigües sobre las baterías del paciente',42)?.title,'Baterías prestadas');
 assert.equal(matchGrutaQuestSeed('investiga sobre la autonomía de los físicos',7)?.domain,'synthetics');
});

test('seed variation is deterministic for a world seed',()=>{
 assert.deepEqual(matchGrutaQuestSeed('agua generador piezas',123),matchGrutaQuestSeed('agua generador piezas',123));
});
