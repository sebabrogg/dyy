import type {Actor, SocialEventKind, SocialMemory, SocialRelationship} from './types.ts';

export interface SocialEvent {
  kind: SocialEventKind;
  targetId: string;
  tick: number;
  severity?: number;
  public?: boolean;
  description: string;
  interpretation?: string;
  sincerity?: number;
  repairEffort?: number;
}

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const relation=(actor:Actor,targetId:string):SocialRelationship=>{
  const current=actor.social.relationships[targetId];
  if(current)return current;
  const initial:SocialRelationship={affection:0,trust:actor.trust,respect:25,resentment:0,fear:0,debt:0,hostility:actor.disposition==='hostile'?45:actor.disposition==='wary'?15:0};
  actor.social.relationships[targetId]=initial;
  return initial;
};

export function recordSocialEvent(actor:Actor,event:SocialEvent):SocialMemory {
  const traits=actor.social.traits;
  const r=relation(actor,event.targetId);
  const severity=clamp(event.severity??10,1,100);
  const publicMultiplier=event.public?1+traits.pride/200:1;
  const id=`${actor.id}:${event.targetId}:${event.tick}:${event.kind}:${actor.social.memories.length}`;
  const memory:SocialMemory={
    id,targetId:event.targetId,tick:event.tick,kind:event.kind,severity,
    salience:clamp(severity*(.45+traits.susceptibility/180)*publicMultiplier),
    decayPerDay:Math.max(.1,2.4*(1-traits.grudge/125)),
    public:event.public??false,
    description:event.description,
    interpretation:event.interpretation??'uncertain'
  };
  actor.social.memories.push(memory);
  if(actor.social.memories.length>80)actor.social.memories.shift();

  switch(event.kind){
    case 'insult': {
      const impact=severity*(.45+traits.susceptibility/160)*publicMultiplier;
      r.resentment=clamp(r.resentment+impact*(.65+traits.grudge/180));
      r.respect=clamp(r.respect-impact*(.35+traits.pride/180));
      r.hostility=clamp(r.hostility+impact*(.35+traits.reactivity/150));
      break;
    }
    case 'threat':
      r.fear=clamp(r.fear+severity*(.45+traits.reactivity/160));
      r.resentment=clamp(r.resentment+severity*(.25+traits.grudge/180));
      r.hostility=clamp(r.hostility+severity*(.35+traits.reactivity/130));
      break;
    case 'betrayal':
      r.resentment=clamp(r.resentment+severity*(.9+traits.grudge/100));
      r.trust=clamp(r.trust-severity*(.65+traits.susceptibility/150));
      r.hostility=clamp(r.hostility+severity*(.45+traits.vengefulness/140));
      r.respect=clamp(r.respect-severity*.4);
      break;
    case 'help':
      r.debt=clamp(r.debt+severity*.45);
      if(r.hostility<65)r.trust=clamp(r.trust+severity*.12);
      break;
    case 'saved':
      r.debt=clamp(r.debt+severity*.7);
      r.trust=clamp(r.trust+severity*.2);
      r.affection=clamp(r.affection+severity*.12);
      // Saving someone does not erase prior harm or guarantee forgiveness.
      break;
    case 'apology': {
      const sincerity=clamp(event.sincerity??0)/100;
      const repair=clamp(event.repairEffort??0)/100;
      const reduction=severity*sincerity*(.15+repair*.85)*(0.35+traits.reconciliation/150);
      r.resentment=clamp(r.resentment-reduction);
      r.trust=clamp(r.trust+severity*sincerity*repair*.18);
      break;
    }
    case 'conversation':
      break;
  }
  actor.trust=r.trust;
  return memory;
}

export function ageSocialMemories(actor:Actor,tick:number):void {
  const elapsedTicks=Math.max(0,tick-actor.social.lastAgedTick);
  const elapsedDays=elapsedTicks/288;
  if(elapsedDays>0){
    const forgetting=(1-actor.social.traits.grudge/100)*(.5+actor.social.traits.reconciliation/100)*.18*elapsedDays;
    for(const r of Object.values(actor.social.relationships))r.resentment=clamp(r.resentment-forgetting);
    actor.social.lastAgedTick=tick;
  }
  for(const memory of actor.social.memories){
    const ageDays=Math.max(0,tick-memory.tick)/288;
    memory.salience=clamp(memory.severity*(.45+actor.social.traits.susceptibility/180)*(memory.public?1+actor.social.traits.pride/200:1)-ageDays*memory.decayPerDay);
  }
}

export function classifyUtterance(text:string):{kind:SocialEventKind;severity:number;description:string}|null {
  const t=text.toLocaleLowerCase('es');
  if(/\b(perd[oó]n|lo siento|me equivoqu[eé]|fue mi culpa|te pido disculpas|disculpame|disc[uú]lpame)\b/.test(t))return {kind:'apology',severity:10,description:text.trim()};
  if(/\b(te voy a matar|te mato|te rompo|te voy a hacer|amenaz|vas a pagar|te arrepentir[aá]s)\b/.test(t))return {kind:'threat',severity:16,description:text.trim()};
  if(/\b(traidor|traidora|hijo de puta|hija de puta|imb[eé]cil|idiota|in[uú]til|basura|mierda|cobarde|est[uú]pido|est[uú]pida)\b/.test(t))return {kind:'insult',severity:10,description:text.trim()};
  return null;
}

export function shouldAttack(actor:Actor,targetId='player',perceivedThreat=0,relativeStrength=0):boolean {
  const r=relation(actor,targetId),traits=actor.social.traits;
  const motive=Math.max(r.hostility,r.resentment*.85)+traits.vengefulness*.25+perceivedThreat*.45;
  const inhibition=traits.selfControl*.35+r.fear*.3+relativeStrength*.25;
  return motive-inhibition>=62;
}

export function relationshipTo(actor:Actor,targetId='player'):SocialRelationship {
  return {...relation(actor,targetId)};
}

export function summarizeRelationship(actor:Actor,targetId='player'):string {
  const r=relation(actor,targetId);
  if(r.hostility>=75||r.resentment>=82)return 'te odia o considera que hay agravios graves pendientes';
  if(r.hostility>=45)return 'te considera una amenaza o mantiene una hostilidad marcada';
  if(r.trust<20)return 'desconfía de vos';
  if(r.trust>=65&&r.affection>=35)return 'te aprecia y confía bastante en vos';
  if(r.debt>=35&&r.hostility>25)return 'te debe algo, pero mantiene su hostilidad';
  return 'mantiene una relación ambigua o distante';
}

import {distance,indexOf,type WorldState,type SocialKnowledge} from './types.ts';

export interface ObservedSocialEvent {
  eventId:string;
  sourceId:string;
  targetId:string;
  kind:SocialEventKind;
  tick:number;
  severity:number;
  description:string;
  public?:boolean;
}

const OPAQUE=new Set(['wall','building']);
function hasLineOfSight(world:WorldState,from:{x:number;y:number},to:{x:number;y:number}):boolean{
  const dx=to.x-from.x,dy=to.y-from.y,steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(steps<=1)return true;
  for(let i=1;i<steps;i++){
    const x=Math.round(from.x+dx*i/steps),y=Math.round(from.y+dy*i/steps);
    const tile=world.tiles[indexOf(x,y,world.width)];
    if(tile&&OPAQUE.has(tile.terrain))return false;
  }
  return true;
}
function stableHash(value:string):number{
  let h=2166136261;
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function rememberKnowledge(actor:Actor,entry:SocialKnowledge):boolean{
  if(actor.social.knowledge.some(k=>k.eventId===entry.eventId))return false;
  actor.social.knowledge.push(entry);
  if(actor.social.knowledge.length>120)actor.social.knowledge.shift();
  const polarity=entry.kind==='insult'||entry.kind==='threat'||entry.kind==='betrayal'?-1:entry.kind==='help'||entry.kind==='saved'?1:0;
  if(polarity){
    const previous=actor.social.reputation[entry.subjectId]??0;
    actor.social.reputation[entry.subjectId]=Math.max(-100,Math.min(100,previous+polarity*entry.confidence*(entry.kind==='betrayal'?1.2:0.7)));
  }
  return true;
}

/** Record only actors who could plausibly perceive both sides of an event. No omniscient world broadcast. */
export function recordObservedSocialEvent(world:WorldState,event:ObservedSocialEvent):string[]{
  const sourceActor=world.actors.find(a=>a.id===event.sourceId);
  const sourcePosition=event.sourceId==='player'?world.player:sourceActor;
  const target=world.actors.find(a=>a.id===event.targetId);
  if(!sourcePosition||!target)return [];
  const witnesses:string[]=[];
  for(const observer of world.actors){
    if(!observer.alive||observer.id===sourceActor?.id||observer.id===target.id)continue;
    if(distance(observer,sourcePosition)>5||distance(observer,target)>5)continue;
    if(!hasLineOfSight(world,observer,sourcePosition)||!hasLineOfSight(world,observer,target))continue;
    const loyalty=observer.faction===target.faction?8:0;
    const bias=(observer.social.traits.susceptibility-50)*.18+loyalty;
    const interpretation=bias>8?'lo interpreta como una ofensa grave':bias< -5?'cree que el conflicto está exagerado':'no conoce toda la historia';
    const entry:SocialKnowledge={eventId:event.eventId,subjectId:event.sourceId,targetId:event.targetId,kind:event.kind,tick:event.tick,confidence:Math.max(35,Math.min(98,82+bias)),source:'witness',interpretation,hops:0};
    if(rememberKnowledge(observer,entry))witnesses.push(observer.id);
  }
  return witnesses;
}

/** Share one known event with one existing contact. Rumors lose confidence and can be interpreted through the teller's bias. */
export function shareSocialRumor(world:WorldState,fromId:string,toId:string,eventId:string):boolean{
  const from=world.actors.find(a=>a.id===fromId),to=world.actors.find(a=>a.id===toId);
  if(!from||!to||!from.alive||!to.alive||fromId===toId)return false;
  const strength=from.social.contacts[toId]??0;
  if(strength<35||distance(from,to)>8)return false;
  const known=from.social.knowledge.find(k=>k.eventId===eventId);
  if(!known||known.hops>=2||to.social.knowledge.some(k=>k.eventId===eventId))return false;
  const hash=stableHash(eventId+'|'+fromId+'|'+toId);
  if(hash%100>=strength)return false;
  const distortion=((hash>>>8)%21)-10;
  const confidence=Math.max(10,Math.min(85,Math.round(known.confidence*.72+distortion)));
  const bias=to.social.traits.susceptibility>65?'lo cree sin conocer todos los detalles':to.social.traits.susceptibility<30?'desconfía del rumor':'lo considera posible, no confirmado';
  return rememberKnowledge(to,{...known,confidence,source:'rumor',interpretation:bias,hops:known.hops+1});
}
