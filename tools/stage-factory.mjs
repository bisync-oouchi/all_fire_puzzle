import {OBJECTS,EMPTY,ROAD,REMOVED,BURNING,CATEGORY_UTILITY,burnDifficultyFor} from "../src/definitions.js";
import {createSimulation,directIgnite,stepSimulation,isDirectlyIgnitable} from "../src/simulation.js";

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

function rngFor(seed){
  let n=seed>>>0;
  return ()=>((n=Math.imul(n^n>>>15,1|n),n^=n+Math.imul(n^n>>>7,61|n),((n^n>>>14)>>>0)/4294967296));
}

function shuffled(values,random){
  const out=[...values];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}
  return out;
}

function runClicks(stage,indices){
  const sim=createSimulation(stage),pending=new Set(indices),isRequired=c=>c.type>=0&&OBJECTS[c.type].category!==CATEGORY_UTILITY;
  const result=clear=>({ticks:clear?sim.tick:Infinity,signature:clear?"CLEAR":sim.cells.map(c=>c.type<0?"":`${c.state},${Math.round(c.heat)},${c.remaining},${c.charges}`).join(";")});
  const hasLiveExtinguisherNeighbor=index=>{
    const x=index%stage.width,y=Math.floor(index/stage.width);
    return DIRS.some(([dx,dy])=>{const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=stage.width||ny>=stage.height)return false;const cell=sim.cells[ny*stage.width+nx];return cell.type>=0&&OBJECTS[cell.type].category===CATEGORY_UTILITY&&cell.state!==REMOVED});
  };
  for(let i=0;i<4000;i++){
    let clicked=false;
    for(const index of [...pending]){
      const cell=sim.cells[index];
      if(cell.state===REMOVED||cell.state===BURNING){pending.delete(index);continue}
      if(isDirectlyIgnitable(sim,index)&&!hasLiveExtinguisherNeighbor(index)){directIgnite(sim,index);pending.delete(index);clicked=true}
    }
    if(sim.cells.every(c=>!isRequired(c)||c.state===REMOVED))return result(true);
    stepSimulation(sim,{skipOutcome:true});
    if(sim.cells.every(c=>!isRequired(c)||c.state===REMOVED))return result(true);
    if(!clicked&&!sim.cells.some(c=>c.state===BURNING))return result(false);
  }
  return result(false);
}
function simulateClicks(stage,indices){return runClicks(stage,indices).ticks}

function distinctSingleCandidates(stage,candidates){
  const outcomes=new Map();
  for(const index of candidates){const outcome=runClicks(stage,[index]);if(outcome.ticks<Infinity)return {winner:index,candidates:[index],ticks:outcome.ticks};if(!outcomes.has(outcome.signature))outcomes.set(outcome.signature,index)}
  return {winner:-1,candidates:[...outcomes.values()],ticks:Infinity};
}

export function analyze(stage){
  stage.ignitions=999;
  const probe=createSimulation(stage);
  const candidates=probe.cells.filter(c=>isDirectlyIgnitable(probe,c.index)).map(c=>c.index);
  let plan=[...new Set(stage.roots||[])].filter(index=>candidates.includes(index));
  if(!plan.length||simulateClicks(stage,plan)===Infinity)return null;
  const distinct=distinctSingleCandidates(stage,candidates);
  if(distinct.winner>=0)return {minimum:1,ignitions:3,optimalTicks:distinct.ticks,candidates:candidates.length,objects:stage.tiles.filter(t=>t>=0).length,plan:[distinct.winner]};
  const pairCandidates=stage.number<=25||stage.number>100||candidates.length<=28?distinct.candidates:[];
  for(let a=0;a<pairCandidates.length;a++)for(let b=a+1;b<pairCandidates.length;b++){
      const pair=[pairCandidates[a],pairCandidates[b]],ticks=simulateClicks(stage,pair);
      if(ticks<Infinity)return {minimum:2,ignitions:4,optimalTicks:ticks,candidates:candidates.length,objects:stage.tiles.filter(t=>t>=0).length,plan:pair};
    }
  let changed=true;
  while(changed){
    changed=false;
    for(const index of [...plan]){
      const trial=plan.filter(i=>i!==index);
      if(trial.length&&simulateClicks(stage,trial)<Infinity){plan=trial;changed=true}
    }
  }

  const minimum=plan.length;
  plan.sort((a,b)=>(stage.tiles[a]===20)-(stage.tiles[b]===20));
  const ignitions=minimum+2,best=simulateClicks(stage,plan);
  if(best===Infinity)return null;
  return {minimum,ignitions,optimalTicks:best,candidates:candidates.length,objects:stage.tiles.filter(t=>t>=0).length,plan};
}

function analyzeCurated(stage,sourceNumber){
  stage.ignitions=999;const probe=createSimulation(stage),candidates=probe.cells.filter(c=>isDirectlyIgnitable(probe,c.index)).map(c=>c.index),objects=stage.tiles.filter(t=>t>=0).length;
  const distinct=distinctSingleCandidates(stage,candidates);if(distinct.winner>=0)return {minimum:1,ignitions:3,optimalTicks:distinct.ticks,candidates:candidates.length,objects};
  for(let a=0;a<distinct.candidates.length;a++)for(let b=a+1;b<distinct.candidates.length;b++){const ticks=simulateClicks(stage,[distinct.candidates[a],distinct.candidates[b]]);if(ticks<Infinity)return {minimum:2,ignitions:4,optimalTicks:ticks,candidates:candidates.length,objects}}
  const corrected={50:2,74:4,89:3,95:4,96:7,100:5,186:6},minimum=corrected[sourceNumber]||Math.max(3,stage.minimum||3);
  return {minimum,ignitions:minimum+2,optimalTicks:stage.optimalTicks||1,candidates:candidates.length,objects};
}

function validNext(sourceType,targetType){
  if(sourceType===5||sourceType===6||sourceType===18)return false;
  if(sourceType===20)return true;
  return OBJECTS[sourceType].heat*OBJECTS[sourceType].duration>=OBJECTS[targetType].threshold;
}

export function objectComponentSizes(stage){
  const seen=new Set(),sizes=[];
  for(let start=0;start<stage.tiles.length;start++){
    if(stage.tiles[start]<0||seen.has(start))continue;
    const stack=[start];seen.add(start);let size=0;
    while(stack.length){
      const index=stack.pop(),x=index%stage.width,y=Math.floor(index/stage.width);size++;
      for(const [dx,dy] of DIRS){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=stage.width||ny>=stage.height)continue;const next=ny*stage.width+nx;if(stage.tiles[next]>=0&&!seen.has(next)){seen.add(next);stack.push(next)}}
    }
    sizes.push(size);
  }
  return sizes;
}

function hasValidComponents(stage){return objectComponentSizes(stage).every(size=>size>=5)}

function poolFor(stageNumber,difficulty,endless=false){
  if(endless){const pool=[0,0,1,1,1,2,2,2,3,3,4,4,7,7,8,8,19,20,20,20];if(stageNumber%6===0)pool.push(5);if(stageNumber%8===0)pool.push(18);return pool}
  const basicTutorials=[[0,1],[0,2],[1,2],[1,7],[7,3],[2,19],[0,1,2],[1,2,3,7],[2,3,19],[0,1,2,3,7,19]];
  if(stageNumber<=10)return basicTutorials[stageNumber-1];
  const gimmickTutorials=[[4,19],[0,8,19],[1,20],[0,2,20],[1,5],[1,2,18],[2,18,20],[0,4,8,19],[1,5,7,18],[0,1,2,4,5,7,8,18,19,20]];
  if(stageNumber<=20)return gimmickTutorials[stageNumber-11];
  if(difficulty===3)return [0,1,2,3,4,5,7,8,18,19,20];
  if(difficulty===4)return [0,1,2,3,4,5,7,8,18,19,20];
  if(difficulty<=6)return [[0,1,2,3,4,7,8,18,19,20],[0,1,2,3,4,5,7,8,19,20],[0,1,2,3,7,8,18,19,20]][stageNumber%3];
  return [0,1,2,3,4,5,7,8,18,19,20];
}

function profileFor(stageNumber,difficulty,random,endless=false){
  if(endless)return {
    innerW:18+Math.floor(random()*4),innerH:18+Math.floor(random()*4),
    objectTarget:165+Math.floor(random()*31),manualTarget:24+Math.floor(random()*8),
    rootTarget:5+Math.floor(random()*4),density:.7,setPiece:true
  };
  const bands={
    1:{start:1,end:10,size:[6,9],objects:[15,38],manual:[5,10],roots:[1,2],density:.58},
    2:{start:11,end:20,size:[8,12],objects:[28,64],manual:[7,14],roots:[2,5],density:.64},
    3:{start:21,end:25,size:[11,14],objects:[48,88],manual:[10,18],roots:[4,7],density:.68},
    4:{start:26,end:30,size:[12,15],objects:[120,210],manual:[15,24],roots:[5,8],density:1},
    5:{start:31,end:50,size:[13,18],objects:[72,135],manual:[14,23],roots:[5,9],density:.64},
    6:{start:51,end:70,size:[16,20],objects:[125,188],manual:[18,29],roots:[7,11],density:.76},
    7:{start:71,end:85,size:[17,21],objects:[125,190],manual:[20,32],roots:[7,12],density:.7},
    8:{start:86,end:100,size:[18,22],objects:[160,215],manual:[24,38],roots:[9,14],density:.8},
    9:{start:101,end:200,size:[18,22],objects:[168,220],manual:[24,42],roots:[10,16],density:.82}
  };
  const band=bands[difficulty],p=(stageNumber-band.start)/Math.max(1,band.end-band.start);
  let size=Math.round(band.size[0]+(band.size[1]-band.size[0])*p);
  const setPiece=difficulty>=6&&(stageNumber%5===0||difficulty>=8);
  const innerW=Math.max(6,size-(stageNumber%4===0?1:0)),innerH=Math.max(6,size-(stageNumber%3===0?1:0));
  const interpolate=range=>Math.round(range[0]+(range[1]-range[0])*p);
  return {
    innerW,innerH,
    objectTarget:interpolate(band.objects)+Math.floor(random()*5)-2,
    manualTarget:interpolate(band.manual),
    rootTarget:interpolate(band.roots),density:band.density,setPiece
  };
}

function addRoads(tiles,width,height,difficulty,random,endlessIndex=0){
  const setRoad=(x,y)=>{if(x>=0&&y>=0&&x<width&&y<height)tiles[y*width+x]=ROAD};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x===0||y===0||x===width-1||y===height-1)setRoad(x,y);
  const drawRect=(x1,y1,x2,y2)=>{
    for(let x=x1;x<=x2;x++){setRoad(x,y1);setRoad(x,y2)}
    for(let y=y1;y<=y2;y++){setRoad(x1,y);setRoad(x2,y)}
    for(let y=0;y<=y1;y++)setRoad(x1,y);
  };
  const randomStart=(limit,size)=>2+Math.floor(random()*Math.max(1,limit-size-3));
  if(endlessIndex>0){
    const mode=(endlessIndex-1)%4;
    if(mode===0){
      const rectW=5+Math.floor(random()*4),rectH=5+Math.floor(random()*5),x1=randomStart(width,rectW),y1=randomStart(height,rectH);
      drawRect(x1,y1,x1+rectW-1,y1+rectH-1);
    }else if(mode===1){
      const rectW=4+Math.floor(random()*3),rectH=7+Math.floor(random()*4),y1=randomStart(height,rectH),left=2+Math.floor(random()*2),right=width-rectW-2-Math.floor(random()*2);
      drawRect(left,y1,left+rectW-1,y1+rectH-1);drawRect(right,y1,right+rectW-1,y1+rectH-1);
    }else if(mode===2){
      const rectW=8+Math.floor(random()*4),rectH=4+Math.floor(random()*2),x1=randomStart(width,rectW),top=2+Math.floor(random()*2),bottom=height-rectH-2-Math.floor(random()*2);
      drawRect(x1,top,x1+rectW-1,top+rectH-1);drawRect(x1,bottom,x1+rectW-1,bottom+rectH-1);
    }else{
      const firstW=6+Math.floor(random()*3),firstH=5+Math.floor(random()*3),secondW=5+Math.floor(random()*3),secondH=6+Math.floor(random()*3);
      const firstX=2+Math.floor(random()*3),firstY=2+Math.floor(random()*3),secondX=width-secondW-2-Math.floor(random()*3),secondY=height-secondH-2-Math.floor(random()*3);
      drawRect(firstX,firstY,firstX+firstW-1,firstY+firstH-1);drawRect(secondX,secondY,secondX+secondW-1,secondY+secondH-1);
    }
    return;
  }
  if(difficulty===4&&width>=14&&height>=14&&random()<.65){
    const rectW=4+Math.floor(random()*2),rectH=4+Math.floor(random()*2),x1=Math.floor((width-rectW)/2),y1=Math.floor((height-rectH)/2);
    drawRect(x1,y1,x1+rectW-1,y1+rectH-1);
  }else if(difficulty>=7&&width>=19&&height>=19){
    const count=difficulty>=9?3:difficulty===8?2+(random()<.5?1:0):2;
    for(let i=0;i<count;i++){
      const rectW=4+Math.floor(random()*Math.max(2,Math.min(6,width-8))),rectH=4+Math.floor(random()*Math.max(2,Math.min(6,height-8)));
      const x1=2+Math.floor(random()*Math.max(1,width-rectW-4)),y1=2+Math.floor(random()*Math.max(1,height-rectH-4));
      drawRect(x1,y1,Math.min(width-3,x1+rectW-1),Math.min(height-3,y1+rectH-1));
    }
  }
}

export function buildCandidate(stageNumber,attempt,{endless=false}={}){
  const difficulty=endless?8:burnDifficultyFor(stageNumber),random=rngFor(stageNumber*7919+attempt*104729+(endless?0x6d2b79f5:0)),profile=profileFor(stageNumber,difficulty,random,endless);
  const {innerW,innerH}=profile,width=innerW+2,height=innerH+2,tiles=new Array(width*height).fill(EMPTY);
  addRoads(tiles,width,height,difficulty,random,endless?stageNumber:0);
  const indexOf=(x,y)=>y*width+x,toXY=index=>[index%width,Math.floor(index/width)];
  const neighbors=index=>{
    const [x,y]=toXY(index),out=[];
    for(const [dx,dy] of DIRS){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<width-1&&ny<height-1)out.push(indexOf(nx,ny))}
    return out;
  };
  const isNearRoad=index=>{
    const [x,y]=toXY(index);
    for(let yy=Math.max(0,y-2);yy<=Math.min(height-1,y+2);yy++){
      const dx=2-Math.abs(yy-y);
      for(let xx=Math.max(0,x-dx);xx<=Math.min(width-1,x+dx);xx++)if(tiles[indexOf(xx,yy)]===ROAD)return true;
    }
    return false;
  };

  const pool=poolFor(stageNumber,difficulty,endless),growthPool=pool.filter(t=>t!==6);
  const roots=[],reserved=new Set(),used=new Set(),parentOf=new Map();
  const freeInterior=()=>tiles.map((t,i)=>t===EMPTY&&i>=width&&i<width*(height-1)?i:-1).filter(i=>i>=0);

  const directSlots=()=>shuffled(freeInterior().filter(i=>isNearRoad(i)&&!reserved.has(i)),random);
  const rootTypes=growthPool.filter(type=>OBJECTS[type].heat>0&&type!==18).sort((a,b)=>OBJECTS[b].heat*OBJECTS[b].duration-OBJECTS[a].heat*OBJECTS[a].duration);let rootCursor=0;
  const addRoot=preferred=>{
    const type=preferred??rootTypes[rootCursor++%rootTypes.length],occupied=tiles.some(t=>t>=0);
    if(!occupied){const slot=directSlots()[0];if(slot===undefined)return null;tiles[slot]=type;roots.push(slot);used.add(type);return {index:slot,type,added:[slot]}}
    const barrierType=!endless&&stageNumber<=20&&pool.includes(5)&&random()<.25?5:growthPool[0];
    for(const anchor of shuffled(tiles.map((t,i)=>t>=0&&validNext(t,barrierType)?i:-1).filter(i=>i>=0),random)){
      for(const barrier of shuffled(neighbors(anchor).filter(n=>tiles[n]===EMPTY&&!reserved.has(n)&&(barrierType!==6||isNearRoad(n))),random)){
        const slots=shuffled(neighbors(barrier).filter(slot=>slot!==anchor&&tiles[slot]===EMPTY&&!reserved.has(slot)&&isNearRoad(slot)&&neighbors(slot).every(n=>n===barrier||tiles[n]<0)),random),slot=slots[0];
        if(slot===undefined)continue;
        tiles[barrier]=barrierType;tiles[slot]=type;roots.push(slot);used.add(barrierType);used.add(type);return {index:slot,type,added:[barrier,slot]};
      }
    }
    return null;
  };

  const frontier=[];
  for(let i=roots.length;i<profile.rootTarget;i++){
    const preferred=rootTypes[i%rootTypes.length],root=addRoot(preferred);if(root&&OBJECTS[root.type].heat>0)frontier.push(root);
  }
  if(!roots.length)return null;

  let objectCount=tiles.reduce((n,t)=>n+(t>=0),0),manualCount=tiles.reduce((n,t,i)=>n+(t>=0&&OBJECTS[t].category!==CATEGORY_UTILITY&&isNearRoad(i)),0);
  const target=Math.min(profile.objectTarget,Math.floor(freeInterior().length*Math.min(.82,profile.density))+objectCount);
  let guard=0;
  while(objectCount<target&&guard++<target*30){
    if(!frontier.length){const root=addRoot();if(!root)break;objectCount+=root.added.length;manualCount+=root.added.reduce((n,index)=>n+(OBJECTS[tiles[index]].category!==CATEGORY_UTILITY&&isNearRoad(index)),0);if(OBJECTS[root.type].heat>0)frontier.push(root);continue}
    const options=[];
    for(const parent of frontier)for(const spot of neighbors(parent.index))if(tiles[spot]===EMPTY&&!reserved.has(spot))options.push({parent,spot});
    if(!options.length){frontier.length=0;continue}
    const preferred=options.filter(option=>!isNearRoad(option.spot));
    const {parent,spot}=(preferred.length?preferred:options)[Math.floor(random()*(preferred.length||options.length))];
    const missing=growthPool.filter(t=>!used.has(t)&&validNext(parent.type,t));
    const choices=growthPool.filter(t=>validNext(parent.type,t));
    if(!choices.length){frontier.splice(frontier.indexOf(parent),1);continue}
    const type=(missing.length?missing:choices)[Math.floor(random()*(missing.length||choices.length))];
    tiles[spot]=type;used.add(type);parentOf.set(spot,parent.index);objectCount++;if(isNearRoad(spot))manualCount++;
    if(OBJECTS[type].heat>0&&type!==6)frontier.push({index:spot,type});
    if(random()<.18&&frontier.length>8)frontier.shift();
  }

  for(const type of difficulty<=2?growthPool:[]){
    if(used.has(type))continue;
    const root=addRoot(type);if(!root)return null;objectCount+=root.added.length;manualCount+=root.added.reduce((n,index)=>n+(OBJECTS[tiles[index]].category!==CATEGORY_UTILITY&&isNearRoad(index)),0);used.add(type);
  }

  let optionGuard=0;
  while(manualCount<profile.manualTarget&&optionGuard++<200){
    const slot=directSlots().find(index=>neighbors(index).some(n=>tiles[n]>=0&&OBJECTS[tiles[n]].heat>0&&validNext(tiles[n],growthPool[0])));
    if(slot===undefined)break;
    const parent=neighbors(slot).find(n=>tiles[n]>=0&&OBJECTS[tiles[n]].heat>0);
    const choices=growthPool.filter(t=>validNext(tiles[parent],t));if(!choices.length)break;
    tiles[slot]=choices[Math.floor(random()*choices.length)];objectCount++;manualCount++;
  }

  if(difficulty===4){
    for(let index=0;index<tiles.length;index++)if(tiles[index]===EMPTY)tiles[index]=0;
    const seen=new Set();
    for(let start=0;start<tiles.length;start++){
      if(tiles[start]<0||seen.has(start))continue;const stack=[start],component=[];seen.add(start);
      while(stack.length){const index=stack.pop();component.push(index);for(const next of neighbors(index))if(tiles[next]>=0&&!seen.has(next)){seen.add(next);stack.push(next)}}
      if(!component.some(index=>roots.includes(index))){const extra=component.find(isNearRoad);if(extra!==undefined)roots.push(extra)}
    }
  }

  const stage={mode:"burn",number:stageNumber,difficulty,width,height,tiles,roots,name:`STAGE ${String(stageNumber).padStart(2,"0")}`,setPiece:profile.setPiece};
  return stage;
}

const CURATED_PLACEMENT=new Map([
  [7,17],
  [11,21],[12,24],[13,29],[14,32],[15,33],[16,43],[17,94],[18,18],[19,11],[20,31],
  [21,93],[22,39],[23,42],[24,92],[25,64],
  [31,37],[32,50],[33,57],[34,58],[35,66],[36,74],[37,82],[38,108],[39,119],[40,133],[41,135],[42,151],[43,157],[44,163],[45,176],[46,180],[47,27],[48,28],
  [51,73],[52,100],[53,130],[54,170],[55,172],[56,186],[57,196],
  [86,25],[87,89],[88,90],[89,95],[90,96],[91,99],[92,174],[93,199]
]);

function adoptCurated(number,fixtures){
  const sourceNumber=CURATED_PLACEMENT.get(number);if(!sourceNumber)return null;
  const fixture=fixtures.find(item=>item.sourceNumber===sourceNumber);if(!fixture)return null;
  const stage={...fixture.stage,tiles:[...fixture.stage.tiles],mode:"burn",number,difficulty:burnDifficultyFor(number),name:`STAGE ${String(number).padStart(2,"0")}`,curated:sourceNumber};
  const analysis=analyzeCurated(stage,sourceNumber);return {...stage,...analysis,ignitions:analysis.minimum+2};
}

export function generateStages(fixtures=[]){
  const stages=[];
  for(let number=1;number<=200;number++){
    let adopted=adoptCurated(number,fixtures);
    for(let attempt=0;attempt<420&&!adopted;attempt++){
      const candidate=buildCandidate(number,attempt);if(!candidate)continue;
      const analysis=analyze(candidate);
      const minCandidates={1:4,2:6,3:9,4:12,5:14,6:18,7:20,8:24,9:24}[candidate.difficulty],maxCandidates={1:30,2:26,3:36,4:180,5:65,6:80,7:90,8:110,9:130}[candidate.difficulty];
      const minObjects={1:15,2:28,3:45,4:120,5:70,6:120,7:120,8:155,9:160}[candidate.difficulty],fullEnough=candidate.difficulty!==4||candidate.tiles.every(type=>type!==EMPTY),factoryFirst=analysis?.plan?.length&&candidate.tiles[analysis.plan[0]]===20;
      if(analysis&&hasValidComponents(candidate)&&fullEnough&&analysis.objects>=minObjects&&analysis.objects<=225&&analysis.candidates>=minCandidates&&analysis.candidates<=maxCandidates&&(number<=100||analysis.minimum>=3)&&!(number>100&&factoryFirst))adopted={...candidate,...analysis};
    }
    if(!adopted)throw new Error(`Stage ${number} could not be generated`);
    if(adopted.plan?.length)adopted.optimalFirst=adopted.tiles[adopted.plan[0]];delete adopted.roots;delete adopted.plan;stages.push(adopted);
    if(number%10===0)console.log(`validated ${number}/200`);
  }
  return stages;
}

export function generateEndlessStage(index){
  const safeIndex=Math.max(1,Math.floor(index)||1),number=200+safeIndex;
  for(let attempt=0;attempt<420;attempt++){
    const candidate=buildCandidate(safeIndex,attempt,{endless:true});if(!candidate)continue;
    const analysis=analyze(candidate);
    const disruptive=candidate.tiles.reduce((count,type)=>count+(type===5||type===18?1:0),0);
    if(!analysis||!hasValidComponents(candidate)||analysis.minimum<1||analysis.minimum>3||analysis.objects<150||analysis.objects>205||analysis.candidates<22||analysis.candidates>120||disruptive>Math.ceil(analysis.objects*.05))continue;
    delete candidate.roots;
    delete analysis.plan;return {...candidate,...analysis,number,name:`ENDLESS ${safeIndex}`,endless:true,endlessIndex:safeIndex,setPiece:true};
  }
  throw new Error(`Endless stage ${safeIndex} could not be generated`);
}
