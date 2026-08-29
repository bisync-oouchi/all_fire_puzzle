import fs from "node:fs";
import {generateRescueStages} from "./rescue-stage-factory.mjs";

const stages=generateRescueStages(),body=`// Generated file. Only 200 validated rescue stages are included.\nexport const RESCUE_STAGES=${JSON.stringify(stages)};\n`;
fs.writeFileSync(new URL("../src/rescue-stages.js",import.meta.url),body);
console.log(`Generated ${stages.length} rescue stages`);
