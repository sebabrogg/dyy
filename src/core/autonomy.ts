import type {Actor} from './types.ts';

type Direction={dx:number;dy:number};
const DIRECTIONS:Direction[]=[{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
const distance=(a:Actor,b:Actor)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

/** Chooses an intention for autonomous movement. It returns a direction, never changes world state. */
export function chooseAutonomousDirection(actor:Actor,others:Actor[],random:()=>number):Direction|null{
  const p=actor.mind.traits,m=actor.mind.motivations;
  const nearby=others.filter(o=>o.alive&&o.id!==actor.id&&distance(actor,o)<=5);
  const contacts=nearby.filter(o=>Object.hasOwn(actor.social.contacts,o.id));
  const allies=contacts.map(target=>{
    const r=actor.social.relationships[target.id];
    if(!r)return {target,score:-100};
    const score=(p.extraversion*.16)+(m?.belonging??0)*.20+r.affection*.20+r.trust*.18-r.hostility*.24-r.fear*.12;
    return {target,score};
  }).filter(v=>distance(actor,v.target)>1).sort((a,b)=>b.score-a.score);
  const threats=nearby.map(target=>{
    const r=actor.social.relationships[target.id];
    return {target,score:(r?.hostility??0)*.35+(r?.fear??0)*.28+p.paranoia*.15+actor.alert*.2};
  }).filter(v=>distance(actor,v.target)>0).sort((a,b)=>b.score-a.score);
  const bestAlly=allies[0],bestThreat=threats[0];
  const approachScore=bestAlly?.score??-100;
  const avoidScore=(bestThreat?.score??0)-(p.riskTolerance*.16);
  const exploreScore=p.curiosity*.30+p.openness*.18+p.riskTolerance*.16+p.impulsivity*.08-p.paranoia*.14-actor.alert*.35;
  const stayScore=p.conscientiousness*.17+p.patience*.13+actor.alert*.55-p.impulsivity*.12-p.curiosity*.12;
  const candidates=[
    {kind:'approach' as const,score:approachScore,target:bestAlly?.target},
    {kind:'avoid' as const,score:avoidScore,target:bestThreat?.target},
    {kind:'explore' as const,score:exploreScore+random()*8},
    {kind:'stay' as const,score:stayScore+random()*8}
  ].sort((a,b)=>b.score-a.score);
  const chosen=candidates[0]!;
  if(chosen.kind==='stay'||chosen.score<18||random()>.18)return null;
  if(chosen.kind==='explore')return DIRECTIONS[Math.floor(random()*DIRECTIONS.length)]!;
  if(!chosen.target)return null;
  const dx=Math.sign(chosen.target.x-actor.x),dy=Math.sign(chosen.target.y-actor.y);
  const preferred=chosen.kind==='approach'?{dx,dy}:{dx:dx===0?0:-dx,dy:dy===0?0:-dy};
  if(preferred.dx!==0&&preferred.dy!==0)return random()<.5?{dx:preferred.dx,dy:0}:{dx:0,dy:preferred.dy};
  return preferred;
}
