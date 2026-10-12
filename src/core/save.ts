import type {WorldState} from './types.ts';

export const SAVE_VERSION=1;
export const SAVE_STORAGE_KEY='dysto.save.v1';
export interface SaveEnvelope {version:number;savedAt:string;state:WorldState;}

export function encodeSave(state:WorldState, savedAt=new Date().toISOString()):string {
 return JSON.stringify({version:SAVE_VERSION,savedAt,state} satisfies SaveEnvelope);
}

export function decodeSave(serialized:string):WorldState {
 const parsed:unknown=JSON.parse(serialized);
 if(!parsed||typeof parsed!=='object')throw new Error('El archivo de guardado no es válido.');
 const envelope=parsed as Partial<SaveEnvelope>;
 if(envelope.version!==SAVE_VERSION)throw new Error('Versión de guardado incompatible.');
 if(!envelope.state||typeof envelope.state!=='object')throw new Error('El guardado no contiene una partida.');
 const state=envelope.state as WorldState;
 if(!Number.isInteger(state.seed)||!Number.isInteger(state.width)||!Number.isInteger(state.height)||!Array.isArray(state.tiles)||!Array.isArray(state.actors)||!Array.isArray(state.quests)||!Array.isArray(state.log)||!state.player||!Array.isArray(state.player.inventory))throw new Error('La estructura de la partida está incompleta.');
 for(const actor of state.actors){
  if(!actor||typeof actor.id!=='string'||!actor.social||!Array.isArray(actor.social.memories)||!Array.isArray(actor.social.knowledge)||!actor.social.relationships||!actor.mind||!actor.lifeMission)throw new Error('El guardado contiene un personaje incompleto.');
 }
 return state;
}
