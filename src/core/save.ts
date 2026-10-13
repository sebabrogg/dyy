import type {WorldState} from './types.ts';
import {hydrateItem} from './items.ts';
import {ensureWorldCommunities,initializeWorldStories} from './world-stories.ts';

export const SAVE_VERSION=6;
export const SAVE_STORAGE_KEY='dysto.save.v1';
export interface SaveEnvelope {version:number;savedAt:string;state:WorldState;}

export function encodeSave(state:WorldState, savedAt=new Date().toISOString()):string {
 return JSON.stringify({version:SAVE_VERSION,savedAt,state} satisfies SaveEnvelope);
}

export function decodeSave(serialized:string):WorldState {
 const parsed:unknown=JSON.parse(serialized);
 if(!parsed||typeof parsed!=='object')throw new Error('El archivo de guardado no es válido.');
 const envelope=parsed as Partial<SaveEnvelope>;
 if(envelope.version!==1&&envelope.version!==2&&envelope.version!==3&&envelope.version!==4&&envelope.version!==5&&envelope.version!==SAVE_VERSION)throw new Error('Versión de guardado incompatible.');
 if(!envelope.state||typeof envelope.state!=='object')throw new Error('El guardado no contiene una partida.');
 const state=envelope.state as WorldState;
 if(!Number.isInteger(state.seed)||!Number.isInteger(state.width)||!Number.isInteger(state.height)||!Array.isArray(state.tiles)||!Array.isArray(state.actors)||!Array.isArray(state.quests)||!Array.isArray(state.log)||!state.player||!Array.isArray(state.player.inventory))throw new Error('La estructura de la partida está incompleta.');
 state.player.progression??={generalXp:0,generalLevel:0,skills:{},unlockedSpecializations:[],knowledge:[],lastAutonomousPracticeMinute:0};if(!Number.isFinite(state.player.progression.generalLevel))state.player.progression.generalLevel=0;state.player.storyFlags??={};state.player.knownFacts??=[];if(!Number.isFinite(state.player.credits))state.player.credits=126;if(!Number.isFinite(state.player.carryCapacity))state.player.carryCapacity=30;if(!Number.isFinite(state.player.hydration))state.player.hydration=70;if(!Array.isArray(state.groundItems))state.groundItems=[];
 for(const item of state.player.inventory)hydrateItem(item);
 for(const actor of state.actors){actor.progression??={generalXp:0,generalLevel:0,skills:{},unlockedSpecializations:[],knowledge:[],lastAutonomousPracticeMinute:0};if(!Number.isFinite(actor.progression.generalLevel))actor.progression.generalLevel=0;actor.storyFlags??={};actor.knownFacts??=[];if(!Number.isFinite(actor.credits))actor.credits=30;if(!Array.isArray(actor.inventory))actor.inventory=[];for(const item of actor.inventory)hydrateItem(item);}
 for(const quest of state.quests){
  if(!quest.objectiveType)quest.objectiveType='investigate_and_report';
  if(!('requiredItemId' in (quest as unknown as Record<string,unknown>)))quest.requiredItemId=quest.objectiveType==='deliver_item'?'scrap':null;
  if(!Number.isFinite(quest.progress))quest.progress=0;
  if(typeof quest.evidence!=='string')quest.evidence=null;
  if(!Number.isFinite(quest.deadlineTick)){
   const base=quest.status==='accepted'&&Number.isFinite(quest.acceptedAtTick)?Math.max(state.tick,quest.acceptedAtTick!):quest.offeredAtTick;
   quest.deadlineTick=base+120+(Array.isArray(quest.requirements)?quest.requirements.length:0)*24;
  }
 }
 for(const actor of state.actors){
  if(!actor||typeof actor.id!=='string'||!actor.social||!Array.isArray(actor.social.memories)||!Array.isArray(actor.social.knowledge)||!actor.social.relationships||!actor.mind||!actor.lifeMission)throw new Error('El guardado contiene un personaje incompleto.');
 }
 ensureWorldCommunities(state);initializeWorldStories(state);
 return state;
}
