import assert from "node:assert/strict";
import fs from "node:fs";
import {STAGES} from "../src/stages.js";
import {RESCUE_STAGES} from "../src/rescue-stages.js";
import {OBJECTS,ROAD,TICKS_PER_SECOND,BURNING,IDLE,REMOVED,CATEGORY_UTILITY,MODE_BURN,MODE_RESCUE} from "../src/definitions.js";
import {createSimulation,directIgnite,stepSimulation,simulatePlan,ratingFor,isDirectlyIgnitable,remainingCount,unreachableCount} from "../src/simulation.js";
import {createRescueSimulation,directIgniteRescue,isRescueDirectlyIgnitable,stepRescueSimulation} from "../src/rescue-simulation.js";
import {createCamera,fitCamera,zoomCamera,focusCamera,panCamera,displayedTileSize,nearestCell} from "../src/render.js";
import {generateEndlessStage,objectComponentSizes} from "../tools/stage-factory.mjs";
import {generateRescueEndlessStage} from "../tools/rescue-stage-factory.mjs";
import {storage} from "../src/storage.js";

storage.removeItem("bundle-test");assert.equal(storage.getItem("bundle-test"),null,"storage works without browser localStorage");storage.setItem("bundle-test","ok");assert.equal(storage.getItem("bundle-test"),"ok","storage falls back to memory");storage.removeItem("bundle-test");

assert.equal(STAGES.length,200,"200 adopted stages");
assert.deepEqual(STAGES.reduce((a,s)=>(a[s.difficulty]=(a[s.difficulty]||0)+1,a),{}),{1:10,2:10,3:5,4:5,5:20,6:20,7:15,8:15,9:100});
const curatedFixtures=JSON.parse(fs.readFileSync(new URL("../tools/curated-burn-stages.json",import.meta.url),"utf8")),curatedBySource=new Map(curatedFixtures.map(item=>[item.sourceNumber,item.stage]));
for(const stage of STAGES){
  assert.ok(stage.width>=8&&stage.width<=24&&stage.height>=8&&stage.height<=24,`stage ${stage.number} size`);
  for(let x=0;x<stage.width;x++){assert.equal(stage.tiles[x],ROAD);assert.equal(stage.tiles[(stage.height-1)*stage.width+x],ROAD)}
  for(let y=0;y<stage.height;y++){assert.equal(stage.tiles[y*stage.width],ROAD);assert.equal(stage.tiles[y*stage.width+stage.width-1],ROAD)}
  assert.ok(objectComponentSizes(stage).every(size=>size>=5),`stage ${stage.number} has no object component below five`);
  const extinguishers=[];stage.tiles.forEach((t,i)=>{if(t===6)extinguishers.push(i)});
  for(const i of extinguishers)assert.ok([i-1,i+1,i-stage.width,i+stage.width].some(n=>stage.tiles[n]>=0),`stage ${stage.number} extinguisher joins an object group`);
  assert.ok(stage.optimalTicks>0&&stage.ignitions>=stage.minimum);
  assert.equal(stage.ignitions,stage.minimum+2,`stage ${stage.number} has two spare ignitions`);
  assert.ok(stage.objects>=15&&stage.objects<=225,`stage ${stage.number} object count`);assert.ok(stage.candidates>=4,`stage ${stage.number} candidate count`);
  if(stage.curated)assert.deepEqual(stage.tiles,curatedBySource.get(stage.curated).tiles,`curated source ${stage.curated} keeps its exact layout`);
}

const basicTypes=new Set([0,1,2,3,7,19]);for(const stage of STAGES.slice(0,10))assert.ok(stage.tiles.filter(type=>type>=0).every(type=>basicTypes.has(type)),`stage ${stage.number} uses only basic tutorial objects`);
const gimmickIntro=new Set(STAGES.slice(10,20).flatMap(stage=>stage.tiles.filter(type=>type>=0)));for(const type of [4,5,8,18,20])assert.ok(gimmickIntro.has(type),`difficulty 2 introduces ${OBJECTS[type].name}`);
assert.ok(STAGES.every(stage=>stage.mode===MODE_BURN&&!stage.tiles.includes(6)),"burn mode completely excludes extinguishers");
assert.ok(STAGES.some(stage=>stage.tiles.includes(8)),"burn mode introduces gasoline tanks");
assert.equal(OBJECTS[3].accent,OBJECTS[7].accent,"threshold 100 objects share a sub-color");
assert.equal(OBJECTS[4].accent,OBJECTS[5].accent,"threshold 50 drum and snowman share a sub-color");
assert.equal(OBJECTS[5].accent,OBJECTS[6].accent,"threshold 50 snowman and extinguisher share a sub-color");
assert.equal(OBJECTS[18].accent,OBJECTS[3].accent,"threshold 100 water tank shares the metal sub-color");
assert.equal(OBJECTS[20].accent,OBJECTS[3].accent,"threshold 100 factory shares the metal sub-color");
for(const type of [18,19,20])assert.ok(STAGES.some(stage=>stage.tiles.includes(type)),`burn stages include ${OBJECTS[type].name}`);
assert.ok(STAGES.filter(stage=>stage.difficulty===4).every(stage=>!stage.tiles.includes(-1)),"difficulty 4 fills every non-road cell with an object");
assert.ok(STAGES.slice(100).every(stage=>stage.difficulty===9&&stage.setPiece&&stage.minimum>=3&&stage.objects>=160&&stage.optimalFirst!==20),"stages 101-200 reject MIN1/2 and factory-first adopted plans");
assert.equal(STAGES.filter(stage=>stage.curated).length,curatedFixtures.length,"all approved layouts are retained");

const endless=generateEndlessStage(1),sameEndless=generateEndlessStage(1),nextEndless=generateEndlessStage(2);
assert.equal(endless.difficulty,8);assert.equal(endless.endless,true);assert.equal(endless.ignitions,endless.minimum+2,"endless has two spare ignitions");
assert.ok(!endless.tiles.includes(6)&&endless.tiles.includes(8),"burn-mode endless excludes extinguishers and includes gasoline tanks");
assert.ok(endless.objects>=150&&endless.objects<=205&&endless.minimum<=3,"endless is a large but easier chain-reaction stage");
assert.ok(endless.tiles.filter(type=>type===5||type===18).length<=Math.ceil(endless.objects*.05),"endless strongly limits snowmen and water tanks");
assert.ok(objectComponentSizes(endless).every(size=>size>=5),"endless has no object component below five");
assert.deepEqual(endless.tiles,sameEndless.tiles,"same endless number is reproducible");assert.notDeepEqual(endless.tiles,nextEndless.tiles,"different endless numbers vary");
const endlessRoadStages=[endless,nextEndless,generateEndlessStage(3),generateEndlessStage(4)],roadSignature=stage=>`${stage.width}x${stage.height}:${stage.tiles.map(tile=>tile===ROAD?1:0).join("")}`;
assert.equal(new Set(endlessRoadStages.map(roadSignature)).size,endlessRoadStages.length,"successive endless stages use different road shapes");
for(const stage of endlessRoadStages){
  const roads=stage.tiles.map((tile,index)=>tile===ROAD?index:-1).filter(index=>index>=0),seen=new Set([roads[0]]),stack=[roads[0]];
  while(stack.length){const index=stack.pop(),x=index%stage.width,y=Math.floor(index/stage.width);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,next=ny*stage.width+nx;if(nx>=0&&ny>=0&&nx<stage.width&&ny<stage.height&&stage.tiles[next]===ROAD&&!seen.has(next)){seen.add(next);stack.push(next)}}}
  assert.equal(seen.size,roads.length,`endless ${stage.endlessIndex} roads stay connected`);
  assert.ok(roads.length>stage.width*2+stage.height*2-4,`endless ${stage.endlessIndex} has interior roads`);
}

assert.equal(RESCUE_STAGES.length,200,"200 validated rescue stages");
assert.deepEqual(RESCUE_STAGES.reduce((a,s)=>(a[s.difficulty]=(a[s.difficulty]||0)+1,a),{}),{1:5,2:5,3:5,4:5,5:5,6:25,7:50,8:100});
const rescueTypes=new Set();
for(const stage of RESCUE_STAGES){
  assert.equal(stage.mode,MODE_RESCUE);assert.equal(stage.ignitions,stage.minimum+2,`rescue ${stage.number} has two spare ignitions`);assert.equal(stage.tiles.filter(type=>type===11).length,1,`rescue ${stage.number} has one exit`);assert.equal(stage.tiles.filter(type=>type===13).length,1,`rescue ${stage.number} has one princess`);
  stage.tiles.forEach(type=>{if(type>=0)rescueTypes.add(type)});const rescue=createRescueSimulation(stage),px=rescue.princess.index%stage.width,py=Math.floor(rescue.princess.index/stage.width);assert.equal(isRescueDirectlyIgnitable(rescue,rescue.princess.index),false,"princess cannot be directly ignited");
  for(const index of stage.cage){const x=index%stage.width,y=Math.floor(index/stage.width);assert.equal(Math.max(Math.abs(x-px),Math.abs(y-py)),2,`rescue ${stage.number} keeps a one-cell cage gap`);assert.equal(isRescueDirectlyIgnitable(rescue,index),false,`rescue ${stage.number} cage cannot be touched directly`)}
  if(stage.number<=10){assert.ok(stage.cage.every(index=>stage.tiles[index]===9||stage.tiles[index]===10),`rescue ${stage.number} uses a wall-and-door cage`);for(const index of stage.cage.filter(index=>stage.tiles[index]===9)){const x=index%stage.width,y=Math.floor(index/stage.width);assert.ok(!(Math.abs(x-px)===2&&Math.abs(y-py)===2),`rescue ${stage.number} does not put a door on a cage corner`)}}
  for(const index of stage.solution)assert.ok(directIgniteRescue(rescue,index),`rescue ${stage.number} planned ignition is reachable`);
  for(let tick=0;tick<3000&&!rescue.finished;tick++)stepRescueSimulation(rescue);assert.equal(rescue.result,"clear",`rescue ${stage.number} has a survivable escape plan`);
}
assert.ok(RESCUE_STAGES.slice(100).every(stage=>stage.difficulty===8&&stage.minimum>=3&&stage.solution.length>=3),"rescue stages 101-200 require at least three planned ignitions");
assert.ok(RESCUE_STAGES.slice(10).some(stage=>stage.mixedCage)&&RESCUE_STAGES.slice(10).some(stage=>!stage.mixedCage),"rescue alternates pure and mixed-material cages after stage 10");
assert.ok(new Set(RESCUE_STAGES.map(stage=>stage.exit)).size>20,"rescue exits are not fixed to one position");
for(const type of [6,8,9,10,11,12,13,14,15,16,17,18,19,20])assert.ok(rescueTypes.has(type),`rescue stages include ${OBJECTS[type].name}`);

const rescueEndless=generateRescueEndlessStage(1),sameRescueEndless=generateRescueEndlessStage(1),nextRescueEndless=generateRescueEndlessStage(2);
assert.equal(rescueEndless.difficulty,7);assert.equal(rescueEndless.endless,true);assert.equal(rescueEndless.ignitions,rescueEndless.minimum+2);assert.ok(rescueEndless.minimum<=2&&rescueEndless.tiles.filter(type=>type===5||type===18).length<=2,"rescue endless is easier and limits disruptive objects");assert.deepEqual(rescueEndless.tiles,sameRescueEndless.tiles,"same rescue endless number is reproducible");assert.notDeepEqual(rescueEndless.tiles,nextRescueEndless.tiles,"rescue endless stages vary");
let rescueEndlessSim=createRescueSimulation(rescueEndless);for(const index of rescueEndless.solution)directIgniteRescue(rescueEndlessSim,index);for(let tick=0;tick<3000&&!rescueEndlessSim.finished;tick++)stepRescueSimulation(rescueEndlessSim);assert.equal(rescueEndlessSim.result,"clear","rescue endless has a survivable escape plan");

let camera=createCamera(STAGES[199]);assert.equal(camera.tile,camera.fit,"large stage starts fitted");const fitted=camera.tile;zoomCamera(camera,STAGES[199],1.25);assert.ok(camera.tile>fitted,"large stage can zoom in");fitCamera(camera,STAGES[199]);assert.equal(camera.tile,fitted,"fit button restores whole board");panCamera(camera,STAGES[199],10000,10000);assert.ok(Number.isFinite(camera.x)&&Number.isFinite(camera.y));
const focusIndex=STAGES[199].tiles.findIndex(type=>type>=0);focusCamera(camera,STAGES[199],focusIndex);assert.equal(camera.tile,64,"touch assist zooms a cell to the large interaction size");assert.equal(displayedTileSize(camera,{width:384}),64,"displayed touch size follows canvas scale");const focusX=focusIndex%STAGES[199].width,focusY=Math.floor(focusIndex/STAGES[199].width),clientX=camera.x+(focusX+.5)*camera.tile,clientY=camera.y+(focusY+.5)*camera.tile;assert.equal(nearestCell(STAGES[199],camera,clientX+18,clientY,{left:0,top:0,width:384,height:520},new Set([focusIndex]),30),focusIndex,"touch correction finds a nearby ignitable cell");

const vineStage={width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,0,1,-1,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
let sim=createSimulation(vineStage);assert.ok(directIgnite(sim,6));for(let i=0;i<20;i++)stepSimulation(sim,{skipOutcome:true});assert.equal(sim.cells[7].state,BURNING,"vine ignites tree with total heat 20");

const snowStage={width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,5,6,-1,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
sim=createSimulation(snowStage);assert.equal(isDirectlyIgnitable(sim,7),false,"extinguisher is not a manual target");assert.ok(directIgnite(sim,6));assert.equal(sim.cells[6].state,REMOVED,"direct ignition instantly melts snowman");assert.equal(sim.ignitionsLeft,0,"melting consumes an ignition");stepSimulation(sim);assert.equal(sim.result,"clear","utility object does not block clear");assert.equal(remainingCount(sim),0,"utility object is excluded from remaining count");

const heatMeltStage={width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,4,5,-1,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
sim=createSimulation(heatMeltStage);directIgnite(sim,6);let meltSeen=false;for(let i=0;i<5;i++)meltSeen=stepSimulation(sim,{skipOutcome:true}).some(event=>event.kind==="melt")||meltSeen;assert.equal(sim.cells[7].state,REMOVED,"snowman melts when accumulated heat reaches its threshold");assert.ok(meltSeen,"melting emits a steam event");

const extinguishStage={width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,2,6,-1,-2,-2,-2,-2,-2,-2],ignitions:6,optimalTicks:1};
sim=createSimulation(extinguishStage);const initialRemaining=sim.cells[6].remaining;
for(let activation=1;activation<=5;activation++){
  directIgnite(sim,6);const events=stepSimulation(sim,{skipOutcome:true});assert.ok(events.some(event=>event.kind==="powder"),`extinguisher activation ${activation}`);assert.equal(sim.cells[6].state,IDLE,"extinguisher ends burning state");assert.equal(sim.cells[6].heat,0);assert.equal(sim.cells[6].remaining,initialRemaining,"burn progress is retained");assert.equal(sim.cells[7].charges,5-activation);
  if(activation<5){const charges=sim.cells[7].charges;stepSimulation(sim,{skipOutcome:true});assert.equal(sim.cells[7].charges,charges,"charges pause while no adjacent object is burning")}
}
assert.equal(sim.cells[7].state,REMOVED,"extinguisher disappears after five activations");assert.equal(OBJECTS[6].category,CATEGORY_UTILITY);

const riverStage={mode:MODE_RESCUE,width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,13,12,11,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
let rescueSim=createRescueSimulation(riverStage);rescueSim.started=true;rescueSim.princess.state=BURNING;const princessRemaining=rescueSim.princess.remaining,movementEvents=[];for(let i=0;i<3;i++)movementEvents.push(...stepRescueSimulation(rescueSim,{skipOutcome:true}));assert.equal(rescueSim.princess.index,7,"princess moves onto river");assert.equal(rescueSim.princess.state,IDLE,"river extinguishes princess");assert.ok(rescueSim.princess.remaining<=princessRemaining&&rescueSim.princess.remaining>0,"river keeps prior burn progress");const princessMove=movementEvents.find(event=>event.kind==="move"&&event.entityId===rescueSim.princess.id);assert.deepEqual([princessMove.from,princessMove.index],[6,7],"movement events expose endpoints for interpolation");

const collisionStage={mode:MODE_RESCUE,width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,13,17,11,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
rescueSim=createRescueSimulation(collisionStage);rescueSim.started=true;stepRescueSimulation(rescueSim);assert.equal(rescueSim.result,"fail","orthogonally adjacent oni causes game over");assert.equal(rescueSim.resultReason,"oni");

const diagonalOniStage={mode:MODE_RESCUE,width:5,height:4,tiles:[-2,-2,-2,-2,-2,-2,13,-1,11,-2,-2,-1,14,-1,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
rescueSim=createRescueSimulation(diagonalOniStage);rescueSim.started=true;stepRescueSimulation(rescueSim,{skipOutcome:true});assert.notEqual(rescueSim.resultReason,"oni","diagonal oni is not adjacent");

const trappedRescueStage={mode:MODE_RESCUE,width:7,height:7,tiles:[-2,-2,-2,11,-2,-2,-2,-2,-1,10,10,10,-1,-2,-2,-1,10,-1,10,-1,-2,-2,-1,10,13,10,-1,-2,-2,-1,10,10,10,-1,-2,-2,-1,-1,-1,-1,-1,-2,-2,-2,-2,-2,-2,-2,-2],ignitions:0,minimum:1,optimalTicks:1};
rescueSim=createRescueSimulation(trappedRescueStage);rescueSim.started=true;stepRescueSimulation(rescueSim);assert.equal(rescueSim.result,"fail","rescue fails only after fire is zero, flames have ended, and no route exists");assert.equal(rescueSim.resultReason,"trapped");

const princessExtinguisherStage={mode:MODE_RESCUE,width:5,height:3,tiles:[-2,-2,-2,-2,-2,-2,13,6,11,-2,-2,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
rescueSim=createRescueSimulation(princessExtinguisherStage);rescueSim.started=true;rescueSim.princess.state=BURNING;const rescueEvents=stepRescueSimulation(rescueSim,{skipOutcome:true});assert.equal(rescueSim.princess.state,IDLE,"extinguisher suppresses a burning princess");assert.equal(rescueSim.cells[7].charges,4);assert.ok(rescueEvents.some(event=>event.kind==="powder"));

assert.deepEqual(OBJECTS[6].modes,[MODE_RESCUE]);assert.equal(OBJECTS[4].heat,200);assert.equal(OBJECTS[8].heat,400);assert.equal(OBJECTS[13].heat,40);assert.equal(OBJECTS[14].duration,2);assert.equal(OBJECTS[15].duration,3);assert.equal(OBJECTS[16].duration,3);assert.equal(OBJECTS[17].duration,5);

const specialTiles=()=>{const size=7,tiles=new Array(size*size).fill(-1);for(let i=0;i<size;i++){tiles[i]=ROAD;tiles[(size-1)*size+i]=ROAD;tiles[i*size]=ROAD;tiles[i*size+size-1]=ROAD}tiles[10]=ROAD;return tiles};
let tiles=specialTiles();tiles[24]=18;tiles[31]=1;
const waterTankStage={width:7,height:7,tiles,ignitions:2,minimum:2,optimalTicks:1};
sim=createSimulation(waterTankStage);directIgnite(sim,24);directIgnite(sim,31);let waterEvents=[];for(let i=0;i<10;i++)waterEvents=stepSimulation(sim,{skipOutcome:true});assert.equal(sim.cells[24].state,REMOVED,"water tank burns out");assert.equal(sim.cells[31].state,IDLE,"water tank extinguishes an adjacent fire");assert.equal(sim.cells[31].heat,0,"water tank resets adjacent heat");assert.ok(sim.cells[31].remaining>0&&sim.cells[31].remaining<OBJECTS[1].duration*TICKS_PER_SECOND,"water tank preserves prior burn progress");assert.ok(waterEvents.some(event=>event.kind==="waterBurst"),"water tank emits a water burst");

tiles=specialTiles();tiles[24]=20;tiles[40]=19;
const factoryStage={width:7,height:7,tiles,ignitions:1,minimum:1,optimalTicks:1};
sim=createSimulation(factoryStage);directIgnite(sim,24);let blastEvents=[];for(let i=0;i<50;i++)blastEvents=stepSimulation(sim,{skipOutcome:true});assert.equal(sim.cells[40].state,BURNING,"factory blast force-ignites a highrise at square radius two");assert.equal(sim.cells[40].heat,0);assert.ok(blastEvents.some(event=>event.kind==="blast"),"factory emits a blast event");

tiles=specialTiles();tiles[24]=18;tiles[31]=14;tiles[36]=13;
const rescueWaterStage={mode:MODE_RESCUE,width:7,height:7,tiles,ignitions:1,minimum:1,optimalTicks:1};
rescueSim=createRescueSimulation(rescueWaterStage);directIgniteRescue(rescueSim,24);const waterOni=rescueSim.entities.find(entity=>entity.type===14);waterOni.state=BURNING;waterOni.heat=9;for(let i=0;i<10;i++)stepRescueSimulation(rescueSim,{skipOutcome:true});assert.equal(waterOni.state,IDLE,"water tank extinguishes a rescue-mode entity");assert.equal(waterOni.heat,0);

tiles=specialTiles();tiles[24]=20;tiles[40]=13;
const rescueFactoryStage={mode:MODE_RESCUE,width:7,height:7,tiles,ignitions:1,minimum:1,optimalTicks:1};
rescueSim=createRescueSimulation(rescueFactoryStage);directIgniteRescue(rescueSim,24);for(let i=0;i<50;i++)stepRescueSimulation(rescueSim,{skipOutcome:true});assert.equal(rescueSim.princess.state,BURNING,"factory blast ignites the princess in rescue mode");

assert.equal(OBJECTS[18].threshold,100);assert.equal(OBJECTS[18].duration,1);assert.equal(OBJECTS[18].heat,0);assert.equal(OBJECTS[19].threshold,400);assert.equal(OBJECTS[19].duration,5);assert.equal(OBJECTS[19].heat,20);assert.equal(OBJECTS[20].threshold,100);assert.equal(OBJECTS[20].duration,5);assert.equal(OBJECTS[20].heat,20);

const isolatedTiles=new Array(49).fill(-1);for(let i=0;i<7;i++){isolatedTiles[i]=ROAD;isolatedTiles[42+i]=ROAD;isolatedTiles[i*7]=ROAD;isolatedTiles[i*7+6]=ROAD}isolatedTiles[8]=1;isolatedTiles[24]=1;
const isolatedStage={width:7,height:7,tiles:isolatedTiles,ignitions:2,minimum:2,optimalTicks:1};
sim=createSimulation(isolatedStage);assert.equal(unreachableCount(sim),1,"an isolated object three tiles from a road triggers a warning");

const afterFailStage={width:3,height:3,tiles:[-2,-2,-2,-2,1,-2,-2,-2,-2],ignitions:1,optimalTicks:1};
sim=createSimulation(afterFailStage);directIgnite(sim,4);stepSimulation(sim,{skipOutcome:true});sim.finished=true;sim.result="fail";const failedRemaining=sim.cells[4].remaining;stepSimulation(sim);assert.equal(sim.cells[4].remaining,failedRemaining,"finished simulation normally stays frozen");stepSimulation(sim,{skipOutcome:true,allowFinished:true});assert.equal(sim.cells[4].remaining,failedRemaining-1,"fire continues after failure when requested");

assert.equal(ratingFor(2),3);assert.equal(ratingFor(1),2);assert.equal(ratingFor(0),1);assert.equal(ratingFor(2,false),0);
assert.equal(TICKS_PER_SECOND,10);
console.log("All tests passed");
