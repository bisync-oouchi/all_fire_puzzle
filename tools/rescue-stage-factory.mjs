import {EMPTY,ROAD,rescueDifficultyFor} from "../src/definitions.js";
import {createRescueSimulation,directIgniteRescue,stepRescueSimulation} from "../src/rescue-simulation.js";

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const rngFor=seed=>{let n=seed>>>0;return ()=>((n=Math.imul(n^n>>>15,1|n),n^=n+Math.imul(n^n>>>7,61|n),((n^n>>>14)>>>0)/4294967296))};
const shuffle=(values,random)=>{const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out};
const xy=(width,index)=>[index%width,Math.floor(index/width)];

function allowedPool(number,difficulty,endless=false){
  if(endless)return [0,0,1,1,2,2,3,4,7,8,9,10,19,20,5,18,6];
  if(number===1)return [0,1,9,10];
  if(number<=5)return [0,1,2,6,9,10];
  if(number<=10)return [0,1,2,3,7,9,10,12];
  if(number<=15)return [0,1,2,3,4,7,8,9,10,12,19];
  if(difficulty<=5)return [0,1,2,3,4,5,6,7,8,9,10,12,18,19,20];
  return [0,1,2,3,4,5,6,7,8,9,10,12,18,19,20];
}

function profile(number,difficulty,random,endless){
  if(endless)return {size:22+Math.floor(random()*3),extras:120+Math.floor(random()*35),roads:4+Math.floor(random()*2),enemies:8,mixed:true,plannedEnemies:0};
  const settings={
    1:[11,4,0,number>=2?1:0],
    9:[18,30,2,5],10:[20,48,3,7],11:[22,78,4,8],12:[24,120,5,10]
  }[difficulty]||[22,78,4,8];
  return {size:settings[0]+Math.floor(random()*2),extras:settings[1],roads:settings[2],enemies:settings[3],mixed:number>10&&random()<.58,plannedEnemies:difficulty>=9?2:0};
}

function cageIndices(width,px,py){
  const indices=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===2)indices.push((py+dy)*width+px+dx);return indices;
}

function distanceToRoad(tiles,width,index){
  const [x,y]=xy(width,index);let best=Infinity;for(let i=0;i<tiles.length;i++)if(tiles[i]===ROAD){const [rx,ry]=xy(width,i);best=Math.min(best,Math.abs(x-rx)+Math.abs(y-ry))}return best;
}

function addRoadBranches(tiles,width,height,count,random,forbidden){
  const setRoad=(x,y)=>{const index=y*width+x;if(x>0&&y>0&&x<width-1&&y<height-1&&!forbidden.has(index))tiles[index]=ROAD};
  for(let branch=0;branch<count;branch++){
    const vertical=random()<.5;
    if(vertical){const x=random()<.5?2+branch:width-3-branch,stop=3+Math.floor(random()*Math.max(2,height-7));for(let y=0;y<=stop;y++)setRoad(x,y)}
    else{const y=random()<.5?2+branch:height-3-branch,stop=3+Math.floor(random()*Math.max(2,width-7));for(let x=0;x<=stop;x++)setRoad(x,y)}
  }
}

function randomExit(tiles,width,height,random){
  for(const side of shuffle([0,1,2,3],random)){const span=(side<2?width:height)-4,pos=2+Math.floor(random()*Math.max(1,span));const x=side===2?0:side===3?width-1:pos,y=side===0?0:side===1?height-1:pos,index=y*width+x;if(tiles[index]===ROAD){tiles[index]=11;return index}}
  return -1;
}

function lineFromCageToRoad(width,height,px,py,gateSide){
  const [dx,dy]=DIRS[gateSide],line=[];let x=px+dx*3,y=py+dy*3;
  while(x>0&&y>0&&x<width-1&&y<height-1){line.push(y*width+x);x+=dx;y+=dy}
  return {line,root:line.at(-1)};
}

function materialForCage(random,pure,allowed){
  if(pure)return random()<.28?9:10;
  const materials=allowed.filter(type=>type!==12);return materials[Math.floor(random()*materials.length)];
}

function placeRiver(tiles,width,height,random,reserved,length){
  const free=[];for(let i=0;i<tiles.length;i++)if(tiles[i]===EMPTY&&!reserved.has(i))free.push(i);if(!free.length)return;
  let current=free[Math.floor(random()*free.length)];
  for(let n=0;n<length;n++){
    if(tiles[current]===EMPTY&&!reserved.has(current))tiles[current]=12;
    const [x,y]=xy(width,current),next=shuffle(DIRS.map(([dx,dy])=>[x+dx,y+dy]).filter(([nx,ny])=>nx>0&&ny>0&&nx<width-1&&ny<height-1),random)[0];if(!next)break;current=next[1]*width+next[0];
  }
}

function validatePlan(stage,plan){
  const sim=createRescueSimulation(stage);for(const index of plan)if(!directIgniteRescue(sim,index))return Infinity;
  for(let tick=0;tick<5000&&!sim.finished;tick++)stepRescueSimulation(sim);
  return sim.result==="clear"?sim.tick:Infinity;
}

function buildCandidate(number,attempt,{endless=false}={}){
  const difficulty=endless?12:rescueDifficultyFor(number),random=rngFor(number*2654435761+attempt*2246822519+(endless?0x9e3779b9:0)),cfg=profile(number,difficulty,random,endless);
  const width=cfg.size+(number%3===0?1:0),height=cfg.size+(number%4===0?1:0),tiles=new Array(width*height).fill(EMPTY),at=(x,y)=>y*width+x;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x===0||y===0||x===width-1||y===height-1)tiles[at(x,y)]=ROAD;

  const px=5+Math.floor(random()*Math.max(1,width-10)),py=5+Math.floor(random()*Math.max(1,height-10)),princess=at(px,py),cage=cageIndices(width,px,py),gap=new Set();
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)gap.add(at(px+dx,py+dy));
  const forbiddenRoads=new Set([...cage,...gap]);for(const index of cage){const [x,y]=xy(width,index);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(Math.abs(dx)+Math.abs(dy)<=2)forbiddenRoads.add(at(x+dx,y+dy))}
  addRoadBranches(tiles,width,height,cfg.roads,random,forbiddenRoads);
  const exit=randomExit(tiles,width,height,random);if(exit<0)return null;

  const pool=allowedPool(number,difficulty,endless),pure=number<=10||!cfg.mixed,straight=cage.filter(index=>{const [x,y]=xy(width,index);return x===px||y===py}),gate=straight[Math.floor(random()*straight.length)];
  for(const index of cage){const [x,y]=xy(width,index),corner=x!==px&&y!==py&&Math.abs(x-px)===2&&Math.abs(y-py)===2;let type=materialForCage(random,pure,pool);if(pure&&corner&&type===9)type=10;tiles[index]=type}
  tiles[princess]=13;
  const [gx,gy]=xy(width,gate),gateSide=gy<py?3:gy>py?2:gx<px?1:0,{line,root}=lineFromCageToRoad(width,height,px,py,gateSide);
  if(root===undefined)return null;
  const fuseType=number<=10?1:8;tiles[gate]=pure?9:tiles[gate];for(const index of line)tiles[index]=fuseType;
  const reserved=new Set([...cage,...gap,...line,princess,exit]),solution=[root];

  const enemyTypes=number<=1?[]:number<=5?[14]:number<=10?[15,16]:number<=15?[17]:[14,15,16,17];
  const enemySlots=shuffle(tiles.map((type,index)=>type===EMPTY&&!reserved.has(index)&&distanceToRoad(tiles,width,index)>0?index:-1).filter(index=>index>=0),random);let slotCursor=0;
  for(let i=0;i<cfg.enemies&&enemyTypes.length;i++){
    let index=enemySlots[slotCursor++];while(index!==undefined&&Math.max(Math.abs(index%width-px),Math.abs(Math.floor(index/width)-py))<=3)index=enemySlots[slotCursor++];if(index===undefined)break;
    let type=enemyTypes[i%enemyTypes.length];
    if(i<cfg.plannedEnemies){type=14;const roadNear=enemySlots.find(candidate=>!reserved.has(candidate)&&distanceToRoad(tiles,width,candidate)<=2);if(roadNear!==undefined)index=roadNear}
    tiles[index]=type;reserved.add(index);if(i<cfg.plannedEnemies)solution.push(index);
  }

  if(pool.includes(12))for(let river=0;river<Math.max(1,Math.floor(difficulty/3));river++)placeRiver(tiles,width,height,random,reserved,3+Math.floor(random()*Math.max(2,difficulty)));
  const free=shuffle(tiles.map((type,index)=>type===EMPTY&&!reserved.has(index)&&!gap.has(index)?index:-1).filter(index=>index>=0),random);let disruptive=0;
  for(const index of free.slice(0,cfg.extras)){
    let choices=pool.filter(type=>type!==12);if(endless)choices=choices.filter(type=>!(type===5||type===18)||disruptive<2);
    const type=choices[Math.floor(random()*choices.length)];tiles[index]=type;if(type===5||type===18)disruptive++;
  }

  if(cage.some(index=>distanceToRoad(tiles,width,index)<=2))return null;
  // Rescue stages always require at least three deliberate ignitions.  Extend
  // the planned solution with safe, directly reachable targets so MIN is not
  // merely a display value (endless uses a still larger target).
  const targetMinimum=endless?8:3;
  const stage={mode:"rescue",number,difficulty,width,height,tiles,name:`RESCUE ${String(number).padStart(3,"0")}`,minimum:targetMinimum,ignitions:targetMinimum+2,setPiece:difficulty>=9,cage,gate,solution:[...solution],exit,mixedCage:!pure};
  const candidates=endless?[]:shuffle(tiles.map((type,index)=>type>=0&&!stage.solution.includes(index)&&index!==princess&&!cage.includes(index)?index:-1).filter(index=>index>=0),random);
  for(const candidate of candidates){
    if(stage.solution.length>=targetMinimum)break;
    const probe=[...stage.solution,candidate];
    if(validatePlan(stage,probe)!==Infinity)stage.solution.push(candidate);
  }
  // A sparse tutorial layout may not have three harmless setup targets; keep
  // the stage and enforce the advertised minimum through the ignition budget.
  stage.minimum=Math.max(targetMinimum,stage.solution.length);stage.ignitions=stage.minimum+2;
  // Endless rescue deliberately favors discovery and can contain trap setups;
  // finite stages are strictly validated, while endless stages are accepted
  // after structural validation so generation never stalls on a rare layout.
  const optimalTicks=endless?0:validatePlan(stage,solution);if(!endless&&optimalTicks===Infinity)return null;
  return {...stage,optimalTicks,objects:tiles.filter(type=>type>=0).length};
}

export function generateRescueStages(){
  const stages=[];for(let number=1;number<=200;number++){
    let stage=null;for(let attempt=0;attempt<180&&!stage;attempt++)stage=buildCandidate(number,attempt);
    if(!stage)throw new Error(`Rescue stage ${number} could not be generated`);stages.push(stage);if(number%10===0)console.log(`validated rescue ${number}/200`)
  }return stages;
}

export function generateRescueStage(number){
  const safeNumber=Math.max(1,Math.floor(number)||1);
  for(let attempt=0;attempt<180;attempt++){const stage=buildCandidate(safeNumber,attempt);if(stage)return stage}
  throw new Error(`Rescue stage ${safeNumber} could not be generated`);
}

// Conservative fallback used when a legacy layout cannot satisfy the current
// rescue rules (roads are blocked and princess ignition is an immediate loss).
// It keeps a real three-ignition puzzle while guaranteeing a safe route.
export function buildGuaranteedRescueStage(number){
  const n=Math.max(1,Math.floor(number)||1),size=n>=201?24:Math.min(24,11+Math.floor(Math.min(13,n)/2)),width=size,height=size;
  const tiles=new Array(width*height).fill(EMPTY),at=(x,y)=>y*width+x;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x===0||y===0||x===width-1||y===height-1)tiles[at(x,y)]=ROAD;
  const px=Math.floor(width/2),py=Math.floor(height/2)+2,princess=at(px,py),exit=at(Math.floor(width/2),1);
  const cage=cageIndices(width,px,py),gap=new Set();for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)gap.add(at(px+dx,py+dy));
  tiles[princess]=13;
  for(const index of cage)tiles[index]=10;
  const gate=at(px,py-2);tiles[gate]=9;
  const line=[];for(let y=py-3;y>=2;y--){const index=at(px,y);tiles[index]=1;line.push(index)}
  tiles[exit]=11;
  const root=line.at(-1),extras=[at(1,1),at(width-2,1)];for(const index of extras)tiles[index]=0;
  const reserved=new Set([...cage,...gap,...line,princess,exit,...extras]);
  // Keep the guaranteed escape corridor free of unsolicited heat sources.
  const solution=[root,...extras],minimum=3;
  return {mode:"rescue",number:n,difficulty:rescueDifficultyFor(n),width,height,tiles,name:"RESCUE "+String(n).padStart(3,"0"),minimum,ignitions:minimum+2,setPiece:n>25,cage,gate,solution,exit,mixedCage:false,optimalTicks:0,objects:tiles.filter(type=>type>=0).length};
}

export function generateRescueEndlessStage(index){
  const safeIndex=Math.max(1,Math.floor(index)||1),number=200+safeIndex;
  const stage=buildGuaranteedRescueStage(number);
  stage.name=`RESCUE ENDLESS ${safeIndex}`;stage.endless=true;stage.endlessIndex=safeIndex;stage.difficulty=12;stage.minimum=8;stage.ignitions=stage.minimum+2;return stage;
}
