import {OBJECTS,EMPTY,ROAD,IDLE,BURNING,REMOVED,TICKS_PER_SECOND,CATEGORY_COMBUSTIBLE,CATEGORY_UTILITY} from "./definitions.js";

const VIEW_W=384,VIEW_H=520,MARGIN=8,MAX_TILE=64;
const OBJECT_ATLAS_CELL=192,OBJECT_ATLAS_COLS=7,FX_ATLAS_CELL=128;
const objectAtlas=typeof Image!=="undefined"?new Image():null;
const terrainFxAtlas=typeof Image!=="undefined"?new Image():null;
const polishFxAtlas=typeof Image!=="undefined"?new Image():null;
const princessLod28=typeof Image!=="undefined"?new Image():null;
const princessLod64=typeof Image!=="undefined"?new Image():null;
const actorAtlasTall=typeof Image!=="undefined"?new Image():null;
const actorAtlasTallLod=typeof Image!=="undefined"?new Image():null;
if(objectAtlas){
  objectAtlas.decoding="async";objectAtlas.src="assets/sfc-object-atlas-64-v2.png";
  objectAtlas.addEventListener("load",()=>document.dispatchEvent(new Event("spriteatlasload")),{once:true});
}
if(terrainFxAtlas){
  terrainFxAtlas.decoding="async";terrainFxAtlas.src="assets/sfc-terrain-fx-atlas.png";
  terrainFxAtlas.addEventListener("load",()=>document.dispatchEvent(new Event("spriteatlasload")),{once:true});
}
if(polishFxAtlas){
  polishFxAtlas.decoding="async";polishFxAtlas.src="assets/sfc-polish-fx-atlas.png";
  polishFxAtlas.addEventListener("load",()=>document.dispatchEvent(new Event("spriteatlasload")),{once:true});
}
for(const [image,size] of [[princessLod28,28],[princessLod64,64]])if(image){
  image.decoding="async";image.src=`assets/princess-lod-${size}.png`;
  image.addEventListener("load",()=>document.dispatchEvent(new Event("spriteatlasload")),{once:true});
}
for(const [image,file] of [[actorAtlasTall,"sfc-actor-atlas-tall.png"],[actorAtlasTallLod,"sfc-actor-atlas-tall-lod.png"]])if(image){
  image.decoding="async";image.src=`assets/${file}`;
  image.addEventListener("load",()=>document.dispatchEvent(new Event("spriteatlasload")),{once:true});
}

const terrainCache={canvas:null,ctx:null,key:"",stage:null};

export function fitTile(stage){return Math.max(14,Math.floor(Math.min((VIEW_W-16)/stage.width,(VIEW_H-16)/stage.height,40)))}

export function clampCamera(camera,stage){
  const boardW=stage.width*camera.tile,boardH=stage.height*camera.tile;
  if(boardW<=VIEW_W-MARGIN*2)camera.x=Math.floor((VIEW_W-boardW)/2);else camera.x=Math.min(MARGIN,Math.max(VIEW_W-MARGIN-boardW,camera.x));
  if(boardH<=VIEW_H-MARGIN*2)camera.y=Math.floor((VIEW_H-boardH)/2);else camera.y=Math.min(MARGIN,Math.max(VIEW_H-MARGIN-boardH,camera.y));
  return camera;
}

export function createCamera(stage){
  const fit=fitTile(stage),tile=fit;
  return clampCamera({tile,fit,x:Math.floor((VIEW_W-stage.width*tile)/2),y:Math.floor((VIEW_H-stage.height*tile)/2)},stage);
}

export function fitCamera(camera,stage){
  camera.fit=fitTile(stage);camera.tile=camera.fit;camera.x=Math.floor((VIEW_W-stage.width*camera.tile)/2);camera.y=Math.floor((VIEW_H-stage.height*camera.tile)/2);return clampCamera(camera,stage);
}

export function zoomCamera(camera,stage,factor,anchorX=VIEW_W/2,anchorY=VIEW_H/2){
  const old=camera.tile,next=Math.max(camera.fit,Math.min(MAX_TILE,Math.round(old*factor)));
  if(next===old)return camera;
  const worldX=(anchorX-camera.x)/old,worldY=(anchorY-camera.y)/old;camera.tile=next;camera.x=anchorX-worldX*next;camera.y=anchorY-worldY*next;return clampCamera(camera,stage);
}

export function focusCamera(camera,stage,index,targetTile=MAX_TILE){
  const x=index%stage.width,y=Math.floor(index/stage.width);camera.tile=Math.max(camera.fit,Math.min(MAX_TILE,Math.round(targetTile)));camera.x=VIEW_W/2-(x+.5)*camera.tile;camera.y=VIEW_H/2-(y+.5)*camera.tile;return clampCamera(camera,stage);
}

export function panCamera(camera,stage,dx,dy){camera.x+=dx;camera.y+=dy;return clampCamera(camera,stage)}

export function boardLayout(stage,camera){
  const active=camera||createCamera(stage);return {tile:active.tile,left:active.x,top:active.y,width:stage.width*active.tile,height:stage.height*active.tile};
}

function rect(ctx,color,x,y,w,h){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))}

function drawAtlasCell(ctx,atlas,index,columns,x,y,w,h,alpha=1){
  if(!atlas?.complete||!atlas.naturalWidth)return false;
  ctx.globalAlpha=alpha;ctx.drawImage(atlas,(index%columns)*FX_ATLAS_CELL,Math.floor(index/columns)*FX_ATLAS_CELL,FX_ATLAS_CELL,FX_ATLAS_CELL,Math.round(x),Math.round(y),Math.round(w),Math.round(h));ctx.globalAlpha=1;return true;
}

function drawAtlasObject(ctx,type,x,y,s,dim=false,time=0){
  if(type===12&&drawAtlasCell(ctx,terrainFxAtlas,5,6,x,y,s,s,dim?.56:1)){const p=Math.max(1,Math.floor(s/20)),shift=Math.floor(time/220)%5;ctx.globalAlpha=.55;rect(ctx,"#d8ffff",x+(2+shift)*p,y+7*p,6*p,p);rect(ctx,"#69d2df",x+(11-shift)*p,y+13*p,7*p,p);ctx.globalAlpha=1;return true}
  if(!objectAtlas?.complete||!objectAtlas.naturalWidth)return false;
  const sourceX=(type%OBJECT_ATLAS_COLS)*OBJECT_ATLAS_CELL,sourceY=Math.floor(type/OBJECT_ATLAS_COLS)*OBJECT_ATLAS_CELL;
  if(s>=40){ctx.globalAlpha=.3;rect(ctx,"#090706",x+s*.18,y+s*.83,s*.64,s*.11);ctx.globalAlpha=1}
  // The car and gasoline-tank cells retain a few pixels from the source
  // artwork above their roofs/handles. Clip only that contaminated cap while
  // preserving the shared atlas and the objects' intended scale.
  const topTrim=(type===7||type===8)?24:0;
  ctx.save();
  if(topTrim){ctx.beginPath();ctx.rect(x,y+s*topTrim/OBJECT_ATLAS_CELL,s,s);ctx.clip()}
  ctx.globalAlpha=dim?.56:1;ctx.drawImage(objectAtlas,sourceX,sourceY,OBJECT_ATLAS_CELL,OBJECT_ATLAS_CELL,Math.round(x),Math.round(y),Math.round(s),Math.round(s));
  ctx.restore();ctx.globalAlpha=1;
  if(type===12&&s>=20){const p=Math.max(1,Math.floor(s/20)),shift=Math.floor(time/220)%5;ctx.globalAlpha=.5;rect(ctx,"#d8ffff",x+(2+shift)*p,y+7*p,6*p,p);rect(ctx,"#69d2df",x+(11-shift)*p,y+13*p,7*p,p);ctx.globalAlpha=1}
  if(dim){ctx.globalAlpha=.3;const p=Math.max(1,Math.floor(s/16));rect(ctx,"#120d0b",x+3*p,y+5*p,5*p,p);rect(ctx,"#120d0b",x+9*p,y+10*p,4*p,p);rect(ctx,"#302019",x+6*p,y+13*p,5*p,p);ctx.globalAlpha=1}
  return true;
}

function drawObjectSmall(ctx,type,x,y,s,dim=false){
  const p=Math.max(1,Math.floor(s/8)),ox=x+Math.floor((s-8*p)/2),oy=y+Math.floor((s-8*p)/2);ctx.globalAlpha=dim?.55:1;
  const object=OBJECTS[type],r=(c,a,b,w,h)=>rect(ctx,c,ox+a*p,oy+b*p,w*p,h*p);
  if(type===0){r("#315f2c",1,1,2,6);r("#5bb94a",2,0,4,2);r("#72ce55",4,2,3,2);r("#4a9a3e",2,4,4,2);r("#82d05b",0,5,3,2)}
  if(type===1){r("#744526",3,4,2,4);r("#265c2c",1,1,6,4);r("#397d35",0,2,3,3);r("#4c9941",3,0,3,3);r("#1d4927",5,2,3,3)}
  if(type===2){r(object.color,1,3,6,5);r("#5f3828",0,3,8,2);r("#7c4a30",2,1,4,2);r("#3d2a22",3,5,2,3);r(object.accent,5,5,1,1)}
  if(type===3){r(object.color,1,0,6,8);r(object.accent,2,1,4,6);for(let yy=1;yy<7;yy+=2){r("#2d3b43",2,yy,1,1);r("#2d3b43",5,yy,1,1)}r("#4d565c",3,7,2,1)}
  if(type===4){r(object.color,2,1,4,6);r(object.accent,1,2,6,1);r("#762723",1,5,6,1);r("#e66a58",2,1,4,1);r("#4a201e",2,7,4,1)}
  if(type===5){r(object.color,2,4,5,4);r("#f4ffff",3,1,4,4);r("#26343a",4,2,1,1);r("#8fb8c2",5,3,2,1);r(object.accent,1,4,2,1);r(object.accent,6,4,2,1)}
  if(type===6){r(object.color,2,2,4,6);r("#5b91a0",3,3,3,4);r(object.accent,3,1,3,1);r("#26383e",4,0,3,1);r("#24343a",6,1,1,4);r(object.accent,4,4,1,1)}
  if(type===7){r(object.color,1,3,6,3);r("#8d969b",2,2,4,2);r(object.accent,3,2,2,1);r("#1c2021",1,6,2,2);r("#1c2021",5,6,2,2);r(object.accent,2,6,1,1);r(object.accent,6,6,1,1)}
  if(type===8){r(object.color,2,1,4,6);r("#7d3519",1,2,6,1);r(object.accent,2,4,4,1);r("#4a2418",3,0,2,1);r("#f4a43d",2,6,4,1)}
  if(type===9){r(object.color,1,0,6,8);r("#4b2b1e",2,1,4,6);r(object.accent,5,4,1,1);r("#a97745",2,1,1,6)}
  if(type===10){r(object.color,0,1,8,7);for(let yy=1;yy<8;yy+=2){r(object.accent,(yy%4)?0:1,yy,(yy%4)?3:3,1);r("#4f4c48",4,yy,4,1)}r("#3f3d39",0,7,8,1)}
  if(type===11){r("#4a3412",1,0,6,8);r(object.color,2,1,4,7);r("#fff1a0",3,2,2,4);r("#704d16",4,4,2,1);r(object.accent,2,0,4,1)}
  if(type===12){r(object.color,0,0,8,8);r(object.accent,0,1,5,1);r("#b8f4ef",3,3,5,1);r(object.accent,0,5,5,1);r("#245f91",2,7,6,1)}
  if(type===13){r("#dce8e4",2,0,4,1);r("#4fc35c",4,0,1,1);r(object.color,2,1,4,4);r("#f2c6a4",3,2,2,2);r("#245c38",1,5,6,3);r(object.accent,3,5,2,2);r("#5a351f",2,7,1,1);r("#5a351f",5,7,1,1)}
  if(type===14){r(object.color,1,2,6,5);r("#7a352f",2,0,1,3);r("#7a352f",5,0,1,3);r("#f0c090",2,3,1,1);r("#f0c090",5,3,1,1);r(object.accent,2,6,4,2)}
  if(type===15){r(object.color,2,2,4,4);r("#6b2f69",2,0,1,3);r("#6b2f69",5,0,1,3);r("#f4c3a2",3,3,1,1);r("#f4c3a2",5,3,1,1);r(object.accent,2,6,2,2);r(object.accent,5,6,1,2)}
  if(type===16){r(object.color,1,1,6,6);r("#53315f",1,0,2,3);r("#53315f",5,0,2,3);r("#f4c3a2",2,3,1,1);r("#f4c3a2",5,3,1,1);r(object.accent,1,6,2,2);r(object.accent,5,6,2,2)}
  if(type===17){r(object.color,1,1,6,6);r("#301c3a",0,0,3,3);r("#301c3a",5,0,3,3);r(object.accent,2,3,1,1);r(object.accent,5,3,1,1);r("#d9a65c",2,6,4,2);r("#ffffff",3,5,2,1)}
  if(type===18){r(object.color,1,2,6,5);r("#245267",2,1,4,1);r(object.accent,2,3,4,1);r("#bfe8ee",3,4,2,2);r("#263f49",1,7,2,1);r("#263f49",5,7,2,1)}
  if(type===19){r(object.color,1,0,6,8);r("#2c343b",2,1,4,7);for(let yy=1;yy<7;yy+=2){r(object.accent,2,yy,1,1);r("#91a4ad",4,yy,2,1)}r("#242a30",3,7,2,1)}
  if(type===20){r(object.color,0,3,8,5);r("#51432f",1,1,2,3);r("#3b3f40",5,0,2,4);r(object.accent,1,4,6,1);r("#d48238",2,5,2,2);r("#303538",5,5,2,2);r("#252728",6,0,1,2)}
  ctx.globalAlpha=1;
}

// Large tiles and the object guide use a denser 16px sprite. The board keeps the
// compact 8px silhouettes above so even a 22x22 map remains readable on phones.
function drawObjectDetailed(ctx,type,x,y,s,dim=false,time=0){
  const p=Math.max(1,Math.floor(s/16)),ox=x+Math.floor((s-16*p)/2),oy=y+Math.floor((s-16*p)/2),object=OBJECTS[type];
  const r=(color,a,b,w=1,h=1)=>rect(ctx,color,ox+a*p,oy+b*p,w*p,h*p);
  const phase=Math.floor(time/180)%2;
  ctx.globalAlpha=dim?.55:1;
  r("#0d0c0a",2,14,12,2);
  switch(type){
    case 0: // vine
      r("#234d29",3,2,2,12);r("#4a9a3e",5,1,5,2);r("#72ce55",8,0,4,3);r("#315f2c",4,5,6,2);r("#82d05b",8,4,5,3);r("#397d35",2,8,7,2);r("#6dbc4c",0,10,5,3);r("#315f2c",6,11,6,2);r("#8bd562",10,10,5,3);r("#b0e37c",10,1,1,1);break;
    case 1: // tree
      r("#4d2e1d",7,9,3,6);r("#744526",6,9,3,5);r("#1d4927",3,3,11,7);r("#265c2c",1,5,5,6);r("#397d35",4,1,7,7);r("#4c9941",8,2,6,7);r("#66ae4a",5,2,3,2);r("#143b22",11,7,4,4);break;
    case 2: // wooden house
      r("#4b2b20",1,6,14,9);r("#714128",2,7,12,8);r("#a8653a",3,8,10,7);r("#5f3828",0,6,16,3);r("#7c4a30",3,3,10,3);r("#9e6540",5,1,6,2);r("#3d2a22",7,10,3,5);r("#d9a65c",11,9,2,3);r("#ffe08a",11,9,1,2);r("#3c3029",12,2,2,4);break;
    case 3: // steel building
      r("#454d52",3,1,10,14);r("#747d82",4,0,8,15);r("#adb5b8",5,1,6,1);r("#303a40",5,3,2,2);r("#303a40",9,3,2,2);r("#60737b",5,6,2,2);r("#60737b",9,6,2,2);r("#303a40",5,9,2,2);r("#303a40",9,9,2,2);r("#d5c06f",5,12,2,2);r("#39444a",9,12,2,3);r("#9ca5a8",3,1,1,13);break;
    case 4: // drum
      r("#5c2020",4,2,8,13);r("#a92f2b",3,3,10,11);r("#d94a3e",4,2,8,2);r("#7b2423",3,6,10,2);r("#ef6b55",4,9,8,3);r("#7b2423",3,12,10,2);r("#ffd45a",7,9,2,3);r("#33231f",8,8,1,5);break;
    case 5: // snowman
      r("#b9dfe6",3,9,10,6);r("#efffff",4,8,9,6);r("#b9dfe6",5,3,7,7);r("#f8ffff",6,2,6,7);r("#26343a",7,4,1,1);r("#26343a",10,4,1,1);r("#e78435",9,5,3,1);r("#498ca0",4,8,9,2);r("#6cb8c9",3,9,3,2);r("#654228",1,9,3,1);r("#654228",12,9,3,1);break;
    case 6: // extinguisher
      r("#244b59",5,3,7,12);r("#468da0",4,5,7,10);r("#72c4d2",5,6,5,7);r("#dffcff",6,7,3,2);r("#26383e",7,1,5,2);r("#8bd6df",6,2,3,2);r("#26383e",11,2,2,8);r("#26383e",12,8,3,2);r("#bfeff3",7,10,1,1);break;
    case 7: // car
      r("#202526",2,11,4,4);r("#202526",10,11,4,4);r("#8e979b",3,7,10,6);r("#bcc2c4",5,4,6,4);r("#49575e",6,5,2,3);r("#60737b",9,5,2,3);r("#6d777c",2,9,12,4);r("#e2c45d",2,10,2,2);r("#d56b55",12,10,2,2);r("#b9c0c2",6,12,4,1);break;
    case 8: // gasoline tank
      r("#5d2c19",4,2,8,13);r("#b65a21",3,4,10,11);r("#e5812f",4,5,8,8);r("#4a2418",5,1,6,3);r("#f2a840",5,7,6,4);r("#39251d",8,7,1,4);r("#39251d",6,9,5,1);r("#ffcf55",4,13,8,1);break;
    case 9: // door
      r("#3c261c",3,1,10,14);r("#6e4026",4,2,8,13);r("#9c6036",5,3,6,11);r("#5b341f",6,4,4,4);r("#5b341f",6,9,4,4);r("#d9a65c",10,8,1,1);r("#bb7a45",5,3,1,10);break;
    case 10: // wall
      r("#484641",1,3,14,12);r("#77736c",1,2,14,12);r("#a39d91",2,3,5,2);r("#5b5852",8,3,6,2);r("#5b5852",2,6,3,2);r("#918b82",6,6,7,2);r("#a39d91",2,9,6,2);r("#5b5852",9,9,5,2);r("#5b5852",2,12,4,2);r("#918b82",7,12,7,2);break;
    case 11: // exit
      r("#4a3412",2,1,12,14);r("#b77b1f",3,2,10,13);r("#f2c448",4,3,8,12);r("#fff1a0",5,4,6,9);r("#ffffff",6,5,4,7);r("#6f4a14",8,7,4,2);r("#6f4a14",10,6,2,4);r("#e6a92f",5,1,6,2);break;
    case 12: { // river
      r("#174b78",0,0,16,16);r("#2879a6",0,1,16,14);const shift=(Math.floor(time/250)%4);for(let yy=2;yy<15;yy+=4){r("#b8f4ef",(yy+shift)%5-2,yy,7,1);r("#5bc7d1",9-((yy+shift)%4),yy+2,8,1)}break;
    }
    case 13: // princess
      r("#dce8e4",5,1,7,2);r("#f7ffff",6,1,5,1);r("#4fc35c",8,0,2,3);r("#064f4d",4,2,9,8);r("#08766c",5,2,8,7);r("#f2c6a4",6,4,5,4);r("#174c35",7,6,1,1);r("#174c35",10,6,1,1);r("#a95645",8,8,2,1);r("#245c38",3,9,10,6);r("#70ad55",5,10,6,5);r("#f3ead1",7,10,2,4);r("#cbd9b2",6,14,4,1);break;
    case 14: // fat oni
      r("#6e302e",4,0,2,4);r("#6e302e",10,0,2,4);r("#b34c42",2,3,12,11);r("#d26854",4,4,8,7);r("#f0c090",5,6,2,2);r("#f0c090",10,6,2,2);r("#402127",7,9,3,1);r("#684052",3,12,10,3);r("#d9a65c",6,12,4,2);break;
    case 15: // small oni
      r("#643063",5,0,2,4);r("#643063",10,0,2,4);r("#a74895",4,3,8,9);r("#ce6fbe",5,4,6,6);r("#f4c3a2",6,6,1,1);r("#f4c3a2",10,6,1,1);r("#55305e",5,11,6,2);r("#d9a65c",6,11,4,2);r("#4e2d59",phase?3:5,13,3,2);r("#4e2d59",phase?10:8,13,3,2);break;
    case 16: // big oni
      r("#4d2c5d",3,0,3,5);r("#4d2c5d",10,0,3,5);r("#79508b",1,4,14,10);r("#9b6cad",4,3,8,9);r("#f4c3a2",5,6,2,2);r("#f4c3a2",10,6,2,2);r("#3f244b",7,10,3,1);r("#5c3769",2,12,12,3);r("#d9a65c",6,12,4,2);break;
    case 17: // strong oni
      r("#24172d",2,0,4,5);r("#24172d",10,0,4,5);r("#3f2850",2,3,12,12);r("#67417a",4,3,8,9);r("#ff5b43",5,6,2,2);r("#ff5b43",10,6,2,2);r("#ffffff",7,9,3,2);r("#c1934d",4,11,8,3);r("#ffe078",6,12,4,1);break;
    case 18: // water tank
      r("#263f49",4,12,3,3);r("#263f49",10,12,3,3);r("#245267",3,3,10,11);r("#397a91",2,5,12,8);r("#69b8c9",3,4,10,2);r("#9ce7ef",3,8,10,2);r("#bfe8ee",7,7,2,4);r("#579db0",3,12,10,2);r("#263f49",6,2,4,2);break;
    case 19: // high-rise
      r("#252c31",4,0,8,15);r("#46535c",3,2,10,13);r("#687780",5,1,6,14);for(let yy=3;yy<13;yy+=3){r(yy%2?"#e8c865":"#8da7b3",6,yy,2,2);r("#39474f",9,yy,2,2)}r("#242a30",7,13,3,2);r("#aeb9bd",7,0,2,2);break;
    case 20: // factory
      r("#373b3d",2,5,13,10);r("#6b5b43",1,7,14,8);r("#8a744f",2,6,4,3);r("#8a744f",6,5,4,4);r("#8a744f",10,4,4,5);r("#3b3f40",3,1,3,6);r("#252728",4,0,2,4);r("#4c5051",11,0,3,6);r("#252728",12,0,2,3);r("#d48238",3,10,4,3);r("#f0b24c",8,10,2,3);r("#303538",11,10,3,3);r("#d54b37",3,14,10,1);break;
  }
  if(dim){ctx.globalAlpha=.22;for(let yy=2;yy<15;yy+=3)r("#0b0908",(yy*3+type)%5,yy,8,1)}
  ctx.globalAlpha=1;
}

// At maximum zoom and in the guide, add a 24px micro-detail pass over the
// 16px silhouette. Keeping this as a separate pass preserves readability on
// compact boards while giving large sprites finer material and face details.
function drawObjectHighDetails(ctx,type,x,y,s,dim=false,time=0){
  const p=s/24,ox=x,oy=y,r=(color,a,b,w=1,h=1)=>rect(ctx,color,ox+a*p,oy+b*p,w*p,h*p),phase=Math.floor(time/220)%3;
  ctx.globalAlpha=dim?.4:1;
  switch(type){
    case 0: // leaf veins and curling tip
      r("#b4e982",15,2,1,3);r("#9bdb69",17,4,3,1);r("#244e28",7,7,5,1);r("#a5df74",4,14,4,1);r("#315f2c",17,16,2,4);r("#80ca58",18,19,3,1);r("#315f2c",20,18,1,3);break;
    case 1: // bark, branch gaps and leaf sparkle
      r("#3a251a",11,15,1,6);r("#9b6035",13,16,1,5);r("#173d22",3,11,3,2);r("#6ab64e",9,4,2,2);r("#78c759",16,8,2,1);r("#234d29",18,13,3,2);r("#a2dc72",12,3,1,1);break;
    case 2: // roof tiles, timber and window panes
      for(let i=4;i<20;i+=4)r(i%8?"#9b5d38":"#75432d",i,7,3,1);r("#d98a4e",5,13,1,8);r("#6b3b27",18,13,1,8);r("#fff0a2",17,14,3,3);r("#8d572f",18,14,1,3);r("#8d572f",17,15,3,1);r("#d9a65c",13,18,1,1);r("#25201d",19,3,2,4);break;
    case 3: // steel braces, bolts and alternating window light
      r("#c7d0d3",6,2,1,19);r("#3a454b",17,2,1,19);for(let yy=4;yy<20;yy+=4){r(yy%8?"#9fb1b8":"#d6bd65",9,yy,2,2);r("#29363d",14,yy,2,2);r("#9ba5a9",7,yy+2,1,1);r("#9ba5a9",17,yy+2,1,1)}r("#303a40",11,19,3,3);break;
    case 4: // drum ribs, rim and warning flame
      r("#f17b65",8,4,8,1);r("#532020",7,8,10,1);r("#f17b65",7,14,10,1);r("#532020",7,19,10,1);r("#ffc85a",11,12,2,4);r("#ff8a32",10,15,4,2);r("#43201d",12,11,1,6);r("#e15c4d",8,6,1,12);break;
    case 5: // hat, face, scarf fringe and buttons
      r("#33474f",8,2,8,2);r("#48616a",10,0,5,3);r("#1f2d32",10,7,1,1);r("#1f2d32",15,7,1,1);r("#e98235",13,9,4,1);r("#28373c",12,14,1,1);r("#28373c",12,18,1,1);r("#68b7c9",6,13,12,2);r("#4c98aa",17,14,2,4);r("#ffffff",8,5,2,1);break;
    case 6: // gauge, label, hose and nozzle
      r("#e9ffff",11,4,3,3);r("#31545e",12,5,1,1);r("#bfeff3",9,10,5,5);r("#397786",10,11,1,3);r("#397786",13,11,1,3);r("#25363b",17,4,2,12);r("#25363b",18,14,4,2);r("#7fd0db",8,7,1,12);r("#e7ffff",11,12,1,1);break;
    case 7: // glass reflections, grille and wheel hubs
      r("#d7e1e3",8,8,3,1);r("#eef4f4",12,8,1,1);r("#3f525b",14,8,2,4);r("#15191a",4,17,5,4);r("#15191a",16,17,5,4);r("#949fa3",6,18,1,1);r("#949fa3",18,18,1,1);for(let i=10;i<15;i+=2)r("#d9dedf",i,18,1,1);r("#fff0a0",3,15,2,2);r("#d65a4c",20,15,1,2);break;
    case 8: // handle, seams and fuel drop
      r("#3d2119",9,2,7,2);r("#e69741",7,7,10,1);r("#7d3519",6,18,12,1);r("#ffe06a",11,11,2,5);r("#ffad39",10,14,4,3);r("#5a2c1c",13,10,1,7);r("#f5ad52",7,9,1,9);r("#40231b",17,6,2,3);break;
    case 9: // planks, hinges and key plate
      r("#c17b45",8,4,1,16);r("#5a321f",15,4,1,16);r("#704026",9,7,5,1);r("#704026",9,14,5,1);r("#d6a259",16,12,2,2);r("#5a3824",16,14,1,2);r("#2d211b",6,6,1,3);r("#2d211b",6,16,1,3);break;
    case 10: // mortar, chips and cracks
      for(let yy=6;yy<21;yy+=5){r("#c1bbb0",3+(yy%3),yy,6,1);r("#625f58",13-(yy%4),yy,7,1)}r("#504e49",11,5,1,4);r("#b0aaa0",16,11,1,4);r("#474642",7,16,2,1);r("#474642",8,17,1,2);r("#d0c9bb",4,9,1,1);break;
    case 11: // luminous doorway and animated exit chevron
      r("#fff8c9",9,6,6,12);r("#ffffff",11,7,3,10);r("#e0a92c",5,3,14,2);r("#6f4a14",12+phase,11,4,2);r("#6f4a14",15+phase,9,2,6);r("#ffd45a",7,5,1,14);r("#9a681c",18,5,1,16);break;
    case 12: { // narrow animated ripples and foam
      const shift=Math.floor(time/180)%6;for(let yy=3;yy<23;yy+=5){r("#d8ffff",(yy+shift)%8-3,yy,8,1);r("#74d9e2",12-((yy+shift)%6),yy+2,10,1)}r("#1c6594",18,6+phase*4,4,1);break;
    }
    case 13: // silver circlet, braid, green eyes and leaf embroidery
      r("#eff8f4",8,3,10,1);r("#819b96",7,4,12,1);r("#65df68",12,2,2,3);r("#043f41",6,6,2,10);r("#0a635e",17,6,2,11);r("#0f7f6d",18,11,2,6);r("#174c35",10,9,1,1);r("#174c35",15,9,1,1);r("#a95645",12,12,2,1);r("#f3ead1",11,16,3,4);r("#dce8e4",12,17,1,1);r("#a9c88d",8,21,9,1);r("#704128",9,22,2,2);r("#704128",16,22,2,2);break;
    case 14: // brows, nostrils, sash and spotted skin
      r("#71302d",7,2,2,4);r("#71302d",16,2,2,4);r("#4b2525",7,8,3,1);r("#4b2525",15,8,3,1);r("#f0c090",8,10,2,2);r("#f0c090",16,10,2,2);r("#6b2d2c",12,12,2,1);r("#6a3f50",5,18,14,3);r("#e4b257",10,19,5,2);r("#8f3b37",5,14,2,2);r("#8f3b37",18,15,1,1);break;
    case 15: // alert eyes, fangs, belt and running feet
      r("#562b5a",8,1,2,4);r("#562b5a",15,1,2,4);r("#3d213f",8,8,3,1);r("#3d213f",14,8,3,1);r("#f4c3a2",9,10,1,2);r("#f4c3a2",16,10,1,2);r("#fff5da",11,13,1,2);r("#fff5da",14,13,1,2);r("#4b2b55",7,17,12,2);r("#e5b65c",11,17,4,2);r("#45264e",phase===1?4:7,21,5,2);r("#45264e",phase===1?16:13,21,5,2);break;
    case 16: // horn bands, heavy jaw and armor pattern
      r("#382142",6,1,4,5);r("#382142",16,1,4,5);r("#ba88c8",8,6,10,2);r("#4c2b59",8,10,3,1);r("#4c2b59",16,10,3,1);r("#f4c3a2",9,12,2,2);r("#f4c3a2",17,12,2,2);r("#342039",12,15,4,2);r("#573263",5,18,16,3);r("#e0ad58",11,19,5,2);r("#b881c7",5,8,2,8);break;
    case 17: // plated armor, glowing eyes and scar
      r("#1b111f",4,1,5,6);r("#1b111f",17,1,5,6);r("#8e5ca0",7,5,12,2);r("#ff4235",8,10,3,2);r("#ff4235",16,10,3,2);r("#ffb04a",9,10,1,1);r("#ffb04a",17,10,1,1);r("#b98b49",6,17,14,4);r("#ffe078",11,18,5,1);r("#ffffff",11,14,4,2);r("#2a182f",13,7,1,7);r("#bc4560",14,8,1,5);break;
    case 18: // rivets, level glass and water mark
      r("#9ce7ef",7,6,10,1);r("#2c6377",6,16,12,1);for(const xx of [6,18])for(const yy of [7,12,18])r("#bfe8ee",xx,yy,1,1);r("#d9fbff",11,10,3,5);r("#69bed0",10,13,5,3);r("#244653",9,4,6,2);r("#223b45",6,20,4,3);r("#223b45",15,20,4,3);break;
    case 19: // dense window grid, antenna and rooftop lights
      r("#bbc7ca",10,1,1,3);r("#d84d3d",12,0,1,2);r("#344149",6,4,1,18);r("#7d8d95",18,4,1,18);for(let yy=5;yy<20;yy+=3){r(yy%2?"#efd06a":"#9bb4be",9,yy,2,1);r("#40515a",13,yy,2,1);r(yy%3?"#6f8791":"#e9c963",16,yy,1,1)}r("#252c31",11,20,4,3);break;
    case 20: // bricks, hazard marks, pipes and chimney smoke
      for(let yy=11;yy<21;yy+=4){r("#aa8b5c",4+(yy%3),yy,6,1);r("#4c4438",13,yy,6,1)}r("#202425",6,3,1,6);r("#202425",18,1,1,7);r("#909798",19,0,2,2);r("#676d6e",20-phase,0,2,2);r("#f1bd53",6,16,5,3);r("#433624",8,16,1,3);r("#433624",6,17,5,1);r("#d3533a",5,21,14,1);r("#f09a44",15,15,2,3);break;
  }
  ctx.globalAlpha=1;
}

// The full 192px princess loses isolated pixels when a large stage displays
// compact tiles. This board-only LOD is authored at its final 28px size and is
// centred without scaling, so its pixel clusters never become uneven widths.
function drawPrincessBoardLod(ctx,x,y,s,dim=false,p=1){
  const native=28*p,ox=x+Math.floor((s-native)/2),oy=y+Math.floor((s-native)/2),r=(color,a,b,w=1,h=1)=>rect(ctx,color,ox+a*p,oy+b*p,w*p,h*p);ctx.globalAlpha=dim?.55:1;
  // Grounding and separate boots keep the dress silhouette from becoming a block.
  r("#090806",5,26,18,2);r("#3e2519",7,23,5,4);r("#3e2519",16,23,5,4);r("#a56532",8,23,3,2);r("#a56532",17,23,3,2);
  // Connected hair mass and asymmetric braid preserve the high-resolution read.
  r("#021f24",10,1,8,1);r("#021f24",8,2,12,2);r("#021f24",6,4,16,6);r("#021f24",6,9,4,5);r("#021f24",19,8,4,9);
  r("#064f50",9,2,10,7);r("#08766c",10,2,8,3);r("#0b9380",7,4,4,4);r("#0b9380",18,4,3,4);r("#064f50",7,8,3,6);r("#08766c",20,9,2,7);r("#0b9380",20,11,2,2);r("#819b96",21,15,3,1);
  // Silver circlet and a two-pixel emerald stay legible at actual board size.
  r("#819b96",7,5,14,1);r("#eaf5ef",8,4,5,1);r("#eaf5ef",16,4,4,1);r("#174c35",12,3,4,3);r("#65df68",13,2,2,3);r("#b8f4cf",13,2,1,1);
  // A broad warm face separates clearly from the cool-green hair.
  r("#d8946e",9,6,10,6);r("#f2c6a4",10,6,8,6);r("#174c35",11,8,2,2);r("#174c35",16,8,2,2);r("#fff8df",11,8,1,1);r("#fff8df",16,8,1,1);r("#a95645",13,11,3,1);
  // Stepped mantle, ivory bodice, leaf clasp and joined hands.
  r("#102a20",8,12,12,2);r("#102a20",6,13,16,4);r("#102a20",5,15,5,3);r("#102a20",19,15,4,3);
  r("#245c38",7,13,14,3);r("#174c35",6,14,5,3);r("#174c35",18,14,4,3);r("#70ad55",9,13,10,2);
  r("#f3ead1",11,12,7,7);r("#dce8e4",12,13,5,6);r("#819b96",12,12,5,2);r("#65df68",14,12,2,2);r("#f2c6a4",9,16,3,3);r("#f2c6a4",17,16,3,3);r("#b96f4f",12,17,5,2);
  // Bell-shaped skirt with broad, stable colour bands instead of tiny ornament pixels.
  r("#102a20",9,18,11,2);r("#102a20",7,19,15,2);r("#102a20",6,21,17,2);r("#102a20",5,23,19,2);
  r("#245c38",10,18,9,2);r("#245c38",8,19,13,2);r("#245c38",7,21,15,2);r("#245c38",6,23,17,1);
  r("#70ad55",8,20,4,4);r("#70ad55",18,20,4,4);r("#a9c88d",10,21,2,3);r("#a9c88d",18,21,2,3);r("#f3ead1",12,18,6,6);r("#dce8e4",13,19,4,5);r("#ffffff",14,19,2,3);
  ctx.globalAlpha=1;
}

function drawObject(ctx,type,x,y,s,dim=false,time=0){
  if(type===13&&s>=28&&s<38){
    if(princessLod28?.complete&&princessLod28.naturalWidth){const offset=Math.floor((s-28)/2);ctx.globalAlpha=dim?.55:1;ctx.drawImage(princessLod28,x+offset,y+offset);ctx.globalAlpha=1}
    else drawPrincessBoardLod(ctx,x,y,s,dim);
    return;
  }
  if(s>=20&&drawAtlasObject(ctx,type,x,y,s,dim,time))return;
  if(s<24)drawObjectSmall(ctx,type,x,y,s,dim);else{drawObjectDetailed(ctx,type,x,y,s,dim,time);if(s>=34)drawObjectHighDetails(ctx,type,x,y,s,dim,time)}
}

function drawTallActor(ctx,type,s,dim=false,preview=false){
  if(type<13||type>17)return false;
  const high=preview||s>=38,atlas=high?actorAtlasTall:actorAtlasTallLod,sourceW=high?128:32,sourceH=high?192:48;
  if(!atlas?.complete||!atlas.naturalWidth)return false;
  let width,height;
  if(!preview&&s>=26&&s<38){width=32;height=48}
  else if(preview){width=43;height=64}
  else{width=Math.max(16,Math.round(s*1.15));height=Math.max(24,Math.round(s*1.72))}
  const sourceX=(type-13)*sourceW;ctx.globalAlpha=dim?.56:1;
  ctx.drawImage(atlas,sourceX,0,sourceW,sourceH,Math.round(-width/2),-height,width,height);ctx.globalAlpha=1;return true;
}

function drawStatefulObject(ctx,target,type,x,y,s,time,walk=0,direction=0){
  const def=OBJECTS[type],burning=target.state===BURNING,max=Math.max(1,def.duration*TICKS_PER_SECOND),damage=burning?1-Math.max(0,target.remaining)/max:0,actor=type>=13&&type<=17;
  let scaleX=1,scaleY=1,dx=0,dy=0,angle=0;
  if(walk>0){const step=Math.sin(walk*Math.PI*4);dy-=Math.abs(step)*s*.045;scaleX+=step*.025;scaleY-=step*.025;angle=direction*s*.00055*step}
  if(burning){
    const flicker=Math.sin(time/74+type*1.7);
    if(type===0||type===1){angle=flicker*.035*(.35+damage);scaleY=1-damage*.09;dy+=damage*s*.07}
    else if(type===2||type===9){dx=flicker*s*.018*damage;scaleY=1-damage*.1;dy+=damage*s*.08}
    else if(type===4||type===8||type===20){dx=flicker*s*.026*(.35+damage);scaleX=1+Math.sin(time/92)*.025*damage;scaleY=1+Math.cos(time/87)*.02*damage}
    else if(type===10){dx=flicker*s*.012*damage;angle=flicker*.012*damage;dy+=damage*s*.04}
    else if(type>=13&&type<=17){dx=flicker*s*.018;angle=flicker*.025;scaleY=1-damage*.07}
    else{dx=flicker*s*.009*damage;scaleY=1-damage*.035}
  }
  ctx.save();ctx.translate(x+s/2+dx,y+(actor?s:s/2)+dy);ctx.rotate(angle);ctx.scale((direction<0?-1:1)*scaleX,scaleY);
  if(burning){
    if(type===3||type===7||type===19)ctx.filter=`sepia(${.25+damage*.55}) saturate(${1.15+damage*1.6}) brightness(${1.06-damage*.2})`;
    else if(type===18)ctx.filter=`brightness(${1.05-damage*.28}) saturate(${1.15-damage*.3})`;
    else ctx.filter=`sepia(${.12+damage*.48}) saturate(${1.05+damage*.8}) brightness(${1.02-damage*.28})`;
  }
  const dim=target.state===IDLE&&target.remaining<max;if(actor){if(!drawTallActor(ctx,type,s,dim))drawObject(ctx,type,-s/2,-s,s,dim,time)}else drawObject(ctx,type,-s/2,-s/2,s,dim,time);ctx.restore();
  if(burning&&s>=26){
    const p=Math.max(1,Math.floor(s/32));ctx.globalAlpha=.35+damage*.4;
    if(type===2||type===9){rect(ctx,"#ffb13b",x+s*.27,y+s*(.56-damage*.08),4*p,2*p);rect(ctx,"#311b16",x+s*.62,y+s*.42,3*p,p)}
    else if(type===3||type===7||type===19){rect(ctx,"#ff6d32",x+s*.3,y+s*.7,3*p,p);rect(ctx,"#ffd45a",x+s*.55,y+s*.46,2*p,p)}
    else if(type===10){rect(ctx,"#241d18",x+s*.42,y+s*.4,p,7*p);rect(ctx,"#241d18",x+s*.42,y+s*.58,5*p,p)}
    ctx.globalAlpha=1;
  }
}

function drawFire(ctx,x,y,s,t){
  if(s>=22&&terrainFxAtlas?.complete&&terrainFxAtlas.naturalWidth){
    const phase=Math.floor(t/140)%4,size=s*1.14;drawAtlasCell(ctx,terrainFxAtlas,6+phase,6,x-(size-s)/2,y-(size-s)*.78,size,size);
    if(s>=30){const smokeSize=s*.72,smokePhase=Math.floor(t/260)%2;drawAtlasCell(ctx,terrainFxAtlas,10+smokePhase,6,x+s*.29,y-s*.34,smokeSize,smokeSize,.58)}return;
  }
  const p=Math.max(1,Math.floor(s/12)),phase=Math.floor(t/110)%4,ox=x+Math.floor((s-12*p)/2),oy=y+s-12*p;
  if(s>=20){rect(ctx,"#35393a",ox+(3+phase%2)*p,oy+(1-phase%2)*p,4*p,3*p);rect(ctx,"#596064",ox+(6-phase%3)*p,oy+(phase%2)*p,3*p,2*p);ctx.globalAlpha=.7}
  rect(ctx,"#8e211b",ox+2*p,oy+(5-phase%2)*p,8*p,7*p);rect(ctx,"#e33b29",ox+(phase===1?1:2)*p,oy+(7-phase%3)*p,9*p,5*p);rect(ctx,"#ff822c",ox+4*p,oy+(3+phase%2)*p,5*p,9*p);rect(ctx,"#ffe05a",ox+(phase%2?5:6)*p,oy+(7-phase%2)*p,2*p,4*p);
  if(s>=28){rect(ctx,"#ffb338",ox+(phase*3)%11*p,oy+(2+phase%2)*p,p,p);rect(ctx,"#f04b2f",ox+(10-phase*2)*p,oy+(4-phase%2)*p,p,p)}
  if(s>=34){const q=s/24;rect(ctx,"#fff19a",x+(10+phase%2)*q,y+(16-phase%3)*q,2*q,4*q);rect(ctx,"#ffbd42",x+(7+phase)*q,y+(9+phase%2)*q,2*q,5*q);rect(ctx,"#f2552f",x+(17-phase)*q,y+(12-phase%2)*q,2*q,5*q);rect(ctx,"#ffcf55",x+(4+phase*4)%21*q,y+(5+phase%2)*q,q,q);rect(ctx,"#d73b29",x+(19-phase*3)*q,y+(8-phase%2)*q,q,q);ctx.globalAlpha=.55;rect(ctx,"#889092",x+(9+phase)*q,y+(2-phase%2)*q,3*q,2*q)}ctx.globalAlpha=1;
}

function drawGauge(ctx,cell,px,py,s){
  const def=OBJECTS[cell.type],h=s>=22?3:2,y=py+s-h-1;
  if(def.category===CATEGORY_UTILITY){rect(ctx,"#18343b",px+1,y,s-2,h);rect(ctx,"#9ce7ef",px+1,y,(s-2)*cell.charges/def.charges,h);return}
  const max=def.duration*TICKS_PER_SECOND;
  if(cell.state===BURNING){rect(ctx,"#2b130e",px+1,y,s-2,h);rect(ctx,"#ffd45a",px+1,y,(s-2)*cell.remaining/max,h);return}
  if(cell.state===IDLE&&cell.heat>0){rect(ctx,"#2b130e",px+1,y,s-2,h);rect(ctx,"#f07332",px+1,y,(s-2)*Math.min(1,cell.heat/def.threshold),h);return}
  if(def.category===CATEGORY_COMBUSTIBLE&&cell.state===IDLE&&cell.remaining<max){rect(ctx,"#24343a",px+1,y,s-2,h);rect(ctx,"#83b5c1",px+1,y,(s-2)*cell.remaining/max,h)}
}

function drawIgnitable(ctx,px,py,s,time,hovered=false){
  const pulse=.07+(Math.sin(time/650)+1)*.035;ctx.globalAlpha=hovered?.2:pulse;rect(ctx,"#ffd45a",px+1,py+1,s-2,s-2);ctx.globalAlpha=hovered?.9:.28+(Math.sin(time/650)+1)*.08;ctx.strokeStyle="#ffd45a";ctx.lineWidth=hovered?2:1;ctx.strokeRect(Math.round(px+1.5),Math.round(py+1.5),Math.max(1,Math.round(s-3)),Math.max(1,Math.round(s-3)));ctx.globalAlpha=1;
}

function drawEffects(ctx,effects,layout,time){
  const s=layout.tile;
  for(const effect of effects){
    if(effect.kind==="move")continue;
    const progress=Math.min(1,(time-effect.start)/effect.duration),x=effect.index%effect.width,y=Math.floor(effect.index/effect.width),cx=layout.left+(x+.5)*s,cy=layout.top+(y+.5)*s;
    ctx.globalAlpha=Math.max(0,1-progress);
    if(effect.kind==="burnout"&&polishFxAtlas?.complete&&polishFxAtlas.naturalWidth){
      const foliage=effect.type===0||effect.type===1,wood=effect.type===2||effect.type===9,stone=effect.type===10,metal=[3,4,7,8,18,19,20].includes(effect.type),sprite=foliage?0:wood?1:stone?3:metal?2:effect.type>=13&&effect.type<=17?4:5,size=s*(.82+progress*.78),rise=progress*s*.28;
      drawAtlasCell(ctx,polishFxAtlas,sprite,4,cx-size/2,cy-size/2-rise,size,size,Math.sin(progress*Math.PI)*.86);continue;
    }
    if(terrainFxAtlas?.complete&&terrainFxAtlas.naturalWidth){
      if(effect.kind==="steam"||effect.kind==="powder"||effect.kind==="water"){
        const sprite=effect.kind==="steam"?12:effect.kind==="powder"?13:14,size=s*(1.65+progress*.75);drawAtlasCell(ctx,terrainFxAtlas,sprite,6,cx-size/2,cy-size/2,size,size,Math.max(0,1-progress));continue;
      }
      if(effect.kind==="blast"){
        const sprite=15+Math.min(2,Math.floor(progress*3)),size=s*(1.25+progress*3.8);drawAtlasCell(ctx,terrainFxAtlas,sprite,6,cx-size/2,cy-size/2,size,size,Math.max(0,1-progress*.88));continue;
      }
    }
    if(effect.kind==="steam"){
      for(let i=0;i<11;i++){const side=i%2?1:-1,spread=side*(2+(i%4)*s*.11)*progress,rise=(.15+i%4*.15)*s*progress,size=Math.max(2,s*(.1+(i%3)*.025));rect(ctx,i%3?"#dff9fb":"#ffffff",cx+spread-size/2,cy-rise-size/2,size,size);if(s>=24&&i%2===0)rect(ctx,"#9ed8df",cx+spread-size,cy-rise,size*.55,size*.55)}
    }else if(effect.kind==="powder"){
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])for(let i=1;i<=6;i++){const travel=s*(.08+i*.14)*progress,jitter=((i*7)%5-2)*s*.035;rect(ctx,i%3?"#dffcff":"#87dce7",cx+dx*travel-2+(dy?jitter:0),cy+dy*travel-2+(dx?jitter:0),Math.max(2,s*(.07+(i%2)*.025)),Math.max(2,s*(.07+(i%2)*.025)))}
    }else if(effect.kind==="water"){
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])for(let i=1;i<=7;i++){const travel=s*(.08+i*.14)*progress,wave=Math.sin((i+progress*4)*2)*s*.06;rect(ctx,i%3?"#79d1df":"#d5fbff",cx+dx*travel-2+(dy?wave:0),cy+dy*travel-2+(dx?wave:0),Math.max(2,s*.11),Math.max(2,s*.075));if(i%2===0)rect(ctx,"#287eaa",cx+dx*travel+(dy?wave:0),cy+dy*travel+(dx?wave:0),Math.max(1,s*.045),Math.max(1,s*.045))}
    }else if(effect.kind==="blast"){
      const radius=s*(.25+2.25*progress);ctx.strokeStyle=progress<.45?"#fff0a0":"#e24a2d";ctx.lineWidth=Math.max(2,s*.16*(1-progress));ctx.strokeRect(Math.round(cx-radius),Math.round(cy-radius),Math.round(radius*2),Math.round(radius*2));
      if(progress<.38){ctx.globalAlpha=(1-progress/.38)*.72;rect(ctx,"#fff4b0",cx-s*.42,cy-s*.42,s*.84,s*.84)}ctx.globalAlpha=Math.max(0,1-progress);
      for(let i=0;i<16;i++){const angle=i*Math.PI/8,travel=radius*(.38+(i%4)*.17),size=Math.max(2,s*(i%3? .1:.15));rect(ctx,i%3?"#ff9b2f":"#5b4a3b",cx+Math.cos(angle)*travel-size/2,cy+Math.sin(angle)*travel-size/2,size,size)}
    }
    ctx.globalAlpha=1;
  }
}

function drawGround(ctx,x,y,px,py,s){
  rect(ctx,(x+y)%2?"#1a1812":"#1e1c15",px,py,s,s);rect(ctx,"#2b271b",px+1,py+1,s-2,s-2);
  if(drawAtlasCell(ctx,terrainFxAtlas,(x*17+y*29)%5?1:0,6,px+1,py+1,s-2,s-2,.42))return;
  const p=Math.max(1,Math.floor(s/16)),seed=(x*17+y*29)%11;
  rect(ctx,"#35301f",px+(2+seed%5)*p,py+(3+seed%7)*p,p,p);
  if(s>=24){rect(ctx,"#211f17",px+(11-seed%4)*p,py+(10+seed%3)*p,2*p,p);rect(ctx,"#3b3421",px+(4+seed%3)*p,py+(13-seed%4)*p,p,p)}
}

function drawRoad(ctx,stage,x,y,px,py,s){
  const index=y*stage.width+x,p=Math.max(1,Math.floor(s/16)),isRoad=(xx,yy)=>xx>=0&&yy>=0&&xx<stage.width&&yy<stage.height&&stage.tiles[yy*stage.width+xx]===ROAD;
  rect(ctx,"#383a39",px,py,s,s);rect(ctx,"#555754",px+1,py+1,s-2,s-2);drawAtlasCell(ctx,terrainFxAtlas,(x+y)%2===0?3:2,6,px,py,s,s,.66);
  if(!isRoad(x,y-1))rect(ctx,"#7a7669",px,py,s,2*p);
  if(!isRoad(x,y+1))rect(ctx,"#2f302f",px,py+s-2*p,s,2*p);
  if(!isRoad(x-1,y))rect(ctx,"#6a685f",px,py,2*p,s);
  if(!isRoad(x+1,y))rect(ctx,"#303230",px+s-2*p,py,2*p,s);
  if((x+y)%2===0)rect(ctx,"#d0b75d",px+7*p,py+7*p,2*p,2*p);
  else if(s>=24)rect(ctx,"#666760",px+4*p,py+10*p,p,p);
  return index;
}

function makeLayer(){
  if(typeof OffscreenCanvas!=="undefined")return new OffscreenCanvas(VIEW_W,VIEW_H);
  if(typeof document!=="undefined"){const canvas=document.createElement("canvas");canvas.width=VIEW_W;canvas.height=VIEW_H;return canvas}
  return null;
}

function drawTerrain(ctx,stage,layout){
  const s=layout.tile;rect(ctx,"#0e0d0a",0,0,VIEW_W,VIEW_H);rect(ctx,"#241d15",layout.left-4,layout.top-4,layout.width+8,layout.height+8);
  for(let y=0;y<stage.height;y++)for(let x=0;x<stage.width;x++){
    const px=layout.left+x*s,py=layout.top+y*s;if(px+s<0||py+s<0||px>VIEW_W||py>VIEW_H)continue;
    const index=y*stage.width+x;if(stage.tiles[index]===ROAD)drawRoad(ctx,stage,x,y,px,py,s);else drawGround(ctx,x,y,px,py,s);
  }
}

function terrainLayer(stage,layout){
  const atlasReady=terrainFxAtlas?.naturalWidth||0,key=`${layout.tile}:${Math.round(layout.left*10)}:${Math.round(layout.top*10)}:${atlasReady}`;
  if(terrainCache.stage===stage&&terrainCache.key===key&&terrainCache.canvas)return terrainCache.canvas;
  if(!terrainCache.canvas){terrainCache.canvas=makeLayer();terrainCache.ctx=terrainCache.canvas?.getContext("2d",{alpha:false})||null;if(terrainCache.ctx)terrainCache.ctx.imageSmoothingEnabled=false}
  if(!terrainCache.ctx)return null;terrainCache.stage=stage;terrainCache.key=key;terrainCache.ctx.clearRect(0,0,VIEW_W,VIEW_H);drawTerrain(terrainCache.ctx,stage,layout);return terrainCache.canvas;
}

function drawHeatLinks(ctx,sim,layout,time){
  const {stage}=sim,s=layout.tile,entities=sim.entities||[],entityAt=new Map(entities.filter(entity=>!entity.removed).map(entity=>[entity.index,entity]));
  const sources=[];for(const cell of sim.cells)if(cell.state===BURNING&&OBJECTS[cell.type]?.heat>0)sources.push(cell);for(const entity of entities)if(!entity.removed&&entity.state===BURNING&&OBJECTS[entity.type]?.heat>0)sources.push(entity);
  if(!sources.length)return;const dirs=[[1,0],[-1,0],[0,1],[0,-1]];ctx.save();ctx.globalCompositeOperation="lighter";
  for(const source of sources){
    const sx=source.index%stage.width,sy=Math.floor(source.index/stage.width),heat=OBJECTS[source.type].heat;
    for(const [dx,dy] of dirs){
      const tx=sx+dx,ty=sy+dy;if(tx<0||ty<0||tx>=stage.width||ty>=stage.height)continue;const index=ty*stage.width+tx,cell=sim.cells[index],entity=entityAt.get(index),target=entity&&!entity.removed?entity:cell,def=target?.type>=0?OBJECTS[target.type]:null;
      if(!def||target.state!==IDLE||(def.category!==CATEGORY_COMBUSTIBLE&&def.category!=="meltable"&&def.category!=="actor"&&def.category!=="enemy"))continue;
      const ratio=Math.min(1,heat/Math.max(10,def.threshold)),phase=(time/520+source.index*.137+index*.071)%1,cx=layout.left+(sx+.5)*s,cy=layout.top+(sy+.5)*s,ex=layout.left+(tx+.5)*s,ey=layout.top+(ty+.5)*s;
      ctx.globalAlpha=.12+ratio*.2;ctx.strokeStyle=ratio>.7?"#ffd45a":"#e66a32";ctx.lineWidth=Math.max(1,s/32);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.stroke();
      for(let particle=0;particle<(s>=28?2:1);particle++){const p=(phase+particle*.47)%1,size=Math.max(1,s*(.035+ratio*.02));rect(ctx,particle?"#ff8a32":"#fff0a0",cx+(ex-cx)*p-size/2,cy+(ey-cy)*p-size/2,size,size)}
    }
  }
  ctx.restore();
}

function activeMove(effects,entity,time){
  for(let i=effects.length-1;i>=0;i--){const effect=effects[i];if(effect.kind!=="move"||effect.entityId!==entity.id)continue;const progress=Math.min(1,Math.max(0,(time-effect.start)/effect.duration));return {...effect,progress,eased:1-(1-progress)*(1-progress)}}return null;
}

export function render(ctx,sim,camera,time=performance.now(),hover=-1,effects=[],ignitableIndices=[]){
  const {stage}=sim,layout=boardLayout(stage,camera),s=layout.tile,ignitable=ignitableIndices instanceof Set?ignitableIndices:new Set(ignitableIndices);ctx.clearRect(0,0,VIEW_W,VIEW_H);
  const cachedTerrain=terrainLayer(stage,layout);if(cachedTerrain)ctx.drawImage(cachedTerrain,0,0);else drawTerrain(ctx,stage,layout);
  for(let y=0;y<stage.height;y++)for(let x=0;x<stage.width;x++){
    const px=layout.left+x*s,py=layout.top+y*s;if(px+s<0||py+s<0||px>VIEW_W||py>VIEW_H)continue;
    const index=y*stage.width+x,cell=sim.cells[index];
    if(cell.type===ROAD)continue;
    if(cell.type===EMPTY||cell.state===REMOVED)continue;
    drawStatefulObject(ctx,cell,cell.type,px,py,s,time+index*37);if(cell.state===BURNING)drawFire(ctx,px,py,s,time+index*37);drawGauge(ctx,cell,px,py,s);if(ignitable.has(index))drawIgnitable(ctx,px,py,s,time,index===hover);
  }
  const entityFrames=(sim.entities||[]).filter(entity=>!entity.removed).map(entity=>{const move=activeMove(effects,entity,time),from=move?.from??entity.index,to=move?.index??entity.index,fromX=from%stage.width,fromY=Math.floor(from/stage.width),toX=to%stage.width,toY=Math.floor(to/stage.width),progress=move?.eased??1,x=fromX+(toX-fromX)*progress,y=fromY+(toY-fromY)*progress;return {entity,move,toX,fromX,x,y,px:layout.left+x*s,py:layout.top+y*s}}).sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const frame of entityFrames){
    const {entity,move,toX,fromX,px,py}=frame;if(px+s<0||py+s<0||px>VIEW_W||py>VIEW_H)continue;
    const direction=Math.sign(toX-fromX)||entity.facing||1;drawStatefulObject(ctx,entity,entity.type,px,py,s,time+entity.id*53,move?.progress??0,direction);if(entity.state===BURNING){const upper=s*.8;drawFire(ctx,px+(s-upper)/2,py-s*.43,upper,time+entity.id*53+61);drawFire(ctx,px,py,s,time+entity.id*53)}drawGauge(ctx,entity,px,py,s);if(ignitable.has(entity.index))drawIgnitable(ctx,px,py,s,time,entity.index===hover);
    if(move&&polishFxAtlas?.naturalWidth&&s>=22){const dustSize=s*.58,alpha=Math.sin(move.progress*Math.PI)*.46;drawAtlasCell(ctx,polishFxAtlas,6,4,px+s*.5-dustSize*.5,py+s*.67,dustSize,dustSize,alpha)}
  }
  drawHeatLinks(ctx,sim,layout,time);
  drawEffects(ctx,effects,layout,time);
  return layout;
}

export function renderObjectPreview(ctx,type,time=performance.now()){
  ctx.clearRect(0,0,64,64);rect(ctx,"#191812",0,0,64,64);rect(ctx,"#29251a",2,2,60,60);if(type>=13&&type<=17){ctx.save();ctx.translate(32,64);if(!drawTallActor(ctx,type,40,false,true)){ctx.restore();drawObject(ctx,type,0,0,64,false,time)}else ctx.restore()}else if(type>=0)drawObject(ctx,type,0,0,64,false,time);return time;
}

export function hitTest(stage,camera,clientX,clientY,rectBox){
  const cx=(clientX-rectBox.left)*VIEW_W/rectBox.width,cy=(clientY-rectBox.top)*VIEW_H/rectBox.height,layout=boardLayout(stage,camera);
  const x=Math.floor((cx-layout.left)/layout.tile),y=Math.floor((cy-layout.top)/layout.tile);
  if(x<0||y<0||x>=stage.width||y>=stage.height)return -1;return y*stage.width+x;
}

export function displayedTileSize(camera,rectBox){return rectBox.width>0?camera.tile*rectBox.width/VIEW_W:0}

export function nearestCell(stage,camera,clientX,clientY,rectBox,indices,maxDistanceCss=24){
  if(!rectBox.width)return -1;const point=canvasPoint(clientX,clientY,rectBox),layout=boardLayout(stage,camera),maxDistance=maxDistanceCss*VIEW_W/rectBox.width;let result=-1,best=maxDistance*maxDistance;
  for(const index of indices){const x=index%stage.width,y=Math.floor(index/stage.width),cx=layout.left+(x+.5)*layout.tile,cy=layout.top+(y+.5)*layout.tile,distance=(point.x-cx)**2+(point.y-cy)**2;if(distance<=best){best=distance;result=index}}
  return result;
}

export function canvasPoint(clientX,clientY,rectBox){return {x:(clientX-rectBox.left)*VIEW_W/rectBox.width,y:(clientY-rectBox.top)*VIEW_H/rectBox.height}}
