import type {Actor,Item,WorldState} from './types.ts';

export interface TradeDecision{accepted:boolean;reason:string;giveValue:number;receiveValue:number;}
function words(value:string){return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function itemValue(item:Item,actor:Actor,quantity:number){
 const text=words([item.name,item.description,item.id].join(' '));
 const needs=words([actor.goal,actor.lifeMission?.title,actor.lifeMission?.description,actor.lifeMission?.needs?.join(' '),actor.mind?.needs?.join(' '),actor.mind?.values?.join(' '),actor.mind?.currentMood].filter(Boolean).join(' '));
 let value=1;
 if(/agua|comida|racion|medicina|bateria|municion|arma|cuchillo|punzon|sierra/.test(text))value=3;
 if(/chatarra|pieza|repuesto|metal|cable|generador|herramienta/.test(text))value=2;
 if(text.split(/\s+/).some(word=>word.length>3&&needs.includes(word)))value+=3;
 const already=actor.inventory?.find(i=>i.id===item.id)?.quantity??0;
 if(already>0)value=Math.max(1,value-1);
 return value*Math.max(1,quantity);
}
export function evaluateTradeOffer(actor:Actor,give:Item,receive:Item,giveQuantity=1,receiveQuantity=1):TradeDecision{
 const giveValue=itemValue(give,actor,giveQuantity),receiveValue=itemValue(receive,actor,receiveQuantity);
 const text=words([actor.goal,actor.lifeMission?.title,actor.lifeMission?.description,actor.lifeMission?.needs?.join(' '),actor.mind?.needs?.join(' '),actor.mind?.values?.join(' '),actor.mind?.currentMood].filter(Boolean).join(' '));
 const offered=words([give.name,give.description,give.id].join(' '));
 const needed=offered.split(/\s+/).some(word=>word.length>3&&text.includes(word));
 if(needed&&giveValue>=receiveValue-1)return {accepted:true,reason:'Me sirve lo que traés y el intercambio me cierra.',giveValue,receiveValue};
 if(giveValue>=receiveValue+1)return {accepted:true,reason:'Me sirve el trato. Nos conviene a los dos.',giveValue,receiveValue};
 if(receiveValue>giveValue)return {accepted:false,reason:`No me sirve perder ${receive.name} por algo que necesito menos.`,giveValue,receiveValue};
 return {accepted:false,reason:'No me convence el trato: lo que ofrecés no compensa lo que me pedís.',giveValue,receiveValue};
}
export function executeTrade(state:WorldState,actorId:string,giveId:string,receiveId:string,giveQuantity=1,receiveQuantity=1):TradeDecision{
 if(!Number.isInteger(giveQuantity)||!Number.isInteger(receiveQuantity)||giveQuantity<1||receiveQuantity<1)return {accepted:false,reason:'Las cantidades tienen que ser números enteros positivos.',giveValue:0,receiveValue:0};
 if(giveId===receiveId)return {accepted:false,reason:'No tiene sentido intercambiar un objeto por el mismo objeto.',giveValue:0,receiveValue:0};
 const actor=state.actors.find(a=>a.id===actorId);
 if(!actor||!actor.alive||Math.max(Math.abs(actor.x-state.player.x),Math.abs(actor.y-state.player.y))>2)return {accepted:false,reason:'La otra persona tiene que estar viva y cerca para negociar.',giveValue:0,receiveValue:0};
 const give=state.player.inventory.find(i=>i.id===giveId&&i.quantity>=giveQuantity&&giveQuantity>0);
 const receive=actor.inventory?.find(i=>i.id===receiveId&&i.quantity>=receiveQuantity&&receiveQuantity>0);
 if(!give||!receive)return {accepted:false,reason:'El inventario cambió. Revisá los objetos antes de confirmar.',giveValue:0,receiveValue:0};
 const decision=evaluateTradeOffer(actor,give,receive,giveQuantity,receiveQuantity);
 if(!decision.accepted)return decision;
 // Preserve transfer payloads before mutating either inventory.
 const givenCopy={...give,quantity:giveQuantity};const receivedCopy={...receive,quantity:receiveQuantity};
 give.quantity-=giveQuantity;receive.quantity-=receiveQuantity;
 if(give.quantity===0)state.player.inventory=state.player.inventory.filter(i=>i.id!==give.id);
 if(receive.quantity===0)actor.inventory=actor.inventory?.filter(i=>i.id!==receive.id)??[];
 const toActor=actor.inventory?.find(i=>i.id===give.id);
 if(toActor)toActor.quantity+=giveQuantity;else (actor.inventory??=[]).push(givenCopy);
 const toPlayer=state.player.inventory.find(i=>i.id===receive.id);
 if(toPlayer)toPlayer.quantity+=receiveQuantity;else state.player.inventory.push(receivedCopy);
 return decision;
}
