import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),rootOption=process.argv.indexOf("--root");
const root=rootOption>=0&&process.argv[rootOption+1]?path.resolve(projectRoot,process.argv[rootOption+1]):projectRoot;
if(root!==projectRoot&&!root.startsWith(`${projectRoot}${path.sep}`))throw new Error("Server root must stay inside the project");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json"};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const requested=pathname==="/"?"index.html":pathname.slice(1);
  const file=path.resolve(root,requested);
  if((file!==root&&!file.startsWith(`${root}${path.sep}`))||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end("Not found");return}
  res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
  fs.createReadStream(file).pipe(res);
});
const port=Number(process.env.PORT||4173);
server.listen(port,"127.0.0.1",()=>console.log(`Local URL: http://127.0.0.1:${port}`));
