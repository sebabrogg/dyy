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
export function executeTrade(state:WorldState,actorId:string,giveId:string,receiveId:string,giveQuantity=1,receiveQuantity=1,creditsOffered=0):TradeDecision{
 if(!Number.isInteger(creditsOffered)||creditsOffered<0||creditsOffered>(state.player.credits??0))return {accepted:false,reason:'No tenés esos créditos disponibles.',giveValue:0,receiveValue:0};
 if(!Number.isInteger(giveQuantity)||!Number.isInteger(receiveQuantity)||giveQuantity<1||receiveQuantity<1)return {accepted:false,reason:'Las cantidades tienen que ser números enteros positivos.',giveValue:0,receiveValue:0};
 if(giveId===receiveId)return {accepted:false,reason:'No tiene sentido intercambiar un objeto por el mismo objeto.',giveValue:0,receiveValue:0};
 const actor=state.actors.find(a=>a.id===actorId);
 if(!actor||!actor.alive||Math.max(Math.abs(actor.x-state.player.x),Math.abs(actor.y-state.player.y))>2)return {accepted:false,reason:'La otra persona tiene que estar viva y cerca para negociar.',giveValue:0,receiveValue:0};
 const give=state.player.inventory.find(i=>i.id===giveId&&i.quantity>=giveQuantity&&giveQuantity>0);
 const receive=actor.inventory?.find(i=>i.id===receiveId&&i.quantity>=receiveQuantity&&receiveQuantity>0);
 if(!give||!receive)return {accepted:false,reason:'El inventario cambió. Revisá los objetos antes de confirmar.',giveValue:0,receiveValue:0};
 const decision=evaluateTradeOffer(actor,give,receive,giveQuantity,receiveQuantity);
 decision.giveValue+=Math.floor(creditsOffered/12);
 if(!decision.accepted&&decision.giveValue>=decision.receiveValue)return {...decision,accepted:true,reason:'Los objetos y el crédito adicional hacen que el trato me sirva.'};
 if(!decision.accepted)return decision;
 // Preserve transfer payloads before mutating either inventory.
 const givenCopy={...give,quantity:giveQuantity};const receivedCopy={...receive,quantity:receiveQuantity};
 give.quantity-=giveQuantity;receive.quantity-=receiveQuantity;state.player.credits=(state.player.credits??0)-creditsOffered;actor.credits=(actor.credits??0)+creditsOffered;
 if(give.quantity===0)state.player.inventory=state.player.inventory.filter(i=>i.id!==give.id);
 if(receive.quantity===0)actor.inventory=actor.inventory?.filter(i=>i.id!==receive.id)??[];
 const toActor=actor.inventory?.find(i=>i.id===give.id);
 if(toActor)toActor.quantity+=giveQuantity;else (actor.inventory??=[]).push(givenCopy);
 const toPlayer=state.player.inventory.find(i=>i.id===receive.id);
 if(toPlayer)toPlayer.quantity+=receiveQuantity;else state.player.inventory.push(receivedCopy);
 return decision;
}

export type MarketMode='buy'|'sell';
export function marketPrice(item:Item,actor:Actor,mode:MarketMode):number{
 const text=words([item.name,item.description,item.id].join(' '));
 let base=/medicina|medkit|bateria|arma|municion|filtro/.test(text)?48:/herramienta|repuesto|cable|pieza|generador/.test(text)?24:/agua|comida|racion/.test(text)?12:/metal|chatarra|tela/.test(text)?8:16;
 const condition=Math.max(.25,Math.min(1.2,(item.condition??85)/100));
 const needText=words([actor.goal,actor.lifeMission?.title,actor.lifeMission?.description,actor.lifeMission?.needs?.join(' '),actor.mind?.needs?.join(' ')].filter(Boolean).join(' '));
 const needMatch=text.split(/\s+/).some(w=>w.length>3&&needText.includes(w));
 const stock=(actor.inventory??[]).find(i=>i.id===item.id)?.quantity??0;
 const scarcity=mode==='buy'&&stock<=1?1.3:mode==='sell'&&stock>=4?.75:1;
 const relationship=actor.social?.relationships?.player;
 const rapport=1-Math.max(-.15,Math.min(.15,((relationship?.trust??actor.trust)-50)/400));
 const needFactor=needMatch?(mode==='buy'?1.2:.9):1;
 const ask=base*condition*scarcity*rapport*needFactor;
 return Math.max(1,Math.round(mode==='buy'?ask:ask*.62));
}
export interface MarketResult{accepted:boolean;reason:string;total:number;}
export function executeMarketTrade(state:WorldState,actorId:string,mode:MarketMode,itemId:string,quantity:number):MarketResult{
 if(!Number.isInteger(quantity)||quantity<1)return {accepted:false,reason:'La cantidad debe ser un entero positivo.',total:0};
 const actor=state.actors.find(a=>a.id===actorId);
 if(!actor||!actor.alive||Math.max(Math.abs(actor.x-state.player.x),Math.abs(actor.y-state.player.y))>2)return {accepted:false,reason:'La otra persona ya no está en condiciones de negociar contigo.',total:0};
 const source=mode==='buy'?(actor.inventory??[]):state.player.inventory;
 const item=source.find(i=>i.id===itemId&&i.quantity>=quantity);
 if(!item)return {accepted:false,reason:'Las existencias cambiaron. La operación no se realizó.',total:0};
 if(mode==='buy'&&actor.inventory?.some(i=>i.id===item.id)&&actor.inventory.find(i=>i.id===item.id)!.quantity===quantity&&/herramienta|medicina|bateria|filtro|repuesto/.test(words(item.name+' '+item.description))&&/repar|mecan|medic|generador|necesit/.test(words(actor.goal+' '+actor.lifeMission?.title+' '+actor.lifeMission?.description)))return {accepted:false,reason:'No voy a vender lo último que necesito para trabajar o sobrevivir.',total:0};
 const total=marketPrice(item,actor,mode)*quantity;
 if(mode==='buy'){
  if((state.player.credits??0)<total)return {accepted:false,reason:'No te alcanza el crédito para esa cantidad.',total};
  if((actor.credits??0)+total<0)return {accepted:false,reason:'No puedo cubrir esa operación ahora.',total};
  state.player.credits=(state.player.credits??0)-total;actor.credits=(actor.credits??0)+total;
  item.quantity-=quantity;if(item.quantity===0)actor.inventory=actor.inventory?.filter(i=>i.id!==itemId)??[];
  const existing=state.player.inventory.find(i=>i.id===itemId);if(existing)existing.quantity+=quantity;else state.player.inventory.push({...item,quantity});
 }else{
  if((actor.credits??0)<total)return {accepted:false,reason:'No tengo crédito suficiente para comprarte eso.',total};
  state.player.credits=(state.player.credits??0)+total;actor.credits=(actor.credits??0)-total;
  item.quantity-=quantity;if(item.quantity===0)state.player.inventory=state.player.inventory.filter(i=>i.id!==itemId);
  const existing=(actor.inventory??[]).find(i=>i.id===itemId);if(existing)existing.quantity+=quantity;else (actor.inventory??=[]).push({...item,quantity});
 }
 return {accepted:true,reason:mode==='buy'?'Operación cerrada. El precio refleja estado, existencias y necesidad local.':'Venta cerrada. El crédito y los inventarios fueron actualizados.',total};
}
