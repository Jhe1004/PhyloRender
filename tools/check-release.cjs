const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const problems=[];
const nonempty=value=>typeof value==="string"&&value.trim().length>0;
function localEvidence(name) {
  if(!nonempty(name)||path.isAbsolute(name))return false;
  try {
    const target=fs.realpathSync(path.resolve(root,name));
    const relative=path.relative(fs.realpathSync(root),target);
    return relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)
      &&fs.statSync(target).isFile()&&nonempty(fs.readFileSync(target,"utf8"));
  }catch{return false;}
}
try {
  const policy=JSON.parse(fs.readFileSync(path.join(root,"docs/RELEASE_STATUS.json"),"utf8"));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"mcp-server/package.json"),"utf8"));
  if(policy.release_status!=="approved")problems.push("release_status is not approved");
  if(!nonempty(policy.project_license)||policy.project_license!==pkg.license)problems.push("project/package license records are missing or inconsistent");
  if(!nonempty(policy.phyparts_redistribution_permission))problems.push("third-party method/redistribution record is missing");
  if(!localEvidence(policy.approval_evidence))problems.push("approval_evidence must name a nonempty repository file");
  for(const name of ["LICENSE","THIRD_PARTY_NOTICES.md"])if(!localEvidence(name))problems.push(`${name} is missing or empty`);
  const skillDir=path.join(root,"skills/phylorender-mcp");
  if(fs.existsSync(skillDir)){
    const scanSkill=dir=>{
      for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
        const full=path.join(dir,entry.name);
        if(entry.isDirectory())scanSkill(full);
        else if(entry.name!=="local-config.json"&&entry.name!=="local_service.test.mjs"&&/\.(md|mjs|js|json)$/i.test(entry.name)){
          const text=fs.readFileSync(full,"utf8");
          if(/\/Users\/|jianhe|Jian He|nyat\.app|frp-boy\.com/i.test(text)){
            problems.push(`skill file contains personal path or private endpoint: ${path.relative(root,full)}`);
          }
        }
      }
    };
    scanSkill(skillDir);
  }
}catch(error){problems.push(`release records could not be read: ${error.message}`);}
if(problems.length) {
  console.error("RELEASE_BLOCKED: "+problems.join("; "));
  process.exitCode=1;
}else console.log("Release permission records are present. Verify their substance and the final distribution before deployment.");
