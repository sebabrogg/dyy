import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';

const root=process.cwd();
const read=(path:string)=>readFileSync(join(root,path),'utf8');

function sourceFiles(directory:string):string[]{
 const entries=readdirSync(join(root,directory),{withFileTypes:true});
 return entries.flatMap(entry=>{
  const path=join(directory,entry.name);
  if(entry.isDirectory())return sourceFiles(path);
  return /\.(ts|tsx|js|mjs|html)$/.test(entry.name)?[path]:[];
 });
}

test('GameDialog expone los cinco tipos previstos y mantiene cancelación explícita',()=>{
 const source=read('src/ui/game-dialog.ts');
 for(const method of ['info(','confirm(','input(','error(','toast('])assert.ok(source.includes(method),`Falta GameDialog.${method}`);
 assert.match(source,/options\.kind === 'confirm' \? false : options\.kind === 'input' \? null : undefined/);
 assert.match(source,/event\.key === 'Escape'/);
 assert.match(source,/if \(options\.kind !== 'error'\) timer = window\.setTimeout/);
 assert.match(source,/activeByKey\.get\(options\.dedupeKey\)/);
});

test('el código de la aplicación no invoca alert, confirm ni prompt nativos',()=>{
 const files=[...sourceFiles('src'),'index.html'];
 const nativeCall=/\bwindow\s*\.\s*(?:alert|confirm|prompt)\s*\(/;
 const bareNativeCall=/(?<![.\w$])(?:alert|confirm|prompt)\s*\(/;
 const matches=files.flatMap(path=>{
  const source=read(path);
  return source.split('\n').flatMap((line,index)=>{
   const isGameDialogMethod=path==='src/ui/game-dialog.ts'&&/^\s*confirm\s*\(/.test(line);
   const isGameDialogCall=/GameDialog\.(?:alert|confirm|prompt)\s*\(/.test(line);
   const isNative=nativeCall.test(line)||(bareNativeCall.test(line)&&!isGameDialogMethod&&!isGameDialogCall);
   return isNative?[`${relative(root,path)}:${index+1}: ${line.trim()}`]:[];
  });
 });
 assert.deepEqual(matches,[]);
});

test('el HTML no contiene identificadores duplicados',()=>{
 const html=read('index.html');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
 assert.deepEqual([...new Set(duplicates)],[]);
});

test('borrar un encargo requiere confirmación antes de mutar el estado',()=>{
 const source=read('src/main.ts');
 const start=source.indexOf('async function showDeleteQuestConfirmation');
 const end=source.indexOf("window.addEventListener('click',event=>{const rawTarget",start);
 assert.ok(start>=0&&end>start,'No se encuentra la confirmación de borrado');
 const handler=source.slice(start,end);
 assert.match(handler,/await GameDialog\.confirm/);
 assert.match(handler,/if\(!confirmed\)return/);
 assert.ok(handler.indexOf('if(!confirmed)return')<handler.indexOf('state\.quests=state\.quests\.filter'));
});
