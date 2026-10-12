import {distance,indexOf,type WorldState} from '../core/types.ts';
import {canSee,canIdentifyActor,tileAt} from '../core/engine.ts';
const COLORS:Record<string,string>={floor:'#333b3d',road:'#242b2e',wall:'#596165',building:'#4a5152',door:'#a86e4b',scrap:'#66705e',grass:'#3d5948',water:'#293f49'};
export interface MapView{tileW:number;tileH:number;originX:number;originY:number;scale:number;}
export function drawMap(canvas:HTMLCanvasElement,s:WorldState):MapView{
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D no disponible');
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
 if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
 const tileW=Math.max(13,Math.min(48,rect.width/18,rect.height/12));
 const tileH=tileW*.5,originX=rect.width/2,originY=rect.height/2;
 const center=(x:number,y:number)=>({x:rect.width/2+((x-s.player.x)-(y-s.player.y))*tileW/2,y:rect.height/2+((x-s.player.x)+(y-s.player.y))*tileH/2});
 // Draw back-to-front, giving every tile a clear diamond footprint.
 for(let sum=0;sum<s.width+s.height;sum++)for(let y=Math.max(0,sum-s.width+1);y<=Math.min(s.height-1,sum);y++){
  const x=sum-y,t=s.tiles[indexOf(x,y,s.width)]!,p=center(x,y);
  ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+tileW/2,p.y+tileH/2);ctx.lineTo(p.x,p.y+tileH);ctx.lineTo(p.x-tileW/2,p.y+tileH/2);ctx.closePath();
  const visible=distance(s.player,t)<=7||t.explored;
  ctx.fillStyle=visible?COLORS[t.terrain]:'#15191b';ctx.fill();ctx.strokeStyle=visible?'#1b2224':'#111416';ctx.lineWidth=.65;ctx.stroke();
  if(!visible)continue;
  if(t.terrain==='building'||t.terrain==='wall'){
   const top=p.y-tileH*.8,base=p.y+tileH*.42;const left=p.x-tileW*.42,right=p.x+tileW*.42;const roof=p.x;const depth=tileH*.34;ctx.fillStyle=t.terrain==='wall'?'#42494b':'#353c3e';ctx.beginPath();ctx.moveTo(left,base);ctx.lineTo(left,top+tileH*.35);ctx.lineTo(roof,top);ctx.lineTo(roof,top+depth);ctx.lineTo(roof,base+depth);ctx.closePath();ctx.fill();ctx.fillStyle=t.terrain==='wall'?'#626b6d':'#50585a';ctx.beginPath();ctx.moveTo(roof,top);ctx.lineTo(right,top+tileH*.35);ctx.lineTo(right,base);ctx.lineTo(roof,base+depth);ctx.closePath();ctx.fill();ctx.fillStyle='#747d7e';ctx.beginPath();ctx.moveTo(left,top+tileH*.35);ctx.lineTo(roof,top);ctx.lineTo(right,top+tileH*.35);ctx.lineTo(roof,top+tileH*.35+depth*.35);ctx.closePath();ctx.fill();ctx.strokeStyle='#81898a';ctx.lineWidth=.6;ctx.stroke();
  } else if(t.terrain==='scrap'){ctx.fillStyle='#9ba28c';ctx.fillRect(p.x-2,p.y+tileH*.3,4,2);ctx.fillRect(p.x+2,p.y+tileH*.2,3,2);}
  else if(t.terrain==='grass'){ctx.strokeStyle='#83a58a';ctx.beginPath();ctx.moveTo(p.x,p.y+tileH*.6);ctx.lineTo(p.x-2,p.y);ctx.moveTo(p.x,p.y+tileH*.6);ctx.lineTo(p.x+3,p.y+.5);ctx.stroke();}
 }
 for(const a of s.actors.filter(a=>canSee(s,a)).sort((a,b)=>(a.x+a.y)-(b.x+b.y))){
  const p=center(a.x,a.y),identified=canIdentifyActor(s,a),fade=identified?1:.48;ctx.beginPath();ctx.ellipse(p.x,p.y+tileH*.48,tileW*.22,tileH*.16,0,0,Math.PI*2);ctx.fillStyle='#0c0f10';ctx.fill();
  ctx.globalAlpha=fade;ctx.fillStyle=identified?a.color:'#879092';ctx.beginPath();ctx.moveTo(p.x-tileW*.12,p.y+tileH*.4);ctx.lineTo(p.x-tileW*.1,p.y+tileH*.06);ctx.lineTo(p.x+tileW*.1,p.y+tileH*.06);ctx.lineTo(p.x+tileW*.14,p.y+tileH*.4);ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y-tileH*.02,tileW*.12,0,Math.PI*2);ctx.fill();ctx.strokeStyle=s.selectedActorId===a.id?'#f0c878':'#111';ctx.lineWidth=s.selectedActorId===a.id?2:1;ctx.stroke();
  if(identified){ctx.fillStyle='#101314';ctx.font='bold '+Math.max(8,tileW*.32)+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(a.glyph,p.x,p.y-tileH*.02);if(a.alert>15){ctx.fillStyle='#e36b5e';ctx.fillRect(p.x-2,p.y-tileH*.3,4,2);}}ctx.globalAlpha=1;
 }
 const pp=center(s.player.x,s.player.y);ctx.beginPath();ctx.ellipse(pp.x,pp.y+tileH*.48,tileW*.23,tileH*.23,0,0,Math.PI*2);ctx.fillStyle='#d8d9d0';ctx.fill();
 ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#111';ctx.font='bold '+Math.max(10,tileW*.45)+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('@',pp.x,pp.y+tileH*.16);
 if(s.selectedTile){const p=center(s.selectedTile.x,s.selectedTile.y);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+tileW/2,p.y+tileH/2);ctx.lineTo(p.x,p.y+tileH);ctx.lineTo(p.x-tileW/2,p.y+tileH/2);ctx.closePath();ctx.strokeStyle='#d7b76d';ctx.lineWidth=1.5;ctx.stroke();}
 return{tileW,tileH,originX,originY,scale:1};
}
export function tileFromPointer(canvas:HTMLCanvasElement,s:WorldState,clientX:number,clientY:number):{x:number;y:number}|null{
 const rect=canvas.getBoundingClientRect(),tileW=Math.max(13,Math.min(48,rect.width/18,rect.height/12)),tileH=tileW*.5;
 const px=clientX-rect.left-rect.width/2,py=clientY-rect.top-rect.height/2;
 const x=Math.round(px/tileW+py/tileH+s.player.x),y=Math.round(py/tileH-px/tileW+s.player.y);
 return tileAt(s,x,y)?{x,y}:null;
}

export function drawOverviewMap(canvas:HTMLCanvasElement,s:WorldState):void{
 const ctx=canvas.getContext('2d');if(!ctx)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#101516';ctx.fillRect(0,0,rect.width,rect.height);const cell=Math.max(2,Math.min((rect.width-24)/s.width,(rect.height-24)/s.height));const ox=(rect.width-s.width*cell)/2,oy=(rect.height-s.height*cell)/2;const colors:Record<string,string>={floor:'#353d3f',road:'#252d30',wall:'#6c7477',building:'#596466',door:'#d69a62',scrap:'#65715c',grass:'#3d5948',water:'#294653'};
 for(const t of s.tiles){const x=ox+t.x*cell,y=oy+t.y*cell;if(!t.explored){ctx.fillStyle='#15191a';ctx.fillRect(x,y,cell,cell);continue;}ctx.fillStyle=colors[t.terrain]??'#303638';ctx.fillRect(x,y,Math.ceil(cell),Math.ceil(cell));if(cell>=7&&(t.terrain==='building'||t.terrain==='door')){ctx.fillStyle=t.terrain==='door'?'#171b1b':'#e0e5df';ctx.font='bold '+Math.max(7,cell*.72)+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.terrain==='door'?'D':'H',x+cell/2,y+cell/2);}}
 for(const a of s.actors){if(!a.alive||!canSee(s,a))continue;const t=tileAt(s,a.x,a.y);if(!t?.explored)continue;ctx.fillStyle=a.faction==='UAC'?'#d09a75':a.faction==='EME'?'#8fa7b5':'#b2c28b';ctx.beginPath();ctx.arc(ox+(a.x+.5)*cell,oy+(a.y+.5)*cell,Math.max(2,cell*.28),0,Math.PI*2);ctx.fill();}
 const px=ox+(s.player.x+.5)*cell,py=oy+(s.player.y+.5)*cell;ctx.fillStyle='#f4f1e8';ctx.strokeStyle='#a54b43';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,Math.max(3,cell*.4),0,Math.PI*2);ctx.fill();ctx.stroke();
}
