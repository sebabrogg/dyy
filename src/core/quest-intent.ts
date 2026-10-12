export type WorkIntent = 'ask_for_work' | 'offer_help' | 'ambiguous' | 'other';

function normalize(text: string): string {
  return text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const workNoun = /\b(?:encargo|recado|mandado|trabajo|tarea|favor|mision|misiones|algo que hacer|algo para mi|alguna cosa|alguna tarea|un pedido|un asunto)\b/;
const asksPatterns = [
  /\b(?:tenes|tienes|hay|conoces)\b.{0,42}\b(?:encargo|recado|mandado|trabajo|tarea|favor|mision|misiones|algo que hacer|algo para mi|alguna cosa|alguna tarea|pedido|asunto)\b/,
  /\b(?:necesitas|precisas|buscas|queres|quieres|te hace falta)\b.{0,48}\b(?:ayuda|una mano|que haga|alguien|mi ayuda|que te ayude|un favor|algo)\b/,
  /\b(?:puedo|podria)\b.{0,36}\b(?:hacer algo por vos|hacer algo por ti|ayudarte|ser util|darte una mano)\b/,
  /\b(?:que|qué)\s+(?:necesitas|precisas|queres que haga|quieres que haga)\b/,
];
const helpPatterns = [
  /\b(?:te ayudo(?: con eso| con ello)?|te puedo ayudar|puedo ayudarte|queres que te ayude|quieres que te ayude|queres una mano|quieres una mano|te doy una mano|cuenta conmigo|necesitas ayuda|precisas ayuda|necesitas que te ayude|te puedo dar una mano)\b/,
];

export function classifyWorkIntent(text: string): WorkIntent {
  const clean = normalize(text);
  if (!clean) return 'other';
  if (asksPatterns.some(pattern => pattern.test(clean))) return 'ask_for_work';
  if (helpPatterns.some(pattern => pattern.test(clean))) return 'offer_help';
  if (workNoun.test(clean)) return 'ambiguous';
  return 'other';
}
