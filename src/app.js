import {STAGES} from "./stages.js";
import {RESCUE_STAGES} from "./rescue-stages.js";
import {OBJECTS,ROAD,BURNING,REMOVED,CATEGORY_MELTABLE,CATEGORY_UTILITY,MODE_BURN,MODE_RESCUE} from "./definitions.js";
import {createSimulation,directIgnite,isDirectlyIgnitable,stepSimulation,ratingFor,remainingCount,unreachableCount} from "./simulation.js";
import {createRescueSimulation,directIgniteRescue,isRescueDirectlyIgnitable,stepRescueSimulation,rescueEntityAt,rescueRemainingLabel,rescueBurningCount} from "./rescue-simulation.js";
import {AudioEngine} from "./audio.js";
import {render,renderObjectPreview,createCamera,fitCamera,zoomCamera,focusCamera,panCamera,hitTest,displayedTileSize,nearestCell,canvasPoint} from "./render.js";
import {generateEndlessStage} from "../tools/stage-factory.mjs";
import {generateRescueEndlessStage} from "../tools/rescue-stage-factory.mjs";
import {storage} from "./storage.js";

const $=id=>document.getElementById(id);
const screens={title:$("title-screen"),mode:$("mode-screen"),select:$("select-screen"),game:$("game-screen")};
const canvas=$("game-canvas"),ctx=canvas.getContext("2d",{alpha:false});ctx.imageSmoothingEnabled=false;
const audio=new AudioEngine(),pointers=new Map();
const FRAME_INTERVAL=1000/15;
const TOUCH_ASSIST_THRESHOLD=28,TOUCH_ASSIST_TILE=64,TOUCH_ASSIST_RADIUS=30;
const STAGE_COUNT=200;
const SPEEDS=[1,2,4],storedSpeed=Number(storage.getItem("hinomawari-speed"));
let speedLocked=storage.getItem("hinomawari-speed-locked")==="1",preferredSpeed=SPEEDS.includes(storedSpeed)?storedSpeed:1;
let save=loadSave(),currentMode=MODE_BURN,stageIndex=0,endlessIndex=0,sim=null,camera=null,speed=1,lastFrame=performance.now(),accumulator=0,hover=-1,selectedIgnition=-1,resultShown=false,gestureMoved=false,inspectMode=false,postFailureRunning=false;
let frameRequest=0,frameTimer=0,renderDirty=false,visualEffects=[],guideTypes=[],guideIndex=0;
const endlessCache=new Map();
const modeSave=()=>save[currentMode];
const activeStages=()=>currentMode===MODE_RESCUE?RESCUE_STAGES:STAGES;
const createModeSimulation=stage=>stage.mode===MODE_RESCUE?createRescueSimulation(stage):createSimulation(stage);
const directModeIgnite=(state,index)=>state.mode===MODE_RESCUE?directIgniteRescue(state,index):directIgnite(state,index);
const isModeIgnitable=(state,index)=>state.mode===MODE_RESCUE?isRescueDirectlyIgnitable(state,index):isDirectlyIgnitable(state,index);
const stepMode=(state,options)=>state.mode===MODE_RESCUE?stepRescueSimulation(state,options):stepSimulation(state,options);
const burningCount=state=>state.mode===MODE_RESCUE?rescueBurningCount(state):state.cells.filter(cell=>cell.state===BURNING).length;

function stopFrameLoop(){
  if(frameRequest)cancelAnimationFrame(frameRequest);
  if(frameTimer)clearTimeout(frameTimer);
  frameRequest=0;frameTimer=0;
}
function scheduleFrame(delay=0){
  if(document.hidden||frameRequest||frameTimer)return;
  if(delay>4)frameTimer=setTimeout(()=>{frameTimer=0;frameRequest=requestAnimationFrame(frame)},delay);
  else frameRequest=requestAnimationFrame(frame);
}
function invalidate(){renderDirty=true;scheduleFrame()}
document.addEventListener("spriteatlasload",()=>{if(sim){buildGuide();invalidate()}});

function loadSave(){
  try{
    const data=JSON.parse(storage.getItem("hinomawari-save"));
    if(data?.version===10){const burn={unlocked:1,stars:{},endlessNext:1,endlessStars:{},...data.burn},rescue={unlocked:1,stars:{},endlessNext:1,endlessStars:{},...data.rescue};return {...data,burn,rescue}}
  }catch{}
  return {version:10,burn:{unlocked:1,stars:{},endlessNext:1,endlessStars:{}},rescue:{unlocked:1,stars:{},endlessNext:1,endlessStars:{}}};
}
function persist(){storage.setItem("hinomawari-save",JSON.stringify(save))}
function getEndlessStage(index,mode=currentMode){const key=`${mode}:${index}`;if(!endlessCache.has(key))endlessCache.set(key,mode===MODE_RESCUE?generateRescueEndlessStage(index):generateEndlessStage(index));return endlessCache.get(key)}
function warmEndless(index,mode=currentMode){
  const key=`${mode}:${index}`;if(endlessCache.has(key))return;const build=()=>{try{getEndlessStage(index,mode)}catch(error){console.error(error)}};
  if("requestIdleCallback" in window)requestIdleCallback(build,{timeout:1200});else setTimeout(build,60);
}
function show(name){for(const [key,node] of Object.entries(screens))node.classList.toggle("active",key===name);if(name==="title")audio.setBgm("title");window.scrollTo(0,0)}
function syncMute(){for(const id of ["select-sound","game-sound"])$(id).classList.toggle("muted",audio.muted)}
function syncSpeedControls(){
  $("speed-button").textContent=`×${speed}`;$("speed-button").setAttribute("aria-label",`ゲーム速度 ${speed}倍`);
  const lock=$("speed-lock-button");lock.classList.toggle("active",speedLocked);lock.setAttribute("aria-pressed",String(speedLocked));lock.setAttribute("aria-label",speedLocked?`速度${preferredSpeed}倍を次のプレイにも固定中`:"速度を次のプレイにも固定");
}

function openModeSelect(){stopFrameLoop();sim=null;camera=null;audio.setBurning(0);audio.setBgm("select");show("mode")}
function openSelect(){stopFrameLoop();sim=null;camera=null;inspectMode=false;postFailureRunning=false;renderDirty=false;visualEffects=[];$("result-return-button").hidden=true;audio.setBurning(0);audio.setBgm("select");show("select");buildStageList();const progress=modeSave();if(progress.unlocked>100)warmEndless(progress.endlessNext,currentMode)}

function buildStageList(){
  const list=$("stage-list"),progress=modeSave();list.textContent="";let total=0;$("select-title").textContent=currentMode===MODE_RESCUE?"救出ステージ":"焼き尽くしステージ";
  const endlessUnlocked=progress.unlocked>100,endless=document.createElement("button");
  endless.className=`stage-card endless-card${endlessUnlocked?"":" locked"}`;endless.dataset.difficulty="endless";endless.disabled=!endlessUnlocked;
  endless.setAttribute("aria-label",endlessUnlocked?`${currentMode===MODE_RESCUE?"救出":""}無限ステージ ${progress.endlessNext}`:"ステージ100クリア後に解放");endless.innerHTML=`∞<span class="stars">${endlessUnlocked?`ENDLESS ${progress.endlessNext}`:"STAGE 100 CLEAR"}</span>`;
  if(endlessUnlocked)endless.addEventListener("click",()=>startEndless(progress.endlessNext));list.append(endless);
  for(const stage of activeStages()){
    const unlocked=stage.number<=progress.unlocked,rating=progress.stars[stage.number]||0;total+=rating;
    const button=document.createElement("button");button.className=`stage-card${unlocked?"":" locked"}${rating===3?" perfect":""}`;button.dataset.difficulty=stage.difficulty;button.disabled=!unlocked;
    button.setAttribute("aria-label",unlocked?`ステージ${stage.number}、評価${starsText(rating)}`:`ステージ${stage.number}、未解放`);
    button.innerHTML=`${String(stage.number).padStart(2,"0")}<span class="stars">${unlocked?starsText(rating):"LOCK"}</span>`;
    if(unlocked)button.addEventListener("click",()=>startStage(stage.number-1));list.append(button);
  }
  $("progress-text").textContent=progress.unlocked>100?`${Math.min(progress.unlocked,STAGE_COUNT)} / ${STAGE_COUNT} + 無限`:`${Math.min(progress.unlocked,STAGE_COUNT)} / ${STAGE_COUNT} 解放`;$("total-stars").textContent=`★ ${String(total).padStart(3,"0")} / ${STAGE_COUNT*3}`;
}

function startStage(index){
  stageIndex=index;endlessIndex=0;beginStage(activeStages()[index]);
}
function startEndless(index){
  endlessIndex=Math.max(1,index);const stage=getEndlessStage(endlessIndex,currentMode),keep=new Set([`${currentMode}:${endlessIndex}`,`${currentMode}:${endlessIndex+1}`]);for(const key of endlessCache.keys())if(!keep.has(key))endlessCache.delete(key);beginStage(stage);
}
function beginStage(stage){
  sim=createModeSimulation(stage);camera=createCamera(sim.stage);speed=speedLocked?preferredSpeed:1;hover=-1;selectedIgnition=-1;resultShown=false;inspectMode=false;postFailureRunning=false;accumulator=0;visualEffects=[];pointers.clear();$("result-panel").hidden=true;$("result-return-button").hidden=true;
  $("stage-number").textContent=endlessIndex?`∞${endlessIndex}`:String(stageIndex+1).padStart(2,"0");$("difficulty-label").textContent=endlessIndex?"ENDLESS":`LEVEL ${sim.stage.difficulty}`;syncSpeedControls();
  $("zoom-controls").hidden=false;$("hint-text").classList.remove("warning");$("hint-text").textContent=stage.mode===MODE_RESCUE?"檻を焼いて姫を出口へ導く。小さいマスは2回タッチ":"道路から2マス以内をタッチ。小さいマスは2回タッチ";
  lastFrame=performance.now();updateHud();buildGuide();show("game");const wrap=$("canvas-wrap");wrap.classList.remove("stage-enter");void wrap.offsetWidth;wrap.classList.add("stage-enter");setTimeout(()=>wrap.classList.remove("stage-enter"),520);audio.setBgm("stage");audio.gameStart();invalidate();
}

function updateHud(){
  if(!sim)return;$("minimum-value").textContent=sim.stage.minimum;$("fire-value").textContent=sim.ignitionsLeft;$("object-count").textContent=sim.mode===MODE_RESCUE?rescueRemainingLabel(sim):`残り ${remainingCount(sim)}`;
}

const starsText=rating=>"★".repeat(rating)+"☆".repeat(3-rating);

function updateWarning(){
  if(!sim||sim.mode!==MODE_BURN||sim.finished)return;const hint=$("hint-text"),count=unreachableCount(sim),wasWarning=hint.classList.contains("warning");
  hint.classList.toggle("warning",count>0);if(count)hint.textContent=`⚠ クリア不可能：道路や延焼経路から孤立したobjectが${count}個あります`;else if(wasWarning)hint.textContent="延焼可能な経路を確保しました";
}

const GUIDE_EFFECTS=[
  "すぐ燃えるん。隣の木やガソリンタンクに燃え移るん。\n１つでは木造建築を燃やせないん。",
  "木造建築やドラムカンに燃え移るん。\n車のような大きい金属の物は１つでは燃やせないん。",
  "高層ビル以外に燃え移り、長く燃えるん。\n住民はとっくに避難しているん。",
  "着火したら大体のものに燃え移るん。\n建築したばかりでオープン前の建物だん。",
  "危険物が入っていてすぐに何でも燃え移るん。\nとっても危険だん。",
  "雪は燃えないのだん。燃え移らないから気を付けるん。\n周囲の熱気で溶けるん。",
  "周囲の火を消して必要熱をリセットするん。\n5回ぐらい使えるん。放火は良くないん。",
  "金属は燃えづらいん。小さいからあまり発火しないん。\n隣の車や鉄骨建築に火が移りきらないん。",
  "すぐ燃える危ない物なのだん。\n高層ビルだって大炎上させてしまうのだん",
  "木の扉だん。燃えた鬼が通ると燃え移ることがあるん。",
  "なかなか燃えない頑丈な壁だん。\n危険物で無理やり燃やすことが出来るん。",
  "姫が向かう出口だん。うまく放火して姫を救うのだん。",
  "姫や鬼が入れば消化出来るん。",
  "この世界のお姫様だん。鬼に触れたら脱出失敗だん。",
  "動かない鬼だん。姫の脱出経路に居ないか注意するだん。\n動かないのは怠けているのでは無く休憩中だからだん。",
  "左右に走り回る鬼だん。警備をしているん。\n道路に出ると人間に倒されてしまうから行かないん。",
  "北とか南とかに移動する鬼だん。\n大きくて目立つから道路には行かないん。",
  "脱出する姫に向かって追跡する危険な鬼だん。\n道路も通過して怖いもの無しだん。",
  "燃焼すると周囲に水を撒いて熱量0にして燃焼を止めるん。\n意外と大きく中は深いからタンクで遊んじゃダメだん。",
  "中々燃えない巨大建築物だん。\n燃えても避難経路がたくさんあるんだん。",
  "燃焼後に大爆発して周囲2マスまで着火させる危険物だん。\n工場に火を点ける底辺放火魔しかしないん。"
];

function buildGuide(){
  const types=new Set(sim.cells.filter(cell=>cell.type>=0).map(cell=>cell.type));for(const entity of sim.entities||[])types.add(entity.type);
  const priority=type=>type===13?0:type>=14&&type<=17?1:type===11||type===12?2:type===6?3:4;guideTypes=[...types].sort((a,b)=>priority(a)-priority(b)||a-b);guideIndex=0;updateGuide();
}

function updateGuide(){
  if(!guideTypes.length)return;guideIndex=(guideIndex+guideTypes.length)%guideTypes.length;const type=guideTypes[guideIndex],def=OBJECTS[type],preview=$("guide-canvas").getContext("2d");preview.imageSmoothingEnabled=false;renderObjectPreview(preview,type);
  $("guide-name").textContent=def.name;$("guide-position").textContent=`${guideIndex+1} / ${guideTypes.length}`;
  $("guide-stats").textContent=def.category==="terrain"?"燃焼不可　通行可能":def.category===CATEGORY_UTILITY?`燃焼不要　作動 ${def.charges}回`:def.category===CATEGORY_MELTABLE?`引火耐性 ${def.threshold}　燃焼しない　燃焼火力 0`:`引火耐性 ${def.threshold}　燃焼時間 ${def.duration}秒　燃焼火力 ${def.heat}/秒`;
  $("guide-effect").textContent=GUIDE_EFFECTS[type]||"特殊効果なし";$("guide-prev").disabled=guideTypes.length<2;$("guide-next").disabled=guideTypes.length<2;
}

function addVisualEffect(kind,index,extra={}){
  if(kind==="move")visualEffects=visualEffects.filter(effect=>effect.kind!=="move"||effect.entityId!==extra.entityId);
  const duration=extra.duration??(kind==="steam"||kind==="water"?850:kind==="blast"?720:kind==="burnout"?760:620);visualEffects.push({kind,index,width:sim.stage.width,start:performance.now(),duration,...extra});
}

function processEvents(events){
  const burnouts=new Map();let ignites=0,powders=0,melts=0,riverExtinguishes=0,waterBursts=0,blasts=0;
  for(const event of events){
    if(event.kind==="ignite")ignites++;
    if(event.kind==="move"){const entity=sim.entities?.find(item=>item.id===event.entityId),def=OBJECTS[event.type],moveSpeed=entity?.state===BURNING?(def.burningSpeed??def.speed):def.speed;addVisualEffect("move",event.index,{from:event.from,entityId:event.entityId,duration:Math.max(75,Math.round(900/Math.max(1,moveSpeed)/speed))})}
    if(event.kind==="powder"){powders++;addVisualEffect("powder",event.index)}
    if(event.kind==="melt"){melts++;addVisualEffect("steam",event.index)}
    if(event.kind==="waterBurst"){waterBursts++;addVisualEffect("water",event.index)}
    if(event.kind==="blast"){blasts++;addVisualEffect("blast",event.index)}
    if(event.kind==="riverExtinguish")riverExtinguishes++;
    if(event.kind==="burnout"){burnouts.set(event.type,(burnouts.get(event.type)||0)+1);addVisualEffect("burnout",event.index,{type:event.type})}
  }
  if(ignites)audio.ignite(ignites);if(powders||riverExtinguishes||waterBursts)audio.extinguish(powders+riverExtinguishes+waterBursts);if(melts)audio.melt(melts);if(blasts)audio.explosion(blasts);
  for(const [type,count] of burnouts)audio.burnout(type,count);
  audio.setBurning(burningCount(sim));
}

function finish(){
  if(resultShown)return;resultShown=true;audio.setBgm("off");const progress=modeSave();
  if(sim.result==="clear"){
    audio.setBurning(0);
    const rating=ratingFor(sim.ignitionsLeft),used=sim.stage.ignitions-sim.ignitionsLeft;let best;
    if(endlessIndex){best=Math.max(progress.endlessStars[endlessIndex]||0,rating);progress.endlessStars[endlessIndex]=best;progress.endlessNext=Math.max(progress.endlessNext,endlessIndex+1);warmEndless(endlessIndex+1,currentMode)}
    else{best=Math.max(progress.stars[sim.stage.number]||0,rating);progress.stars[sim.stage.number]=best;progress.unlocked=Math.max(progress.unlocked,Math.min(STAGE_COUNT+1,sim.stage.number+1));if(sim.stage.number===100)warmEndless(1,currentMode)}
    persist();audio.clear();
    $("result-kicker").textContent=endlessIndex?"ENDLESS CLEAR":currentMode===MODE_RESCUE?"RESCUE CLEAR":"STAGE CLEAR";$("result-title").textContent=currentMode===MODE_RESCUE?"救出成功":"全焼完了";$("result-stars").textContent=starsText(rating);$("result-detail").textContent=`BEST ${starsText(best)}  /  着火 ${used}回（最短 ${sim.stage.minimum}回）`;
    $("inspect-button").hidden=true;$("next-button").hidden=false;$("next-button").textContent=endlessIndex?"次の無限面":stageIndex>=STAGE_COUNT-1?"無限へ":"次へ";
  }else{
    postFailureRunning=burningCount(sim)>0;fitCamera(camera,sim.stage);audio.fail();$("result-kicker").textContent=currentMode===MODE_RESCUE?"RESCUE FAILED":"STAGE FAILED";$("result-title").textContent=currentMode===MODE_RESCUE?(sim.resultReason==="oni"?"鬼に接触":sim.resultReason==="trapped"?"脱出経路なし":"姫が燃え尽きた"):"燃え残り";$("result-stars").textContent="☆☆☆";$("result-detail").textContent="未クリア　最後の盤面を確認できます";$("inspect-button").hidden=false;$("next-button").hidden=false;$("next-button").textContent="選択へ";
  }
  setTimeout(()=>{$("result-panel").hidden=false},sim.result==="clear"?500:180);
}

function frame(now){
  frameRequest=0;
  const dt=Math.min(100,now-lastFrame);lastFrame=now;
  visualEffects=visualEffects.filter(effect=>now-effect.start<effect.duration);
  let active=false,effectsActive=visualEffects.length>0;
  if(sim){
    active=sim.started&&(!sim.finished||postFailureRunning);
    if(active){
      accumulator+=dt*speed;
      while(accumulator>=100&&(!sim.finished||postFailureRunning)){
        accumulator-=100;let tickEvents;
        if(postFailureRunning){tickEvents=stepMode(sim,{skipOutcome:true,allowFinished:true});processEvents(tickEvents);postFailureRunning=burningCount(sim)>0;if(!postFailureRunning)audio.setBurning(0)}
        else{tickEvents=stepMode(sim);processEvents(tickEvents)}
        updateHud();if(tickEvents.length)updateWarning();renderDirty=true;
      }
      if(sim.finished&&!resultShown)finish();
    }
    if(active||effectsActive||renderDirty){const ignitable=new Set();if(!sim.finished)for(let index=0;index<sim.cells.length;index++)if(isModeIgnitable(sim,index))ignitable.add(index);if(selectedIgnition>=0&&!ignitable.has(selectedIgnition)){selectedIgnition=-1;fitCamera(camera,sim.stage)}render(ctx,sim,camera,now,selectedIgnition>=0?selectedIgnition:hover,visualEffects,ignitable);renderDirty=false}
  }
  active=Boolean(sim?.started&&(!sim.finished||postFailureRunning));
  if(active||effectsActive||renderDirty)scheduleFrame(Math.max(0,FRAME_INTERVAL-(performance.now()-now)));
}

function ignitableCells(){const result=new Set();if(sim&&!sim.finished)for(let index=0;index<sim.cells.length;index++)if(isModeIgnitable(sim,index))result.add(index);return result}

function targetAt(index){return sim.mode===MODE_RESCUE?rescueEntityAt(sim,index)||sim.cells[index]:sim.cells[index]}

function selectIgnition(index){
  selectedIgnition=index;hover=-1;focusCamera(camera,sim.stage,index,TOUCH_ASSIST_TILE);$("hint-text").classList.remove("warning");$("hint-text").textContent=`${OBJECTS[targetAt(index).type].name}を選択中。もう一度タップで着火`;invalidate();
}

async function tapBoard(clientX,clientY,pointerType="mouse"){
  if(!sim)return;const box=canvas.getBoundingClientRect();let index=hitTest(sim.stage,camera,clientX,clientY,box);if(index<0)return;
  const coarsePointer=pointerType==="touch"||pointerType==="pen"||matchMedia("(pointer: coarse)").matches,ignitable=ignitableCells();
  if(!sim.finished&&coarsePointer){
    const corrected=ignitable.has(index)?index:nearestCell(sim.stage,camera,clientX,clientY,box,ignitable,TOUCH_ASSIST_RADIUS);
    if(selectedIgnition>=0){
      if(index!==selectedIgnition&&corrected!==selectedIgnition){if(corrected>=0)selectIgnition(corrected);else $("hint-text").textContent=`${OBJECTS[targetAt(selectedIgnition).type].name}を選択中`;return}
      index=selectedIgnition;
    }else if(displayedTileSize(camera,box)<TOUCH_ASSIST_THRESHOLD&&corrected>=0){selectIgnition(corrected);return}
    else if(corrected>=0)index=corrected;
  }
  const cell=sim.cells[index],entity=sim.mode===MODE_RESCUE?rescueEntityAt(sim,index):null,target=entity||cell,type=target?.type;
  if(sim.finished){if(inspectMode&&type>=0&&target.state!==REMOVED)$("hint-text").textContent=OBJECTS[type].category===CATEGORY_UTILITY?`燃焼不要：${OBJECTS[type].name}`:target.state===BURNING?`燃焼中：${OBJECTS[type].name}`:`盤面：${OBJECTS[type].name}`;return}
  await audio.unlock();
  if(directModeIgnite(sim,index)){
    const returnToWhole=selectedIgnition===index;selectedIgnition=-1;if(returnToWhole)fitCamera(camera,sim.stage);
    if(OBJECTS[type].category===CATEGORY_MELTABLE){audio.melt();addVisualEffect("steam",index);$("hint-text").textContent=`${OBJECTS[type].name}が溶けた`}
    else{audio.ignite();$("hint-text").textContent=`${OBJECTS[type].name}に着火`}
    updateHud();updateWarning();lastFrame=performance.now();accumulator=0;invalidate();return;
  }
  if(sim.mode===MODE_RESCUE&&sim.stage.tiles[index]===ROAD){$("hint-text").textContent="道路：救出モードでは通行できません";return}
  if(type>=0){
    const def=OBJECTS[type],reason=def.category===CATEGORY_UTILITY?`燃焼対象外（残り${target.charges}回）`:def.key==="princess"?"手動着火不可":def.category==="terrain"?"通行マス":target.state===BURNING?"燃焼中":target.state===REMOVED?"消滅済み":sim.ignitionsLeft<=0?"着火回数なし":"道路から遠すぎます";$("hint-text").textContent=`${def.name}：${reason}`;
  }
}

canvas.addEventListener("pointerdown",event=>{
  if(!sim||(sim.finished&&!inspectMode))return;canvas.setPointerCapture(event.pointerId);const p=canvasPoint(event.clientX,event.clientY,canvas.getBoundingClientRect());pointers.set(event.pointerId,{...p,startX:p.x,startY:p.y,clientX:event.clientX,clientY:event.clientY});gestureMoved=pointers.size>1;
});
canvas.addEventListener("pointermove",event=>{
  if(!sim)return;
  if(!pointers.has(event.pointerId)){
    const index=hitTest(sim.stage,camera,event.clientX,event.clientY,canvas.getBoundingClientRect()),nextHover=isModeIgnitable(sim,index)?index:-1;if(nextHover!==hover){hover=nextHover;invalidate()}return;
  }
  const box=canvas.getBoundingClientRect(),next=canvasPoint(event.clientX,event.clientY,box),current=pointers.get(event.pointerId),oldPoints=[...pointers.values()];
  if(Math.hypot(next.x-current.startX,next.y-current.startY)>5)gestureMoved=true;
  if(pointers.size===1&&gestureMoved)panCamera(camera,sim.stage,next.x-current.x,next.y-current.y);
  pointers.set(event.pointerId,{...current,...next,clientX:event.clientX,clientY:event.clientY});
  if(pointers.size>=2){
    const before=oldPoints.slice(0,2),after=[...pointers.values()].slice(0,2),oldDistance=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),newDistance=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
    if(oldDistance>0){const anchor={x:(after[0].x+after[1].x)/2,y:(after[0].y+after[1].y)/2};zoomCamera(camera,sim.stage,newDistance/oldDistance,anchor.x,anchor.y)}
  }
  hover=-1;invalidate();
});
canvas.addEventListener("pointerup",event=>{
  const point=pointers.get(event.pointerId),wasTap=pointers.size===1&&!gestureMoved;pointers.delete(event.pointerId);if(wasTap&&point)tapBoard(event.clientX,event.clientY,event.pointerType);if(!pointers.size)gestureMoved=false;
});
canvas.addEventListener("pointercancel",event=>{pointers.delete(event.pointerId);if(!pointers.size)gestureMoved=false});
canvas.addEventListener("pointerleave",()=>{if(!pointers.size&&hover!==-1){hover=-1;invalidate()}});
canvas.addEventListener("wheel",event=>{if(!sim)return;event.preventDefault();const p=canvasPoint(event.clientX,event.clientY,canvas.getBoundingClientRect());zoomCamera(camera,sim.stage,event.deltaY<0?1.2:.82,p.x,p.y);invalidate()},{passive:false});

$("zoom-out").addEventListener("click",()=>{if(sim){zoomCamera(camera,sim.stage,.8);invalidate()}});
$("zoom-in").addEventListener("click",()=>{if(sim){zoomCamera(camera,sim.stage,1.25);invalidate()}});
$("zoom-fit").addEventListener("click",()=>{if(sim){selectedIgnition=-1;hover=-1;fitCamera(camera,sim.stage);$("hint-text").textContent="全体表示に戻しました";invalidate()}});
$("guide-prev").addEventListener("click",()=>{guideIndex--;updateGuide()});
$("guide-next").addEventListener("click",()=>{guideIndex++;updateGuide()});
$("inspect-button").addEventListener("click",()=>{if(!sim||sim.result!=="fail")return;inspectMode=true;$("result-panel").hidden=true;$("result-return-button").hidden=false;$("hint-text").textContent="燃え残ったobjectをタッチすると種類を確認できます"});
$("result-return-button").addEventListener("click",()=>{inspectMode=false;$("result-return-button").hidden=true;$("result-panel").hidden=false});
$("start-button").addEventListener("click",async()=>{await audio.unlock();audio.gameStart();openModeSelect()});
$("burn-mode-button").addEventListener("click",()=>{currentMode=MODE_BURN;openSelect()});
$("rescue-mode-button").addEventListener("click",()=>{currentMode=MODE_RESCUE;openSelect()});
$("mode-title-button").addEventListener("click",()=>show("title"));
$("mode-back-button").addEventListener("click",openModeSelect);
$("back-button").addEventListener("click",openSelect);
const restartCurrent=()=>endlessIndex?startEndless(endlessIndex):startStage(stageIndex);
$("restart-button").addEventListener("click",restartCurrent);
$("retry-button").addEventListener("click",restartCurrent);
$("next-button").addEventListener("click",()=>{if(sim?.result!=="clear"){openSelect();return}if(endlessIndex)startEndless(endlessIndex+1);else if(stageIndex<STAGE_COUNT-1)startStage(stageIndex+1);else startEndless(1)});
$("speed-button").addEventListener("click",()=>{speed=speed===1?2:speed===2?4:1;if(speedLocked){preferredSpeed=speed;storage.setItem("hinomawari-speed",String(speed))}syncSpeedControls()});
$("speed-lock-button").addEventListener("click",()=>{speedLocked=!speedLocked;if(speedLocked){preferredSpeed=speed;storage.setItem("hinomawari-speed",String(speed))}storage.setItem("hinomawari-speed-locked",speedLocked?"1":"0");syncSpeedControls()});
for(const id of ["select-sound","game-sound"])$(id).addEventListener("click",async()=>{await audio.unlock();audio.toggle();syncMute()});
document.addEventListener("visibilitychange",()=>{
  lastFrame=performance.now();accumulator=0;
  if(document.hidden){stopFrameLoop();audio.setBurning(0)}
  else{if(sim)audio.setBurning(burningCount(sim));invalidate()}
});
document.addEventListener("keydown",event=>{if(event.key==="Enter"&&screens.title.classList.contains("active"))$("start-button").click();if(event.key===" "&&sim){event.preventDefault();$("speed-button").click()}if(event.key.toLowerCase()==="r"&&sim)restartCurrent()});

audio.setBgm("title");
window.addEventListener("pageshow",()=>{if(screens.title.classList.contains("active"))audio.playTitle()});
persist();syncMute();syncSpeedControls();
