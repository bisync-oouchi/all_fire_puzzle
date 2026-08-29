import fs from "node:fs";
import {generateStages} from "./stage-factory.mjs";

const fixtures=JSON.parse(fs.readFileSync(new URL("curated-burn-stages.json",import.meta.url),"utf8"));
const stages=generateStages(fixtures);
const body=`// Generated file. Only the 200 adopted stages are included.\nexport const STAGES=${JSON.stringify(stages)};\n`;
fs.writeFileSync(new URL("../src/stages.js",import.meta.url),body);
const counts=stages.reduce((a,s)=>(a[s.difficulty]=(a[s.difficulty]||0)+1,a),{});
console.log(`Generated ${stages.length} stages`,counts);
