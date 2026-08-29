import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,"dist");
const moduleIds=[
  "src/storage.js","src/definitions.js","src/stages.js","src/rescue-stages.js","src/simulation.js","src/rescue-simulation.js",
  "src/render.js","src/audio.js","tools/stage-factory.mjs","tools/rescue-stage-factory.mjs","src/app.js"
];

function resolveImport(moduleId,specifier){
  return path.posix.normalize(path.posix.join(path.posix.dirname(moduleId),specifier));
}

function compileModule(moduleId){
  let source=fs.readFileSync(path.join(root,...moduleId.split("/")),"utf8");
  source=source.replace(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,(_,names,specifier)=>`const {${names}}=require(${JSON.stringify(resolveImport(moduleId,specifier))});`);
  const exports=[];
  source=source.replace(/\bexport\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g,(_,kind,name)=>{exports.push(name);return `${kind} ${name}`});
  if(/^\s*(import|export)\s/m.test(source))throw new Error(`Unsupported module syntax in ${moduleId}`);
  return `factories[${JSON.stringify(moduleId)}]=require=>{\n"use strict";\n${source}\nreturn {${exports.join(",")}};\n};\n`;
}

let bundle="(()=>{\n\"use strict\";\nconst factories=Object.create(null),cache=Object.create(null);\n";
for(const moduleId of moduleIds)bundle+=compileModule(moduleId);
bundle+='const require=id=>cache[id]||(cache[id]=factories[id](require));\nrequire("src/app.js");\n})();\n';

fs.writeFileSync(path.join(root,"game.js"),bundle);
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const file of ["index.html","styles.css","game.js"])fs.copyFileSync(path.join(root,file),path.join(out,file));
fs.mkdirSync(path.join(out,"assets"),{recursive:true});
for(const file of ["sfc-object-atlas-64-v2.png","sfc-terrain-fx-atlas.png","sfc-polish-fx-atlas.png","princess-lod-28.png","princess-lod-64.png","sfc-actor-atlas-tall.png","sfc-actor-atlas-tall-lod.png","FIRE_title_b.jpg","fire_title_bgm.wav"])fs.copyFileSync(path.join(root,"assets",file),path.join(out,"assets",file));

const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
if(!/<script\s+src=["']game\.js["']><\/script>/.test(index)||/type=["']module["']/.test(index))throw new Error("index.html must load game.js as a classic script");
if(/(^|\n)\s*(import|export)\s/m.test(bundle))throw new Error("game.js must not contain module syntax");

let bytes=0;for(const dirent of fs.readdirSync(out,{recursive:true,withFileTypes:true}))if(dirent.isFile())bytes+=fs.statSync(path.join(dirent.parentPath,dirent.name)).size;
const limit=2_000_000;
console.log(`Build size: ${(bytes/1_000_000).toFixed(3)} MB / 2.000 MB (${(bytes/1024).toFixed(1)} KiB)`);
if(bytes>limit)throw new Error("Build exceeds 2 MB");
if(fs.readdirSync(out,{recursive:true}).some(file=>String(file).endsWith(".mjs")))throw new Error("Production build must not contain .mjs files");
