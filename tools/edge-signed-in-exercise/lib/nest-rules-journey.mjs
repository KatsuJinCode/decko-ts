import {createTypedFixture,fixtureCard,fixtureType} from './typed-fixture.mjs';
import {focusRichEditor} from './rich-editor.mjs';
import {storedSessionActorId} from './session-actor.mjs';

export async function nestRulesJourney(ctx){
 const {page,stack,database,creds,created}=ctx,db=database();
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('Nest-rules fixture requires loopback');
 if(storedSessionActorId(db,await page.context().cookies(stack.origin))!==creds.admin.id)throw Error('Nest-rules fixture requires its administrator');
 const stamp=Date.now(),host='HarnessE7Host'+stamp,field='HarnessE7Field'+stamp,marker='Harness nest help '+stamp;
 const type=fixtureType(db,'RichText'),tpr=db.prepare("SELECT id,name FROM cards WHERE codename='type_plus_right' AND trash=0").get(),help=db.prepare("SELECT id,name FROM cards WHERE codename='help' AND trash=0").get(),setType=db.prepare("SELECT id FROM cards WHERE codename='set' AND trash=0").get();
 if(!tpr?.name||!help?.name||!setType)throw Error('Canonical nest-rule settings are unavailable');
 const setName=type.name+'+'+field+'+'+tpr.name,ruleName=setName+'+'+help.name;
 created.push(host,field,type.name+'+'+field,setName,ruleName);
 await createTypedFixture(ctx,{name:field,type:'RichText',content:'Owned nest field tag'});
 await createTypedFixture(ctx,{name:host,type:'RichText',content:'Before nest rules'});
 await page.goto(stack.origin+'/'+host,{waitUntil:'load'});
 await page.locator('#main a.edit-link[href$="/edit"]').first().dispatchEvent('click');
 const id=await focusRichEditor(page),input=page.locator('textarea[id="'+id+'"]');
 const toolbar=input.locator('..').locator('.tox-tinymce');
 await toolbar.getByRole('button',{name:'Insert/edit nest',exact:true}).click();
 const dialog=page.locator('.modal.show').filter({has:page.locator('input._nest-name')}).last();
 const openingContext=await dialog.locator('input._nest-name').evaluate(field=>({leftName:field.getAttribute('data-left-name'),leftType:field.getAttribute('data-left-type')}));
 await dialog.locator('input._nest-name').fill(field);
 await dialog.getByRole('tab',{name:'rules',exact:true}).click();
 const form=dialog.locator('form[action$="+*help"]').last();
 try{await form.waitFor({state:'visible',timeout:20000})}catch(error){
  const raw=ctx.captureEvidence(await page.content(),{check:'nest-rules-form-missing',host,field});
  throw Error('Nest rules help form unavailable: '+JSON.stringify({raw,forms:await dialog.locator('form').evaluateAll(forms=>forms.map(form=>({action:form.action,fields:[...form.querySelectorAll('input,textarea')].map(field=>({name:field.name,type:field.type,value:field.value}))})))}));
 }
 const action=new URL(await form.getAttribute('action'),stack.origin);
 if(action.origin!==stack.origin||!action.pathname.startsWith('/update/'))throw Error('Nest-rule update left the owned origin');
 const pending=page.waitForResponse(response=>new URL(response.url()).origin===stack.origin&&new URL(response.url()).pathname===action.pathname&&response.request().method()==='POST',{timeout:30000}).then(response=>({response}),error=>({error}));
 const content=form.locator('input[name="card[content]"]').first();
 await content.fill(marker);await content.press('End');await content.press('Tab');
 const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
 const stored=fixtureCard(db,ruleName),set=fixtureCard(db,setName);
 const fresh=await page.goto(stack.origin+'/'+encodeURIComponent(ruleName)+'?view=core',{waitUntil:'load'}),text=await page.locator('#main').innerText();
 return {pass:seen.response.status()<400&&stored?.db_content===marker&&set?.type_id===setType.id&&fresh.status()===200&&text.includes(marker),evidence:{actor:'admin',host,field,editorId:id,ruleName,setName,openingContext,hostStoredTypeId:fixtureCard(db,host)?.type_id,dialogRequests:stack.host.requests.filter(row=>/modal_nest_editor|nest_rules/.test(row.path)).map(({method,path,status})=>({method,path,status})),matchingStoredRows:db.prepare('SELECT id,left_id,right_id,type_id,db_content FROM cards WHERE db_content=? AND trash=0').all(marker),formAction:action.pathname,submitStatus:seen.response.status(),storedRuleId:stored?.id,storedContent:stored?.db_content,setTypeId:set?.type_id,expectedSetTypeId:setType.id,freshStatus:fresh.status(),freshShowsHelp:text.includes(marker),raw:ctx.captureEvidence(await page.content(),{check:'nest-rules-native-save',ruleName})}};
}
