import {OBJECTS,TICKS_PER_SECOND,ROAD,IDLE,BURNING,REMOVED,CATEGORY_COMBUSTIBLE,CATEGORY_MELTABLE,CATEGORY_UTILITY,MODE_BURN} from "./definitions.js";

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const categoryOf=cell=>cell.type>=0?OBJECTS[cell.type].category:null;
const isRequiredCell=cell=>cell.type>=0&&categoryOf(cell)!==CATEGORY_UTILITY;
const isCombustibleCell=cell=>cell.type>=0&&categoryOf(cell)===CATEGORY_COMBUSTIBLE;

export function createSimulation(stage){
  const cells=stage.tiles.map((type,index)=>({index,type,state:type>=0?IDLE:REMOVED,heat:0,remaining:type>=0&&OBJECTS[type].category===CATEGORY_COMBUSTIBLE?OBJECTS[type].duration*TICKS_PER_SECOND:0,charges:type>=0&&OBJECTS[type].category===CATEGORY_UTILITY?OBJECTS[type].charges:0,ignitedAt:-1}));
  return {mode:MODE_BURN,stage,cells,tick:0,started:false,finished:false,result:null,ignitionsLeft:stage.ignitions,totalObjects:cells.filter(isRequiredCell).length,burnedObjects:0,lastEvents:[],futureVerdict:null};
}

export function cloneSimulation(sim){return {...sim,cells:sim.cells.map(c=>({...c})),lastEvents:[]}}
export function xyToIndex(stage,x,y){return y*stage.width+x}
export function indexToXY(stage,index){return [index%stage.width,Math.floor(index/stage.width)]}

export function isDirectlyIgnitable(sim,index){
  const cell=sim.cells[index];
  if(!cell||!isRequiredCell(cell)||cell.state!==IDLE||sim.ignitionsLeft<=0||sim.finished)return false;
  const [x,y]=indexToXY(sim.stage,index);
  for(let yy=Math.max(0,y-2);yy<=Math.min(sim.stage.height-1,y+2);yy++){
    const dx=2-Math.abs(yy-y);
    for(let xx=Math.max(0,x-dx);xx<=Math.min(sim.stage.width-1,x+dx);xx++)if(sim.stage.tiles[xyToIndex(sim.stage,xx,yy)]===ROAD)return true;
  }
  return false;
}

export function directIgnite(sim,index){
  if(!isDirectlyIgnitable(sim,index))return false;
  const cell=sim.cells[index];sim.ignitionsLeft--;sim.started=true;sim.futureVerdict=null;
  if(categoryOf(cell)===CATEGORY_MELTABLE){cell.state=REMOVED;cell.heat=0;sim.burnedObjects++;sim.lastEvents.push({kind:"melt",index,type:cell.type,direct:true})}
  else{cell.state=BURNING;cell.heat=0;cell.ignitedAt=sim.tick;sim.lastEvents.push({kind:"ignite",index,type:cell.type,direct:true})}
  return true;
}

function neighbors(stage,index){
  const [x,y]=indexToXY(stage,index),out=[];
  for(const [dx,dy] of DIRS){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<stage.width&&ny<stage.height)out.push(xyToIndex(stage,nx,ny))}
  return out;
}

function squareAround(stage,index,radius){
  const [x,y]=indexToXY(stage,index),out=[];
  for(let yy=Math.max(0,y-radius);yy<=Math.min(stage.height-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(stage.width-1,x+radius);xx++){const next=xyToIndex(stage,xx,yy);if(next!==index)out.push(next)}
  return out;
}

function explodeFactory(sim,index,events){
  const targets=[];
  for(const targetIndex of squareAround(sim.stage,index,2)){
    const target=sim.cells[targetIndex];if(!target||target.state!==IDLE||!isRequiredCell(target))continue;
    target.heat=0;targets.push(targetIndex);
    if(categoryOf(target)===CATEGORY_MELTABLE){target.state=REMOVED;sim.burnedObjects++;events.push({kind:"melt",index:targetIndex,type:target.type,blast:true})}
    else if(categoryOf(target)===CATEGORY_COMBUSTIBLE){target.state=BURNING;target.ignitedAt=sim.tick+1;events.push({kind:"ignite",index:targetIndex,type:target.type,blast:true})}
  }
  events.push({kind:"blast",index,targets});
}

function releaseWater(sim,index,events){
  const targets=[];
  for(const targetIndex of neighbors(sim.stage,index)){
    const target=sim.cells[targetIndex];if(!target||target.state===REMOVED||!isRequiredCell(target))continue;
    target.heat=0;targets.push(targetIndex);
    if(target.state===BURNING){target.state=IDLE;events.push({kind:"extinguish",index:targetIndex,type:target.type,water:true})}
  }
  events.push({kind:"waterBurst",index,targets});
}

export function stepSimulation(sim,{skipOutcome=false,allowFinished=false}={}){
  if(sim.finished&&!allowFinished)return sim.lastEvents=[];
  const events=[],activeAtStart=sim.cells.filter(cell=>cell.state===BURNING&&isCombustibleCell(cell)).map(cell=>cell.index),activeSet=new Set(activeAtStart),activations=[];
  for(const cell of sim.cells){
    if(categoryOf(cell)===CATEGORY_UTILITY&&cell.state!==REMOVED&&cell.charges>0&&neighbors(sim.stage,cell.index).some(index=>activeSet.has(index)))activations.push(cell.index);
  }

  const suppressed=new Set();
  for(const sourceIndex of activations){
    const source=sim.cells[sourceIndex];source.charges--;const targets=[];
    for(const n of neighbors(sim.stage,sourceIndex)){
      const target=sim.cells[n];if(!isCombustibleCell(target)||target.state===REMOVED)continue;
      suppressed.add(n);targets.push(n);target.heat=0;
      if(target.state===BURNING){target.state=IDLE;events.push({kind:"extinguish",index:n,type:target.type})}
    }
    events.push({kind:"powder",index:sourceIndex,targets,charges:source.charges});
    if(source.charges<=0){source.state=REMOVED;events.push({kind:"utilitySpent",index:sourceIndex,type:source.type})}
  }

  const heatGain=new Float32Array(sim.cells.length);
  for(const index of activeAtStart){
    const source=sim.cells[index];if(source.state!==BURNING||suppressed.has(index))continue;
    const def=OBJECTS[source.type];if(def.heat<=0)continue;
    const heatPerTick=def.heat/TICKS_PER_SECOND;
    for(const n of neighbors(sim.stage,index)){const target=sim.cells[n];if(isRequiredCell(target)&&target.state===IDLE&&!suppressed.has(n))heatGain[n]+=heatPerTick}
  }

  for(let i=0;i<sim.cells.length;i++){
    const cell=sim.cells[i];if(cell.state!==IDLE||!isRequiredCell(cell)||suppressed.has(i))continue;
    cell.heat+=heatGain[i];
    if(cell.heat+1e-6>=OBJECTS[cell.type].threshold){
      cell.heat=0;
      if(categoryOf(cell)===CATEGORY_MELTABLE){cell.state=REMOVED;sim.burnedObjects++;events.push({kind:"melt",index:i,type:cell.type,direct:false})}
      else{cell.state=BURNING;cell.ignitedAt=sim.tick+1;events.push({kind:"ignite",index:i,type:cell.type,direct:false})}
    }
  }

  const burnedOut=[];
  for(const index of activeAtStart){
    const cell=sim.cells[index];if(cell.state!==BURNING||!isCombustibleCell(cell)||suppressed.has(index))continue;
    cell.remaining--;
    if(cell.remaining<=0){cell.state=REMOVED;sim.burnedObjects++;burnedOut.push({index,type:cell.type});events.push({kind:"burnout",index,type:cell.type})}
  }
  for(const item of burnedOut)if(item.type===20)explodeFactory(sim,item.index,events);
  for(const item of burnedOut)if(item.type===18)releaseWater(sim,item.index,events);

  if(sim.started)sim.tick++;
  sim.lastEvents=events;if(!skipOutcome)evaluateOutcome(sim);return events;
}

function hasManualTarget(sim){return sim.ignitionsLeft>0&&sim.cells.some(c=>isDirectlyIgnitable(sim,c.index))}

export function predictAutonomousFuture(sim,maxTicks=4000){
  const future=cloneSimulation(sim);
  for(let i=0;i<maxTicks;i++){
    if(future.cells.every(c=>!isRequiredCell(c)||c.state===REMOVED))return "clear";
    if(hasManualTarget(future))return "manual";
    const signature=future.cells.map(c=>c.type<0?"":`${c.state},${Math.round(c.heat*10)},${c.remaining},${c.charges}`).join(";");
    stepSimulation(future,{skipOutcome:true});
    const next=future.cells.map(c=>c.type<0?"":`${c.state},${Math.round(c.heat*10)},${c.remaining},${c.charges}`).join(";");
    if(signature===next)return "stuck";
  }
  return "stuck";
}

export function evaluateOutcome(sim){
  if(sim.finished||!sim.started)return sim.result;
  if(sim.cells.every(c=>!isRequiredCell(c)||c.state===REMOVED)){sim.finished=true;sim.result="clear";return sim.result}
  if(hasManualTarget(sim)||sim.cells.some(c=>c.state===BURNING))return null;
  // Heat changes only while something is burning. Once both manual targets and
  // active flames are gone, the real board is settled and no look-ahead clone
  // is needed. This keeps large endless-stage clear/fail checks instantaneous.
  sim.finished=true;sim.result="fail";return sim.result;
}

export function ratingFor(ignitionsLeft,cleared=true){return cleared?Math.max(1,Math.min(3,Math.floor(ignitionsLeft)+1)):0}
export function remainingCount(sim){return sim.cells.reduce((n,c)=>n+(isRequiredCell(c)&&c.state!==REMOVED?1:0),0)}

export function unreachableCount(sim){
  if(sim.finished||sim.ignitionsLeft<=0)return 0;
  const pending=sim.cells.filter(cell=>isRequiredCell(cell)&&cell.state!==REMOVED),reachable=new Set(),queue=[];
  const nearRoad=index=>{const [x,y]=indexToXY(sim.stage,index);for(let yy=Math.max(0,y-2);yy<=Math.min(sim.stage.height-1,y+2);yy++){const dx=2-Math.abs(yy-y);for(let xx=Math.max(0,x-dx);xx<=Math.min(sim.stage.width-1,x+dx);xx++)if(sim.stage.tiles[xyToIndex(sim.stage,xx,yy)]===ROAD)return true}return false};
  for(const cell of pending)if(cell.state===BURNING||nearRoad(cell.index)){reachable.add(cell.index);queue.push(cell.index)}
  for(let head=0;head<queue.length;head++){
    const index=queue[head],source=sim.cells[index];if(source.state===REMOVED)continue;
    const def=OBJECTS[source.type];if(def.heat<=0&&source.type!==20)continue;
    const targets=source.type===20?squareAround(sim.stage,index,2):neighbors(sim.stage,index);
    for(const targetIndex of targets){const target=sim.cells[targetIndex];if(target&&isRequiredCell(target)&&target.state!==REMOVED&&!reachable.has(targetIndex)){reachable.add(targetIndex);queue.push(targetIndex)}}
  }
  return pending.reduce((count,cell)=>count+(!reachable.has(cell.index)?1:0),0);
}

export function simulatePlan(stage,plan,maxTicks=4000){
  const sim=createSimulation(stage),actions=new Map();
  for(const action of plan){const list=actions.get(action.tick)||[];list.push(action.index);actions.set(action.tick,list)}
  for(let t=0;t<maxTicks&&!sim.finished;t++){for(const index of actions.get(t)||[])directIgnite(sim,index);stepSimulation(sim)}
  return sim;
}
