import {relative,resolve,dirname,sep,isAbsolute} from 'node:path';
import {lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// Active captures must not dirty the checkout whose source custody they prove.
// Export finished reports into tracked documentation only after capture closes.
export function assertOperationalCaptureOutput(repo,output){
  const root=resolve(repo),target=resolve(output),inside=relative(root,target);
  if(isAbsolute(inside)||inside==='..'||inside.startsWith('..'+sep))return target;
  const top=inside.split(sep)[0];
  if(top!=='.runtime'&&top!=='tmp')throw Error('active capture outputs must use ignored .runtime/ or tmp/ paths, or a directory outside the source checkout; export docs/runs reports after completion');
  for(let current=dirname(target);relative(root,current)!=='';current=dirname(current)){
    try{if(lstatSync(current).isSymbolicLink())throw Error('capture output must not pass through a filesystem link');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const ignored=spawnSync('git',['-C',root,'check-ignore','--quiet','--no-index','--',inside],{encoding:'utf8',windowsHide:true});
  if(ignored.error||ignored.status!==0)throw Error('capture output is not Git-ignored; preserve the source-custody boundary');
  return target;
}
