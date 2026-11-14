import {fixtureCard,fixtureType} from './typed-fixture.mjs';
import {storedSessionActorId} from './session-actor.mjs';

// Set up real pointer input and content-options rules, then exercise a NEW
// Pointer card's rendered content slot. Fixture writes are not UI evidence.
export async function newPointerInput(ctx,widget){
 if(!['radio','multiselect'].includes(widget))throw Error('Invalid pointer widget');
 const {page,stack,database,creds,created}=ctx,db=database();
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('Pointer fixture requires loopback');
 if(storedSessionActorId(db,await page.context().cookies(stack.origin))!==creds.admin.id)throw Error('Pointer fixture requires its administrator');
 const prefix='HarnessNewPointer'+widget+Date.now(),right=prefix+'Choice',optionType=prefix+'OptionType',parent=prefix+'Parent',name=parent+'+'+right;
 const options=[prefix+'One',prefix+'Two'];
 const seed=async(name,type,content='')=>{
  const expected=fixtureType(db,type);created.push(name);
  const response=await page.context().request.post(stack.origin+'/card/create',{headers:{origin:stack.origin,'Content-Type':'application/x-www-form-urlencoded'},data:new URLSearchParams({'card[name]':name,'card[type_id]':String(expected.id),'card[content]':content}).toString(),maxRedirects:0});
  const stored=fixtureCard(db,name);if(response.status()>=400||stored?.type_id!==expected.id)throw Error('Pointer fixture refused '+name+' HTTP '+response.status());
 };
 await seed(right,'RichText');await seed(parent,'RichText');await seed(optionType,'Cardtype');
 for(const option of options)await seed(option,optionType);
 const input=db.prepare("SELECT name FROM cards WHERE codename='input_type' AND trash=0").get();
 const contentOptions=db.prepare("SELECT name FROM cards WHERE codename='content_options' AND trash=0").get();
 if(!input?.name||!contentOptions?.name)throw Error('Canonical pointer settings are unavailable');
 await seed(right+'+*right+'+input.name,'Phrase',widget);
 await seed(right+'+*right+'+contentOptions.name,'Search',JSON.stringify({type:optionType,sort:'name'}));
 const pointer=fixtureType(db,'Pointer');created.push(name);
 const opened=await page.goto(stack.origin+'/new/'+encodeURIComponent(pointer.name)+'?'+new URLSearchParams({'card[name]':name}),{waitUntil:'load'});
 const form=page.locator('form[action="/card/create"]').filter({has:page.locator('.create-submit-button')}).first();
 await form.waitFor({state:'visible',timeout:20000});
 const selected=widget==='radio'?[options[1]]:options;
 let inventory;
 if(widget==='radio'){
  const radios=form.locator('input[type=radio]');inventory=await radios.evaluateAll(items=>items.map(item=>({name:item.name,value:item.value})));
  if(!inventory.some(item=>item.value===selected[0])){
   const raw=ctx.captureEvidence(await page.content(),{check:'new-pointer-radio-missing',name});
   throw Error('Expected radio option absent: '+JSON.stringify({inventory,selected,raw}));
  }
  await form.locator('input[type=radio][value="'+selected[0]+'"]').check();
 }else{
  const field=form.locator('select[multiple]').first();
  if(!await field.count()){
   const raw=ctx.captureEvidence(await page.content(),{check:'new-pointer-multiselect-missing',name});
   throw Error('New Pointer multiselect absent: '+JSON.stringify({raw,fields:await form.locator('input,select,textarea').evaluateAll(items=>items.map(item=>({tag:item.tagName,name:item.name,type:item.type,value:item.value})))}));
  }
  inventory=await field.locator('option').evaluateAll(items=>items.map(item=>({value:item.value,text:item.textContent})));
  if(await field.isVisible())await field.selectOption(selected);
  else{
   const container=field.locator('xpath=following-sibling::span[contains(@class,"select2-container")]').first();
   for(const label of selected){
    if(!await page.locator('.select2-container--open .select2-results').count())await container.locator('.select2-selection').click();
    const search=page.locator('.select2-container--open input.select2-search__field:visible');if(await search.count())await search.last().fill(label);
    await page.locator('.select2-container--open .select2-results__option').filter({hasText:new RegExp('^\\s*'+label+'\\s*$')}).last().click();
   }
  }
 }
 const pending=page.waitForResponse(response=>new URL(response.url()).origin===stack.origin&&new URL(response.url()).pathname==='/card/create'&&response.request().method()==='POST',{timeout:30000}).then(response=>({response}),error=>({error}));
 await form.locator('.create-submit-button').click();const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
 const stored=fixtureCard(db,name),fresh=await page.goto(stack.origin+'/'+encodeURIComponent(name),{waitUntil:'load'}),text=await page.locator('#main').innerText();
 return {pass:opened.status()===200&&seen.response.status()<400&&stored?.type_id===pointer.id&&selected.every(option=>stored.db_content.includes(option)&&text.includes(option)),evidence:{actor:'admin',widget,name,cardtype:pointer.name,inventory,selected,openedStatus:opened.status(),submitStatus:seen.response.status(),storedTypeId:stored?.type_id,storedContent:stored?.db_content,freshStatus:fresh.status(),mainShowsChoices:selected.every(option=>text.includes(option)),raw:ctx.captureEvidence(await page.content(),{check:'new-pointer-'+widget,name})}};
}
