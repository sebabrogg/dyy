import {stream} from '../core/rng.ts';
import {generateLifeMission,generateNpcMind} from '../core/character.ts';
import {indexOf,type Actor,type Terrain,type Tile,type WorldState} from '../core/types.ts';
export const WORLD_SEED=0xD1570, WORLD_WIDTH=32, WORLD_HEIGHT=24;
function carveRoad(tiles:Tile[],y:number,w:number):void{for(let x=0;x<w;x++)tiles[indexOf(x,y,w)]!.terrain='road';}
export function generateWorld(seed=WORLD_SEED):WorldState{
 const mapRng=stream(seed,'map.terrain'),structureRng=stream(seed,'map.structures'),actorRng=stream(seed,'actors.population'),socialRng=stream(seed,'actors.social');
 const width=WORLD_WIDTH,height=WORLD_HEIGHT;
 const tiles:Tile[]=Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);const r=mapRng.next();const terrain:Terrain=x===0||y===0||x===width-1||y===height-1?'wall':r<.07?'grass':r<.105?'scrap':'floor';return{x,y,terrain,explored:false};});
 for(const y of [5,12,19])carveRoad(tiles,y,width);for(let y=0;y<height;y++)for(const x of [7,16,25])tiles[indexOf(x,y,width)]!.terrain='road';
 for(let by=2;by<height-2;by+=8)for(let bx=2;bx<width-2;bx+=9){const bw=structureRng.int(3,5),bh=structureRng.int(2,4);for(let y=by;y<Math.min(by+bh,height-1);y++)for(let x=bx;x<Math.min(bx+bw,width-1);x++)if(tiles[indexOf(x,y,width)]!.terrain!=='road')tiles[indexOf(x,y,width)]!.terrain='building';const dx=Math.min(bx+bw-1,width-2),dy=Math.min(by+bh,height-2);if(tiles[indexOf(dx,dy,width)]!.terrain==='building')tiles[indexOf(dx,dy,width)]!.terrain='door';}
 for(let y=9;y<=15;y++)for(let x=13;x<=19;x++)tiles[indexOf(x,y,width)]!.terrain='floor';for(let x=0;x<=16;x++)tiles[indexOf(x,12,width)]!.terrain='road';
 const roles=[
 ['Mara Venn','M','UAC','wary','guardia de distrito','controlar el acceso','#df795d',19,11],
 ['Ivo Salcedo','i','Gruta','helpful','mecánico','conseguir piezas para el generador','#8bb8a0',13,13],
 ['Nadia Kroll','N','EME','neutral','sanitaria','encontrar antibióticos','#b5a0d4',22,15],
 ['Tomás Riel','t','Sin afiliación','neutral','recolector','vender chatarra antes del toque de queda','#d5b77a',10,8],
 ['Ema Soria','e','Gruta','wary','mensajera','entregar un paquete sin llamar la atención','#8bb8a0',20,17],
 ['Bruno Kehl','B','UAC','hostile','contratista','expulsar a quien no tenga permiso','#df795d',24,10],
 ['Luz Arce','L','EME','helpful','archivista','reconstruir un registro de desaparecidos','#b5a0d4',11,15]
 ] as const;
 for(const r of roles){const x=r[7],y=r[8];tiles[indexOf(x,y,width)]!.terrain='floor';}
 const actors:Actor[]=roles.map((r,i)=>{const trust=actorRng.int(25,65);return ({id:'npc-'+String(i+1).padStart(2,'0'),name:r[0],glyph:r[1],faction:r[2],disposition:r[3],personality:r[4],goal:r[5],color:r[6],x:r[7],y:r[8],trust,alert:0,alive:true,lastSeenPlayerTick:-1,mind:generateNpcMind(seed,'npc-'+String(i+1).padStart(2,'0'),r[4],r[2]),lifeMission:generateLifeMission(seed,{id:'npc-'+String(i+1).padStart(2,'0'),name:r[0],goal:r[5],personality:r[4],faction:r[2]}),social:{
  traits:{susceptibility:socialRng.int(15,85),reactivity:socialRng.int(15,85),grudge:socialRng.int(10,90),pride:socialRng.int(10,90),selfControl:socialRng.int(10,90),vengefulness:socialRng.int(5,80),reconciliation:socialRng.int(10,85)},
  memories:[],knowledge:[],contacts:{},reputation:{},
  relationships:{player:{affection:0,trust,respect:25,resentment:0,fear:0,debt:0,hostility:r[3]==='hostile'?45:r[3]==='wary'?15:0}},lastAgedTick:0
 }});});
 for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
  const a=actors[i]!,b=actors[j]!,d=Math.hypot(a.x-b.x,a.y-b.y);
  const connected=d<=10&&(a.faction===b.faction||socialRng.next()<.28);
  if(connected){const strength=socialRng.int(35,85);a.social.contacts[b.id]=strength;b.social.contacts[a.id]=strength;}
 }
 return{seed,width,height,tiles,actors,player:{x:15,y:12,health:82,sanity:74,hunger:21,sleepDebtMinutes:0,inventory:[{id:'water',name:'Agua recuperada',quantity:1,description:'Agua filtrada con un regusto metálico.'},{id:'scrap',name:'Chatarra útil',quantity:3,description:'Piezas que todavía podrían servir.'},{id:'ration',name:'Ración comprimida',quantity:1,description:'Alimento barato y difícil de tragar.'}]},tick:0,day:1,minute:360,selectedActorId:null,selectedTile:null,log:[],quests:[],running:true};
}
