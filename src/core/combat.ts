import type {Actor,Item,WorldState,SkillName} from './types.ts';
import {awardPractice,skillProgress} from './progression.ts';

export type CombatStyle='unarmed'|'improvised'|'blunt'|'blade'|'firearm'|'disarm'|'retreat';
export interface CombatResult {ok:boolean;reason?:string;attackerId:string;targetId:string;style:CombatStyle;hit?:boolean;damage?:number;targetHealth?:number;attackerHealth?:number;noise?:number;message:string;}
type Combatant={id:string;x:number;y:number;alive:boolean;inventory:Item[];progression?:Actor['progression'];health?:number;stamina?:number;wounds?:string[];social?:Actor['social'];name?:string};
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
function getCombatant(s:WorldState,id:string):Combatant|undefined {if(id==='player')return {...s.player,id:'player',alive:s.player.health>0} as unknown as Combatant;return s.actors.find(a=>a.id===id) as Combatant|undefined;}
function skill(c:Combatant,name:SkillName):number{return c.progression?skillProgress(c.progression,name).level:1;}
function weapon(c:Combatant,style:CombatStyle):Item|undefined {const inventory=c.inventory??[];const isWeapon=(i:Item)=>{const n=i.name.toLowerCase();if(style==='firearm')return /pistola|rifle|arma de fuego/.test(n);if(style==='blade')return /cuchillo|navaja|machete|hoja/.test(n);if(style==='blunt'||style==='improvised')return /barra|tubo|llave inglesa|martillo|palo|herramienta pesada/.test(n);return false;};return inventory.find(i=>i.equipped&&isWeapon(i))??inventory.find(isWeapon);}
function protection(c:Combatant):number{return (c.inventory??[]).filter(i=>i.equipped&&(/protecci|armadura|chaleco/i.test(i.name)||i.kind==='protective')).reduce((n,i)=>n+Math.round((i.integrity??i.condition??50)/25),0);}
function roll(s:WorldState,attackerId:string,targetId:string):number {let x=(s.seed^Math.imul(s.tick+Math.floor((s.elapsedWorldMs??0)/5000)+1,0x45d9f3b)^attackerId.split('').reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619),2166136261)^targetId.split('').reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619),2166136261))>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}
function addLog(s:WorldState,text:string,kind:'action'|'danger'|'warning'='action'){s.log.push({tick:s.tick,text,kind});if(s.log.length>100)s.log.shift();}
export function resolveCombatAction(s:WorldState,attackerId:string,targetId:string,style:CombatStyle='unarmed',executionQuality=0.5):CombatResult {
 const attacker=getCombatant(s,attackerId),target=getCombatant(s,targetId);
 const fail=(reason:string):CombatResult=>({ok:false,reason,attackerId,targetId,style,message:reason});
 if(!attacker||!target||attackerId===targetId)return fail('No hay un adversario válido.');
 if(!attacker.alive||!target.alive)return fail('Una de las personas ya no puede combatir.');
 if((attacker.health??100)<=0)return fail('No podés combatir mientras estás incapacitado.');
 if(dist(attacker,target)>1.5)return fail('El objetivo está fuera del alcance del ataque.');
 if(style==='retreat')return {ok:true,attackerId,targetId,style,hit:false,damage:0,message:'Buscás una salida; la retirada depende de que exista una ruta libre.'};
 if(style==='firearm'&&!weapon(attacker,style))return fail('No tenés un arma de fuego disponible.');
 if(style==='blade'&&!weapon(attacker,style))return fail('No tenés una hoja disponible.');
 if(['blunt','improvised'].includes(style)&&!weapon(attacker,style))return fail('No tenés un objeto adecuado para ese golpe.');
 const skillName:SkillName=style==='blade'?'blades':style==='firearm'?'firearms':style==='unarmed'?'fitness':'improvised-weapons';
 const level=skill(attacker,skillName),fitness=skill(attacker,'fitness');
 const chosen=weapon(attacker,style);const integrity=(chosen?.integrity??chosen?.condition??65)/100;const quality=(chosen?.quality??60)/100;
 const fatigue=clamp((attacker.stamina??100)/100,.25,1);const healthFactor=clamp((attacker.health??100)/100,.2,1);
 const attackScore=25+level*.55+fitness*.22+(chosen?10*integrity*quality:0)+clamp(executionQuality,0,1)*12+fatigue*8+healthFactor*5;
 const defenseScore=35+skill(target,'defense')*.45+skill(target,'fitness')*.2+protection(target)*5+roll(s,attackerId,targetId)*24;
 const hit=attackScore>=defenseScore;
 const base=style==='firearm'?26:style==='blade'?17:style==='blunt'?14:style==='improvised'?11:7;
 const damage=hit?Math.max(1,Math.round((base+level*.18+(chosen?quality*4:0))*(.7+roll(s,targetId,attackerId)*.6)-protection(target)*1.5)):0;
 const targetHealth=Math.max(0,(target.health??100)-damage);target.health=targetHealth;
 const wound=damage>=18?'herida grave':damage>=9?'herida moderada':'contusión';if(hit){target.wounds??=[];if(!target.wounds.includes(wound))target.wounds.push(wound);target.stamina=clamp((target.stamina??100)-8,0,100);if(targetHealth===0)target.alive=false;}
 attacker.stamina=clamp((attacker.stamina??100)-(style==='firearm'?4:10),0,100);
 if(chosen){chosen.wear=(chosen.wear??0)+(style==='firearm'?0.3:1);chosen.integrity=Math.max(0,(chosen.integrity??chosen.condition??100)-(style==='firearm'?0.05:0.4));chosen.condition=chosen.integrity;}
 const noise=style==='firearm'?10:style==='blade'?3:style==='unarmed'?1:2;
 if(attacker.progression)awardPractice(attacker.progression,{skill:skillName,base:hit?5:2,difficulty:1,quality:hit?clamp(damage/15,.25,1):.3,outcome:hit?'success':'failure',key:`combat:${style}`,context:`target:${targetId}`,tick:s.tick});
 s.elapsedWorldMs=(s.elapsedWorldMs??0)+5000;s.minute=(s.minute+0.0833)%60;
const message=hit ? (attackerId==="player"?"Golpeás":(attacker.name??"El atacante"))+" a "+(targetId==="player"?"vos":(target.name??targetId))+": "+damage+" de daño. "+(targetHealth===0?"Queda incapacitado.":wound+".") : "El ataque contra "+(target.name??targetId)+" falla; el adversario evita el golpe.";
if(attackerId==="player" && targetId!=="player"){const a=s.actors.find(x=>x.id===targetId);const r=a?.social.relationships.player;if(r){r.hostility=Math.min(100,r.hostility+(hit?Math.max(8,damage):4));r.fear=Math.min(100,r.fear+(hit?Math.max(2,damage*.35):1));}}
 addLog(s,message,hit?'danger':'action');
 return {ok:true,attackerId,targetId,style,hit,damage,targetHealth,attackerHealth:attacker.health??100,noise,message};
}
export function recoverCombatant(c:Combatant,minutes:number):void {if(!Number.isFinite(minutes)||minutes<=0)return;c.stamina=clamp((c.stamina??100)+minutes*.8,0,100);}
