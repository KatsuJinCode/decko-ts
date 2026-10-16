import {matchingRichEditor} from './rich-editor.mjs';

const codes={basic:'basic',richtext:'basic',cardtype:'cardtype',pointer:'pointer',list:'list',phrase:'phrase',plaintext:'plain_text',search:'search_type',layout:'layout_type',html:'html',date:'date',number:'number',file:'file',image:'image'};

// New-schema junction rows can have both name and key NULL. Their identity
// is the pair of component IDs, not an absent denormalized name string.
export function fixtureCard(database,name){
 const direct=database.prepare('SELECT id,name,type_id,trash,db_content FROM cards WHERE name=? AND trash=0').get(name);
 if(direct)return direct;
 const joint=name.lastIndexOf('+');
 if(joint<1||joint===name.length-1)return undefined;
 const left=fixtureCard(database,name.slice(0,joint)),right=fixtureCard(database,name.slice(joint+1));
 if(!left||!right)return undefined;
 return database.prepare('SELECT id,name,type_id,trash,db_content FROM cards WHERE left_id=? AND right_id=? AND trash=0').get(left.id,right.id);
}

// Fixture labels denote the canonical types, even when a migrated deck has
// renamed them. In this deck, codename basic is RichText; the ordinary card
// named basic is not a cardtype and must never become a fallback fixture type.
export function fixtureType(database,label){
 const code=codes[label.toLowerCase()];
 const row=database.prepare(code?'SELECT id,name,type_id FROM cards WHERE codename=? AND trash=0':'SELECT id,name,type_id FROM cards WHERE name=? AND trash=0').get(code??label);
 const cardtype=database.prepare("SELECT id FROM cards WHERE codename='cardtype' AND trash=0").get();
 if(!row||!cardtype||row.type_id!==cardtype.id)throw Error('requested fixture cardtype is unavailable: '+label);
 return row;
}

export async function createTypedFixture(ctx,{name,content='',type='RichText',assignEmpty=false}){
 const {page,stack,database}=ctx,expected=fixtureType(database(),type);
 const params=new URLSearchParams({'card[name]':name});
 const assigned=content!==null&&content!==undefined&&(content!==''||assignEmpty);
 if(assigned)params.set('card[content]',content);
 const opened=await page.goto(stack.origin+'/new/'+encodeURIComponent(expected.name)+'?'+params,{waitUntil:'domcontentloaded',timeout:60000});
 if(opened.status()>=400)throw Error('typed fixture form refused: '+opened.status());
 const form=page.locator('form.card-form').filter({has:page.locator('input[name="card[name]"]')}).filter({has:page.locator('.create-submit-button')}).first();
 const action=new URL(await form.getAttribute('action'),stack.origin);
 if(action.origin!==stack.origin||action.pathname!=='/card/create')throw Error('typed fixture form is not the local create action');
 const nameField=form.locator('input[name="card[name]"]').first();
 if(await nameField.inputValue()!==name){if(await nameField.isVisible())await nameField.fill(name);else throw Error('hidden fixture name is wrong')}
 const assignedType=Number(await form.locator('[name="card[type_id]"]').first().inputValue());
 if(assignedType!==expected.id)throw Error('create form assigned the wrong fixture type: '+assignedType+' instead of '+expected.id);
 if(assigned){
  const field=form.locator('[name="card[content]"]').first();
  if(await field.count()===0)throw Error('typed fixture has no root content field');
  const isTiny=await field.evaluate(el=>el.classList.contains('tinymce-textarea'));
  if(isTiny){
   const id=await field.getAttribute('id');if(!id)throw Error('fixture editor has no identity');
   await page.waitForFunction(matchingRichEditor,[id,false],{timeout:20000});
   await page.evaluate(([id,text])=>{const editor=window.tinymce.get(id);editor.setContent(text);editor.save()},[id,content]);
  }else if(await field.isVisible())await field.fill(content);
  else if(await field.inputValue()!==content)throw Error('hidden fixture content did not preserve the supplied value');
 }
 const pending=page.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname===action.pathname&&r.request().method()==='POST',{timeout:60000}).then(response=>({response}),error=>({error}));
 await form.locator('.create-submit-button').click();
 const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
 const outcome=await seen.response.json().catch(()=>null);
 if(typeof outcome?.redirect==='string'){
  const redirect=new URL(outcome.redirect,stack.origin);
  if(redirect.origin!==stack.origin)throw Error('fixture create redirect left the local origin');
  await page.waitForURL(redirect.href,{waitUntil:'domcontentloaded',timeout:60000});
 }
 const stored=fixtureCard(database(),name);
 if(seen.response.status()>=400||!stored||stored.type_id!==expected.id){
  const html=await page.content().catch(()=>null);
  const raw=html===null?null:ctx.captureEvidence?.(html,{check:'typed-fixture-create',name,expectedTypeId:expected.id,stored:stored??null,status:seen.response.status()});
  throw Error('typed fixture was not created as requested: '+name+'; HTTP '+seen.response.status()+'; expected type '+expected.id+'; stored '+JSON.stringify(stored??null)+'; raw '+JSON.stringify(raw??null));
 }
 return{status:seen.response.status(),id:stored.id,storedTypeId:stored.type_id,storedType:expected.name};
}
