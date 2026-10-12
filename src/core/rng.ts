export function hash32(input: string): number { let h=2166136261; for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }
export class Random {
 private state:number;
 constructor(seed:number|string){this.state=typeof seed==='string'?hash32(seed):seed>>>0;}
 nextUint32():number{this.state=(this.state+0x6D2B79F5)>>>0;let t=this.state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return(t^(t>>>14))>>>0;}
 next():number{return this.nextUint32()/4294967296;}
 int(min:number,maxInclusive:number):number{return min+Math.floor(this.next()*(maxInclusive-min+1));}
 pick<T>(values:readonly T[]):T{return values[this.int(0,values.length-1)]!;}
}
export function stream(seed:number,name:string):Random{return new Random(hash32(seed+':'+name));}
