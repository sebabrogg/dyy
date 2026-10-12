export type Terrain='floor'|'wall'|'road'|'water'|'building'|'scrap'|'grass'|'door';
export interface Tile{x:number;y:number;terrain:Terrain;explored:boolean;}
export type Disposition='wary'|'neutral'|'hostile'|'helpful';
export type SocialEventKind='insult'|'threat'|'help'|'saved'|'apology'|'betrayal'|'conversation';
export interface SocialTraits{susceptibility:number;reactivity:number;grudge:number;pride:number;selfControl:number;vengefulness:number;reconciliation:number;}
export interface SocialMemory{id:string;targetId:string;tick:number;kind:SocialEventKind;severity:number;salience:number;decayPerDay:number;public:boolean;description:string;interpretation:string;}
export interface SocialRelationship{affection:number;trust:number;respect:number;resentment:number;fear:number;debt:number;hostility:number;}
export interface SocialKnowledge{eventId:string;subjectId:string;targetId:string;kind:SocialEventKind;tick:number;confidence:number;source:'witness'|'rumor';interpretation:string;hops:number;}
export interface ActorSocialState{traits:SocialTraits;memories:SocialMemory[];relationships:Record<string,SocialRelationship>;contacts:Record<string,number>;knowledge:SocialKnowledge[];reputation:Record<string,number>;lastAgedTick:number;}
export interface Actor{id:string;name:string;glyph:string;x:number;y:number;faction:string;disposition:Disposition;personality:string;goal:string;trust:number;alert:number;alive:boolean;color:string;lastSeenPlayerTick:number;social:ActorSocialState;mind:NpcMind;lifeMission:LifeMission;}
export interface Item{id:string;name:string;quantity:number;description:string;}
export interface Player{x:number;y:number;health:number;sanity:number;hunger:number;inventory:Item[];}
export interface WorldState{seed:number;width:number;height:number;tiles:Tile[];actors:Actor[];player:Player;tick:number;day:number;minute:number;selectedActorId:string|null;selectedTile:{x:number;y:number}|null;log:LogEntry[];quests:NpcQuest[];running:boolean;}
export interface LogEntry{tick:number;text:string;kind:'world'|'action'|'warning'|'dialogue';}
export const indexOf=(x:number,y:number,width:number)=>y*width+x;
export const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);

export interface CognitiveProfile {iq:number;memory:number;reasoning:number;socialInference:number;learning:number;practicalJudgment:number;stressTolerance:number;}
export interface PersonalityProfile {openness:number;conscientiousness:number;extraversion:number;agreeableness:number;emotionalStability:number;empathy:number;impulsivity:number;pride:number;curiosity:number;paranoia:number;riskTolerance:number;loyalty:number;vengefulness:number;patience:number;needForApproval:number;selfReliance:number;cruelty:number;generosity:number;}
export interface BiographicalEvent {age:number;event:string;impact:string;tags:string[]}
export interface TraumaMemory {event:string;triggers:string[];copingStyle:string;intensity:number;active:boolean;}
export interface KnowledgeFact {topic:string;belief:string;confidence:number;source:'experience'|'education'|'witness'|'rumor'|'inference';verified:boolean;}
export interface NpcMind {age:number;origin:string;upbringing:string;education:string;history:BiographicalEvent[];traumas:TraumaMemory[];cognition:CognitiveProfile;traits:PersonalityProfile;skills:Record<string,number>;strengths:string[];limitations:string[];needs:string[];values:string[];fears:string[];knowledge:KnowledgeFact[];currentMood:string;copingStyle:string;}
export interface LifeMission {id:string;title:string;description:string;motivation:string;steps:string[];progress:number;status:'active'|'paused'|'completed'|'abandoned';needs:string[];obstacle:string;deadlineTick:number|null;secret:string|null;}
export interface NpcQuest {id:string;giverId:string;missionId:string;title:string;description:string;objective:string;requirements:string[];reward:string;status:'offered'|'accepted'|'completed'|'failed'|'declined';offeredAtTick:number;acceptedAtTick:number|null;}
