import {OBJECTS,TICKS_PER_SECOND,EMPTY,ROAD,IDLE,BURNING,REMOVED,CATEGORY_COMBUSTIBLE,CATEGORY_MELTABLE,CATEGORY_UTILITY,CATEGORY_TERRAIN,CATEGORY_ACTOR,CATEGORY_ENEMY} from "./definitions.js";

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const isLivingType=type=>type>=0&&(OBJECTS[type].category===CATEGORY_ACTOR||OBJECTS[type].category===CATEGORY_ENEMY);
const isStaticFuel=cell=>cell.type>=0&&OBJECTS[cell.type].category===CATEGORY_COMBUSTIBLE;
const isHeatTarget=cell=>cell.type>=0&&(OBJECTS[cell.type].category===CATEGORY_COMBUSTIBLE||OBJECTS[cell.type].category===CATEGORY_MELTABLE);
const xy=(stage,index)=>[index%stage.width,Math.floor(index/stage.width)];

function neighbors(stage,index){
  const [x,y]=xy(stage,index),out=[];
  for(const [dx,dy] of DIRS){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<stage.width&&ny<stage.height)out.push(ny*stage.width+nx)}
  return out;
}

function squareAround(stage,index,radius){
  const [x,y]=xy(stage,index),out=[];
  for(let yy=Math.max(0,y-radius);yy<=Math.min(stage.height-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(stage.width-1,x+radius);xx++){const next=yy*stage.width+xx;if(next!==index)out.push(next)}
  return out;
}

export function createRescueSimulation(stage){
  const entities=[];
  const terrain=stage.tiles.map((type,index)=>{
    if(isLivingType(type)){entities.push({id:entities.length,type,index,state:IDLE,heat:0,remaining:OBJECTS[type].duration*TICKS_PER_SECOND,moveProgress:0,patrolDir:1,facing:1,removed:false});return EMPTY}
    return type;
  });
  const cells=terrain.map((type,index)=>({index,type,state:type>=0?IDLE:REMOVED,heat:0,remaining:type>=0&&OBJECTS[type].category===CATEGORY_COMBUSTIBLE?OBJECTS[type].duration*TICKS_PER_SECOND:0,charges:type>=0&&OBJECTS[type].category===CATEGORY_UTILITY?OBJECTS[type].charges:0,ignitedAt:-1}));
  const princess=entities.find(entity=>OBJECTS[entity.type].category===CATEGORY_ACTOR);
  return {mode:"rescue",stage:{...stage,tiles:terrain},cells,entities,princess,tick:0,started:false,finished:false,result:null,resultReason:null,ignitionsLeft:stage.ignitions,lastEvents:[],futureVerdict:null,princessEscaped:false};
}

export function rescueEntityAt(sim,index){return sim.entities.find(entity=>!entity.removed&&entity.index===index)||null}

function nearRoad(sim,index){
  const [x,y]=xy(sim.stage,index);
  for(let yy=Math.max(0,y-2);yy<=Math.min(sim.stage.height-1,y+2);yy++){
    const dx=2-Math.abs(yy-y);
    for(let xx=Math.max(0,x-dx);xx<=Math.min(sim.stage.width-1,x+dx);xx++){const type=sim.stage.tiles[yy*sim.stage.width+xx];if(type===ROAD||type===11)return true}
  }
  return false;
}

export function isRescueDirectlyIgnitable(sim,index){
  if(sim.finished||sim.ignitionsLeft<=0||index<0)return false;
  const entity=rescueEntityAt(sim,index);
  if(entity)return OBJECTS[entity.type].category===CATEGORY_ENEMY&&entity.state===IDLE&&nearRoad(sim,index);
  const cell=sim.cells[index];
  return Boolean(cell&&cell.type>=0&&cell.state===IDLE&&(isStaticFuel(cell)||OBJECTS[cell.type].category===CATEGORY_MELTABLE)&&nearRoad(sim,index));
}

export function directIgniteRescue(sim,index){
  if(!isRescueDirectlyIgnitable(sim,index))return false;
  const entity=rescueEntityAt(sim,index);sim.ignitionsLeft--;sim.started=true;
  if(entity){entity.state=BURNING;entity.heat=0;sim.lastEvents.push({kind:"ignite",index,type:entity.type,direct:true,entity:true});return true}
  const cell=sim.cells[index],def=OBJECTS[cell.type];
  if(def.category===CATEGORY_MELTABLE){cell.state=REMOVED;cell.heat=0;sim.lastEvents.push({kind:"melt",index,type:cell.type,direct:true})}
  else{cell.state=BURNING;cell.heat=0;cell.ignitedAt=sim.tick;sim.lastEvents.push({kind:"ignite",index,type:cell.type,direct:true})}
  return true;
}

function terrainPassable(sim,index,allowRoad=true){
  const type=sim.stage.tiles[index],cell=sim.cells[index];
  // Rescue roads are visual boundaries, not walkable terrain.  This keeps the
  // princess and every oni inside the puzzle area and makes the rule explicit.
  if(type===ROAD)return false;
  if(type===EMPTY)return true;
  if(type>=0&&OBJECTS[type].category===CATEGORY_TERRAIN)return true;
  return cell.state===REMOVED;
}

function bfsNext(sim,start,goal,allowRoad,blocked){
  if(start===goal)return start;
  const queue=[start],parent=new Int32Array(sim.cells.length);parent.fill(-2);parent[start]=-1;
  for(let head=0;head<queue.length;head++){
    const current=queue[head];
    for(const next of neighbors(sim.stage,current)){
      if(parent[next]!==-2||(!terrainPassable(sim,next,allowRoad)&&next!==goal)||(blocked.has(next)&&next!==goal))continue;
      parent[next]=current;if(next===goal){let step=next;while(parent[step]!==start&&parent[step]>=0)step=parent[step];return step}queue.push(next);
    }
  }
  return -1;
}

function riverEffect(sim,entity,events){
  if(entity.removed||sim.stage.tiles[entity.index]!==12)return;
  const wasBurning=entity.state===BURNING,hadHeat=entity.heat>0;entity.state=IDLE;entity.heat=0;
  if(wasBurning||hadHeat)events.push({kind:"riverExtinguish",index:entity.index,type:entity.type,entity:true});
}

function explodeFactory(sim,index,events){
  const targets=[];
  for(const targetIndex of squareAround(sim.stage,index,2)){
    const cell=sim.cells[targetIndex];
    if(isHeatTarget(cell)&&cell.state===IDLE){cell.heat=0;targets.push(targetIndex);if(OBJECTS[cell.type].category===CATEGORY_MELTABLE){cell.state=REMOVED;events.push({kind:"melt",index:targetIndex,type:cell.type,blast:true})}else{cell.state=BURNING;events.push({kind:"ignite",index:targetIndex,type:cell.type,blast:true})}}
    const entity=rescueEntityAt(sim,targetIndex);if(entity&&entity.state===IDLE){entity.heat=0;entity.state=BURNING;targets.push(targetIndex);events.push({kind:"ignite",index:targetIndex,type:entity.type,entity:true,blast:true});if(OBJECTS[entity.type].category===CATEGORY_ACTOR)sim.resultReason="burned"}
  }
  events.push({kind:"blast",index,targets});
}

function releaseWater(sim,index,events){
  const targets=[];
  for(const targetIndex of neighbors(sim.stage,index)){
    const cell=sim.cells[targetIndex];
    if(isHeatTarget(cell)&&cell.state!==REMOVED){cell.heat=0;targets.push(targetIndex);if(cell.state===BURNING){cell.state=IDLE;events.push({kind:"extinguish",index:targetIndex,type:cell.type,water:true})}}
    const entity=rescueEntityAt(sim,targetIndex);if(entity){entity.heat=0;targets.push(targetIndex);if(entity.state===BURNING){entity.state=IDLE;events.push({kind:"extinguish",index:targetIndex,type:entity.type,entity:true,water:true})}}
  }
  events.push({kind:"waterBurst",index,targets});
}

function hasOniAdjacentToPrincess(sim){
  if(sim.princess.removed)return false;const [px,py]=xy(sim.stage,sim.princess.index);
  return sim.entities.some(entity=>!entity.removed&&OBJECTS[entity.type].category===CATEGORY_ENEMY&&(()=>{const [ex,ey]=xy(sim.stage,entity.index);return Math.abs(ex-px)+Math.abs(ey-py)===1})());
}

function moveEntity(sim,entity,events,occupied){
  if(entity.removed)return;
  const def=OBJECTS[entity.type],speed=entity.state===BURNING?(def.burningSpeed??def.speed):def.speed;
  if(!speed)return;
  entity.moveProgress+=speed/TICKS_PER_SECOND;if(entity.moveProgress+1e-6<1)return;entity.moveProgress-=1;
  let next=-1;
  if(def.category===CATEGORY_ACTOR){
    const exit=sim.cells.find(cell=>cell.type===11)?.index??-1;
    next=bfsNext(sim,entity.index,exit,true,new Set([...occupied].filter(index=>index!==entity.index)));
  }else if(def.patrol==="chase"){
    next=bfsNext(sim,entity.index,sim.princess.index,true,new Set([...occupied].filter(index=>index!==entity.index&&index!==sim.princess.index)));
  }else if(def.patrol){
    const horizontal=def.patrol==="horizontal",[x,y]=xy(sim.stage,entity.index),tryStep=dir=>{const nx=x+(horizontal?dir:0),ny=y+(horizontal?0:dir);if(nx<0||ny<0||nx>=sim.stage.width||ny>=sim.stage.height)return -1;const index=ny*sim.stage.width+nx;return terrainPassable(sim,index,false)&&!occupied.has(index)?index:-1};
    next=tryStep(entity.patrolDir);if(next<0){entity.patrolDir*=-1;next=tryStep(entity.patrolDir)}
  }
  if(next<0||next===entity.index)return;
  const occupant=rescueEntityAt(sim,next);
  if(occupant){
    if(OBJECTS[entity.type].category===CATEGORY_ACTOR||OBJECTS[occupant.type].category===CATEGORY_ACTOR){sim.resultReason="oni";events.push({kind:"collision",index:next})}
    return;
  }
  const from=entity.index,fromX=from%sim.stage.width,nextX=next%sim.stage.width;if(nextX!==fromX)entity.facing=Math.sign(nextX-fromX);occupied.delete(from);entity.index=next;occupied.add(next);events.push({kind:"move",from,index:next,type:entity.type,entity:true,entityId:entity.id});riverEffect(sim,entity,events);
  if(OBJECTS[entity.type].category===CATEGORY_ACTOR&&sim.stage.tiles[next]===11)sim.princessEscaped=true;
}

export function stepRescueSimulation(sim,{skipOutcome=false,allowFinished=false}={}){
  if(sim.finished&&!allowFinished)return sim.lastEvents=[];
  const events=[];
  for(const entity of sim.entities)riverEffect(sim,entity,events);
  const burningStatic=sim.cells.filter(isStaticFuel).filter(cell=>cell.state===BURNING).map(cell=>cell.index);
  const burningEntities=sim.entities.filter(entity=>!entity.removed&&entity.state===BURNING);
  const burningByIndex=new Set([...burningStatic,...burningEntities.map(entity=>entity.index)]),activations=[];
  for(const cell of sim.cells)if(cell.type>=0&&OBJECTS[cell.type].category===CATEGORY_UTILITY&&cell.state!==REMOVED&&cell.charges>0&&neighbors(sim.stage,cell.index).some(index=>burningByIndex.has(index)))activations.push(cell.index);

  const suppressedStatic=new Set(),suppressedEntities=new Set();
  for(const sourceIndex of activations){
    const source=sim.cells[sourceIndex];source.charges--;const targets=[];
    for(const index of neighbors(sim.stage,sourceIndex)){
      const cell=sim.cells[index];
      if(isHeatTarget(cell)&&cell.state!==REMOVED){cell.heat=0;targets.push(index);if(cell.state===BURNING){cell.state=IDLE;suppressedStatic.add(index);events.push({kind:"extinguish",index,type:cell.type})}}
      const entity=rescueEntityAt(sim,index);
      if(entity){entity.heat=0;targets.push(index);if(entity.state===BURNING){entity.state=IDLE;suppressedEntities.add(entity.id);events.push({kind:"extinguish",index,type:entity.type,entity:true})}}
    }
    events.push({kind:"powder",index:sourceIndex,targets,charges:source.charges});if(source.charges<=0){source.state=REMOVED;events.push({kind:"utilitySpent",index:sourceIndex,type:source.type})}
  }

  const staticHeat=new Float32Array(sim.cells.length),entityHeat=new Float32Array(sim.entities.length);
  const spread=(sourceIndex,heat)=>{
    for(const index of neighbors(sim.stage,sourceIndex)){
      const cell=sim.cells[index];if(isHeatTarget(cell)&&cell.state===IDLE&&!suppressedStatic.has(index))staticHeat[index]+=heat/TICKS_PER_SECOND;
      const entity=rescueEntityAt(sim,index);if(entity&&entity.state===IDLE&&!suppressedEntities.has(entity.id))entityHeat[entity.id]+=heat/TICKS_PER_SECOND;
    }
  };
  for(const index of burningStatic){const cell=sim.cells[index];if(cell.state===BURNING&&!suppressedStatic.has(index))spread(index,OBJECTS[cell.type].heat)}
  for(const entity of burningEntities)if(entity.state===BURNING&&!suppressedEntities.has(entity.id))spread(entity.index,OBJECTS[entity.type].heat);

  for(let i=0;i<sim.cells.length;i++){
    const cell=sim.cells[i];if(!isHeatTarget(cell)||cell.state!==IDLE||suppressedStatic.has(i))continue;cell.heat+=staticHeat[i];
    if(cell.heat+1e-6>=OBJECTS[cell.type].threshold){cell.heat=0;if(OBJECTS[cell.type].category===CATEGORY_MELTABLE){cell.state=REMOVED;events.push({kind:"melt",index:i,type:cell.type})}else{cell.state=BURNING;events.push({kind:"ignite",index:i,type:cell.type})}}
  }
  for(const entity of sim.entities){
    if(entity.removed||entity.state!==IDLE||suppressedEntities.has(entity.id))continue;entity.heat+=entityHeat[entity.id];
    if(entity.heat+1e-6>=OBJECTS[entity.type].threshold){
      entity.heat=0;entity.state=BURNING;events.push({kind:"ignite",index:entity.index,type:entity.type,entity:true});
      // The rescue objective is lost the instant the princess catches fire.
      if(OBJECTS[entity.type].category===CATEGORY_ACTOR)sim.resultReason="burned";
    }
  }

  const occupied=new Set(sim.entities.filter(entity=>!entity.removed).map(entity=>entity.index));
  if(hasOniAdjacentToPrincess(sim)){sim.resultReason="oni";events.push({kind:"collision",index:sim.princess.index})}
  if(!sim.resultReason){
    for(const entity of sim.entities.filter(entity=>OBJECTS[entity.type].category===CATEGORY_ENEMY)){moveEntity(sim,entity,events,occupied);if(hasOniAdjacentToPrincess(sim)){sim.resultReason="oni";events.push({kind:"collision",index:sim.princess.index});break}}
  }
  if(!sim.resultReason){moveEntity(sim,sim.princess,events,occupied);if(hasOniAdjacentToPrincess(sim)){sim.resultReason="oni";events.push({kind:"collision",index:sim.princess.index})}}

  const burnedOut=[];
  for(const index of burningStatic){const cell=sim.cells[index];if(cell.state!==BURNING||suppressedStatic.has(index))continue;cell.remaining--;if(cell.remaining<=0){cell.state=REMOVED;burnedOut.push({index,type:cell.type});events.push({kind:"burnout",index,type:cell.type})}}
  for(const item of burnedOut)if(item.type===20)explodeFactory(sim,item.index,events);
  for(const item of burnedOut)if(item.type===18)releaseWater(sim,item.index,events);
  for(const entity of burningEntities){
    if(entity.removed||entity.state!==BURNING||suppressedEntities.has(entity.id))continue;entity.remaining--;
    if(entity.remaining<=0){entity.removed=true;entity.state=REMOVED;occupied.delete(entity.index);events.push({kind:"burnout",index:entity.index,type:entity.type,entity:true});if(OBJECTS[entity.type].category===CATEGORY_ACTOR)sim.resultReason="burned"}
  }

  if(sim.started)sim.tick++;sim.lastEvents=events;
  if(!skipOutcome)evaluateRescueOutcome(sim);return events;
}

export function evaluateRescueOutcome(sim){
  if(sim.finished||!sim.started)return sim.result;
  if(sim.resultReason==="oni"||sim.resultReason==="burned"){sim.finished=true;sim.result="fail";return sim.result}
  if(sim.princessEscaped&&!sim.princess.removed){sim.finished=true;sim.result="clear";return sim.result}
  const burning=sim.cells.some(cell=>cell.state===BURNING)||sim.entities.some(entity=>!entity.removed&&entity.state===BURNING);
  const exit=sim.cells.find(cell=>cell.type===11)?.index??-1;
  const routeReady=exit>=0&&bfsNext(sim,sim.princess.index,exit,true,new Set())>=0;
  if(sim.ignitionsLeft===0&&!burning&&!routeReady){sim.resultReason="trapped";sim.finished=true;sim.result="fail";return sim.result}
  return null;
}

export function rescueRemainingLabel(sim){
  if(sim.princess.removed)return "姫 消滅";
  if(sim.princess.state===BURNING)return `姫 炎 ${(sim.princess.remaining/TICKS_PER_SECOND).toFixed(1)}秒`;
  return "姫 生存";
}

export function rescueBurningCount(sim){return sim.cells.filter(cell=>cell.state===BURNING).length+sim.entities.filter(entity=>!entity.removed&&entity.state===BURNING).length}
