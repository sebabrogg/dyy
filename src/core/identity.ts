function normalize(value:string):string{return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}

export function asksForIdentity(text:string):boolean{const value=normalize(text);return /\b(quien (sos|eres|es)|como te llamas|tu nombre|identifica(te)?|decime tu nombre|dime tu nombre)\b/.test(value);}

export function revealsIdentity(question:string,reply:string,realName:string):boolean{if(!asksForIdentity(question))return false;const answer=normalize(reply),name=normalize(realName);if(!name||!answer.includes(name))return false;return /\b(soy|me llamo|mi nombre es)\b/.test(answer)||answer.includes(name);}
