import type {Actor,Disposition,SocialRelationship,SocialTraits} from './types.ts';

export type NpcIntent='threat'|'insult'|'apology'|'help'|'greeting'|'question'|'request'|'unknown';
export type NpcBehavior='engage'|'cautious'|'refuse'|'warn'|'defend'|'deescalate'|'fearful';
export interface NpcDecisionContext {
  intent:NpcIntent;
  disposition:Disposition;
  traits:SocialTraits;
  relationship:SocialRelationship;
  recentThreats:number;
}
export interface NpcDecision {behavior:NpcBehavior;scores:Record<NpcBehavior,number>;reason:string;}

/**
 * Deterministic utility matrix for social behavior. It chooses a stance, never world facts
 * or outcomes. The engine remains responsible for validating and applying any action.
 */
export function decideNpcBehavior(c:NpcDecisionContext):NpcDecision {
  const {intent,disposition:d,traits:t,relationship:r}=c;
  const threat=intent==='threat', insult=intent==='insult', hostileAct=threat||insult;
  const scores:Record<NpcBehavior,number>={
    engage: 12 + r.trust*.20 + r.affection*.10 + r.respect*.08 + t.reconciliation*.10 - r.hostility*.12 - r.resentment*.08,
    cautious: 8 + (100-r.trust)*.12 + (d==='wary'?18:0) + (d==='hostile'?8:0) + t.selfControl*.08,
    refuse: -8 + r.hostility*.22 + r.resentment*.20 + t.pride*.08 - t.reconciliation*.08,
    warn: threat ? 18 + c.recentThreats*9 + t.reactivity*.12 + r.hostility*.08 - t.selfControl*.06 : -50,
    defend: hostileAct ? -4 + r.hostility*.18 + t.vengefulness*.16 + c.recentThreats*(threat?8:3) + t.reactivity*.08 - r.fear*.12 - t.selfControl*.08 : -50,
    deescalate: threat ? 5 + r.fear*.12 + t.selfControl*.16 + t.reconciliation*.08 - t.vengefulness*.12 : 0,
    fearful: threat ? -2 + r.fear*.45 + (100-t.selfControl)*.06 + c.recentThreats*3 : -50,
  };
  if(intent==='apology'){
    scores.engage += t.reconciliation*.18;
    scores.refuse += (100-t.reconciliation)*.12 + r.resentment*.08;
  }
  if(d==='helpful')scores.engage+=10;
  if(d==='hostile')scores.refuse+=12;
  if(d==='neutral')scores.engage+=4;
  const order:NpcBehavior[]=['engage','cautious','refuse','warn','defend','deescalate','fearful'];
  let behavior=order[0];
  for(const candidate of order.slice(1))if(scores[candidate]>scores[behavior])behavior=candidate;
  const reason:Record<NpcBehavior,string>={
    engage:'confianza, respeto o disposición a reconciliarse favorecen el intercambio',
    cautious:'la incertidumbre y el autocontrol favorecen una respuesta prudente',
    refuse:'hostilidad o resentimiento hacen que el NPC cierre la interacción',
    warn:'la amenaza percibida y las provocaciones recientes favorecen advertir',
    defend:'la hostilidad y la tendencia a la represalia superan el miedo y la inhibición',
    deescalate:'el autocontrol y la posibilidad de evitar el conflicto pesan más que la represalia',
    fearful:'el miedo domina la respuesta ante una amenaza',
  };
  return {behavior,scores,reason:reason[behavior]};
}

export function intentForSocialEvent(kind:string|undefined):NpcIntent {
  if(kind==='threat'||kind==='insult'||kind==='apology'||kind==='help')return kind;
  return 'unknown';
}

export function recentThreatCount(actor:Actor,targetId='player',withinTicks=24,nowTick=0):number {
  return actor.social.memories.filter(m=>m.targetId===targetId&&m.kind==='threat'&&nowTick-m.tick>=0&&nowTick-m.tick<=withinTicks).length;
}
