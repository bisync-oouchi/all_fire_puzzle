export const TICKS_PER_SECOND = 10;

export const CATEGORY_COMBUSTIBLE="combustible";
export const CATEGORY_MELTABLE="meltable";
export const CATEGORY_UTILITY="utility";
export const CATEGORY_TERRAIN="terrain";
export const CATEGORY_ACTOR="actor";
export const CATEGORY_ENEMY="enemy";
export const MODE_BURN="burn";
export const MODE_RESCUE="rescue";

export const OBJECTS = Object.freeze([
  {id:0,key:"vine",name:"蔦",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:10,duration:2,heat:10,color:"#58a840"},
  {id:1,key:"tree",name:"木",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:20,duration:4,heat:20,color:"#397d35"},
  {id:2,key:"house",name:"木造家屋",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:30,duration:10,heat:20,color:"#9b6038",accent:"#d3a35f"},
  {id:3,key:"steel",name:"鉄骨建築",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:100,duration:5,heat:20,color:"#69747b",accent:"#9db9c2"},
  {id:4,key:"drum",name:"ドラム缶",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:50,duration:2,heat:200,color:"#b93b35",accent:"#68c2d0"},
  {id:5,key:"snowman",name:"雪だるま",category:CATEGORY_MELTABLE,modes:[MODE_BURN,MODE_RESCUE],threshold:50,duration:0,heat:0,color:"#dceef1",accent:"#68c2d0"},
  {id:6,key:"extinguisher",name:"消火器",category:CATEGORY_UTILITY,modes:[MODE_RESCUE],threshold:0,duration:0,heat:0,charges:5,color:"#3f6d79",accent:"#68c2d0"},
  {id:7,key:"car",name:"車",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:100,duration:4,heat:20,color:"#737b80",accent:"#9db9c2"},
  {id:8,key:"gasoline",name:"ガソリンタンク",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:20,duration:1,heat:400,color:"#d97622",accent:"#ffe05a"},
  {id:9,key:"door",name:"扉",category:CATEGORY_COMBUSTIBLE,modes:[MODE_RESCUE],threshold:20,duration:4,heat:10,color:"#744526",accent:"#d3a35f"},
  {id:10,key:"wall",name:"壁",category:CATEGORY_COMBUSTIBLE,modes:[MODE_RESCUE],threshold:200,duration:10,heat:20,color:"#77736b",accent:"#aaa298"},
  {id:11,key:"exit",name:"出口",category:CATEGORY_TERRAIN,modes:[MODE_RESCUE],threshold:0,duration:0,heat:0,color:"#d9b83f",accent:"#fff1a0"},
  {id:12,key:"river",name:"川",category:CATEGORY_TERRAIN,modes:[MODE_RESCUE],threshold:0,duration:0,heat:0,color:"#327ca8",accent:"#75d5df"},
  {id:13,key:"princess",name:"姫",category:CATEGORY_ACTOR,modes:[MODE_RESCUE],threshold:10,duration:5,heat:40,color:"#08766c",accent:"#70ad55",speed:2,burningSpeed:4},
  {id:14,key:"fatOni",name:"小太りの鬼",category:CATEGORY_ENEMY,modes:[MODE_RESCUE],threshold:10,duration:2,heat:40,color:"#9b564f",accent:"#e3b46f",speed:0},
  {id:15,key:"smallOni",name:"ちび鬼",category:CATEGORY_ENEMY,modes:[MODE_RESCUE],threshold:10,duration:3,heat:40,color:"#855394",accent:"#db9ee5",speed:2,burningSpeed:4,patrol:"horizontal"},
  {id:16,key:"bigOni",name:"でか鬼",category:CATEGORY_ENEMY,modes:[MODE_RESCUE],threshold:10,duration:3,heat:40,color:"#6b477a",accent:"#d59ade",speed:2,burningSpeed:4,patrol:"vertical"},
  {id:17,key:"strongOni",name:"つよ鬼",category:CATEGORY_ENEMY,modes:[MODE_RESCUE],threshold:10,duration:5,heat:40,color:"#4d315e",accent:"#ef7c73",speed:4,burningSpeed:4,patrol:"chase"},
  {id:18,key:"waterTank",name:"貯水タンク",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:100,duration:1,heat:0,color:"#39748c",accent:"#9db9c2"},
  {id:19,key:"highrise",name:"高層ビル",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:400,duration:5,heat:20,color:"#454f58",accent:"#d7b56d"},
  {id:20,key:"factory",name:"工場",category:CATEGORY_COMBUSTIBLE,modes:[MODE_BURN,MODE_RESCUE],threshold:100,duration:5,heat:20,color:"#76654d",accent:"#9db9c2"}
]);

export const EMPTY = -1;
export const ROAD = -2;
export const IDLE = 0;
export const BURNING = 1;
export const REMOVED = 2;

export function burnDifficultyFor(stageNumber){
  if(stageNumber<=10)return 1;
  if(stageNumber<=20)return 2;
  if(stageNumber<=25)return 3;
  if(stageNumber<=30)return 4;
  if(stageNumber<=50)return 5;
  if(stageNumber<=70)return 6;
  if(stageNumber<=85)return 7;
  if(stageNumber<=100)return 8;
  return 9;
}

export function rescueDifficultyFor(stageNumber){
  if(stageNumber<=5)return 1;
  if(stageNumber<=25)return 9;
  if(stageNumber<=100)return 10;
  if(stageNumber<=150)return 11;
  return 12;
}

export function difficultyFor(stageNumber,mode=MODE_BURN){
  return mode===MODE_RESCUE?rescueDifficultyFor(stageNumber):burnDifficultyFor(stageNumber);
}
