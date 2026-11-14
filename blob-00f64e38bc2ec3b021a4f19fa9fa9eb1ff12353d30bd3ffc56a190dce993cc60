import {createTypedFixture} from './typed-fixture.mjs';
import {focusRichEditor} from './rich-editor.mjs';
import {storedSessionActorId} from './session-actor.mjs';

async function fixtureEditor(ctx,label){
 const actorId=storedSessionActorId(ctx.database(),await ctx.page.context().cookies(ctx.stack.origin));
 if(actorId!==ctx.creds.admin.id)throw Error('dialog journey does not have the expected admin actor');
 const name=ctx.cardName(label);ctx.created.push(name);
 await createTypedFixture(ctx,{name,type:'RichText'});
 await ctx.visit('/'+encodeURIComponent(name));
 await ctx.page.locator('#main a.edit-link[href$="/edit"]').first().dispatchEvent('click');
 const form=ctx.page.locator('.modal.show form.card-form[id^="edit_card"]:visible').first();
 await form.waitFor({state:'visible',timeout:20000});
 const id=await focusRichEditor(ctx.page);
 const toolbar=ctx.page.locator(`textarea[id="${id}"]`).locator('..').locator('.tox-tinymce');
 if(await toolbar.count()!==1||!await toolbar.evaluate((el,id)=>el===window.tinymce.get(id).editorContainer,id))throw Error('the matching field does not identify exactly one owned toolbar');
 await toolbar.waitFor({state:'visible'});
 return {name,form,id,toolbar,actorId};
}

async function saveEditor(ctx,form){
 const action=new URL(await form.getAttribute('action'),ctx.stack.origin);
 if(action.origin!==ctx.stack.origin||!action.pathname.startsWith('/update/'))throw Error('editor save is not the owned local update form');
 const pending=ctx.page.waitForResponse(r=>new URL(r.url()).origin===ctx.stack.origin&&new URL(r.url()).pathname===action.pathname&&r.request().method()==='POST',{timeout:60000}).then(response=>({response}),error=>({error}));
 await form.locator('.submit-button').first().click();
 const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
 return seen.response.status();
}

async function applyWire(page,button,id){
 const actualId=await button.getAttribute('data-tinymce-id');
 const resolves=await page.evaluate(id=>Boolean(window.tinymce?.get(id)?.initialized),actualId);
 if(actualId!==id||!resolves)throw Error('dialog Apply does not identify the editor that opened it: '+JSON.stringify({expected:id,actual:actualId,resolves}));
 return {expected:id,actual:actualId,resolves};
}

async function select2Choice(page,field,label,term){
 const control=field.locator('xpath=following-sibling::span[contains(@class,"select2-container")]').first();
 await control.locator('.select2-selection').click();
 if(term!==undefined)await page.locator('.select2-container--open input.select2-search__field:visible').last().fill(term);
 const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 await page.locator('.select2-container--open .select2-results__option').filter({hasText:new RegExp('^\\s*'+escaped+'\\s*$')}).last().click();
}

export async function linkDialogJourney(ctx){
 const {page,stack,record,database}=ctx,editor=await fixtureEditor(ctx,'linkbtn');
 await editor.toolbar.getByRole('button',{name:'Insert/edit link',exact:true}).click();
 const dialog=page.locator('.modal.show').filter({has:page.locator('button._link-apply')}).last();
 await dialog.locator('input[name="link_name"]').waitFor({state:'visible'});
 await dialog.locator('input._link-field-toggle').uncheck();
 const label='Harness Home Link '+editor.name;
 await dialog.locator('input[name="link_name"]').fill('Home');
 await dialog.locator('input[name="link_title"]').fill(label);
 await page.waitForFunction(label=>{const value=document.querySelector('input._link-preview')?.value??'';return value.includes('Home')&&value.includes(label)},label,{timeout:10000});
 const preview=await dialog.locator('input._link-preview').inputValue();
 const apply=dialog.locator('button._link-apply'),wire=await applyWire(page,apply,editor.id);
 await apply.click();await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(([id,text])=>(window.tinymce?.get(id)?.getContent?.()??'').includes(text),[editor.id,preview],{timeout:10000});
 const saveStatus=await saveEditor(ctx,editor.form);
 const stored=database().prepare('SELECT db_content FROM cards WHERE name=? AND trash=0').get(editor.name)?.db_content??'';
 const fresh=await ctx.visit('/'+encodeURIComponent(editor.name));
 const link=page.locator('#main').getByRole('link',{name:label,exact:true});
 const count=await link.count(),href=count===1?await link.getAttribute('href'):null;
 const renderedLink=href!==null&&new URL(href,stack.origin).pathname==='/Home';
 record("E6 the editor's link button inserts a reference that renders as a link",saveStatus<400&&stored.includes(preview)&&fresh.status===200&&renderedLink,{actor:'admin',actorId:editor.actorId,wire,preview,saveStatus,storedHasSnippet:stored.includes(preview),freshStatus:fresh.status,renderedLink,href});
}

export async function imageDialogJourney(ctx){
 const {page,record,database}=ctx;
 const image=database().prepare("SELECT c.id,c.name FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.codename='logo' AND t.codename='image' AND c.trash=0 AND length(c.db_content)>0").get();
 if(!image?.name)throw Error('the upstream image-picker logo fixture is unavailable');
 const editor=await fixtureEditor(ctx,'imgbtn');
 await editor.toolbar.getByRole('menuitem',{name:'Insert',exact:true}).click();
 // TinyMCE renders menu items in a portal after the menu opens.
 await page.getByRole('menuitem',{name:'Image...',exact:true}).click();
 const dialog=page.locator('.modal.show').filter({has:page.locator('.modal_nest_image-view')}).last();
 await dialog.getByRole('tab',{name:'select',exact:true}).click();
 const field=dialog.locator('select._image-card-select');
 await select2Choice(page,field,image.name,image.name.slice(0,4));
 if(await field.inputValue()!==image.name)throw Error('the visible image picker did not select the expected image');
 await dialog.getByRole('tab',{name:'options',exact:true}).click();
 await select2Choice(page,dialog.locator('select._image-view-select'),'titled');
 await select2Choice(page,dialog.locator('select._image-size-select'),'small');
 const hasSnippet=(value,name)=>value.includes(name)&&value.includes('{{')&&/view:\s*titled/.test(value)&&/size:\s*small/.test(value);
 await page.waitForFunction(name=>{const value=document.querySelector('input._nest-preview')?.value??'';return value.includes(name)&&/view:\s*titled/.test(value)&&/size:\s*small/.test(value)},image.name,{timeout:10000});
 const preview=await dialog.locator('input._nest-preview').inputValue();
 const apply=dialog.getByRole('button',{name:'Apply and Close',exact:true}),wire=await applyWire(page,apply,editor.id);
 await apply.click();await dialog.waitFor({state:'hidden'});
 const inserted=await page.evaluate(id=>window.tinymce.get(id).getContent(),editor.id);
 const saveStatus=await saveEditor(ctx,editor.form);
 const stored=database().prepare('SELECT db_content FROM cards WHERE name=? AND trash=0').get(editor.name)?.db_content??'';
 const fresh=await ctx.visit('/'+encodeURIComponent(editor.name));
 const rendered=page.locator(`#main .card-slot[data-card-id="${image.id}"] img`).first();
 const present=await rendered.count()>0,src=present?await rendered.getAttribute('src'):null;
 const decoded=present&&await rendered.evaluate(img=>img.complete&&img.naturalWidth>0);
 record('E8 the nest image editor inserts a nest with view and size options',hasSnippet(inserted,image.name)&&saveStatus<400&&hasSnippet(stored,image.name)&&fresh.status===200&&decoded,{actor:'admin',actorId:editor.actorId,image,wire,preview,insertedHasSnippet:hasSnippet(inserted,image.name),saveStatus,storedHasSnippet:hasSnippet(stored,image.name),freshStatus:fresh.status,src,decoded});
}

export async function nestDialogJourney(ctx){
 const {page,stack,record,database}=ctx;
 const actorId=storedSessionActorId(database(),await page.context().cookies(stack.origin));
 if(actorId!==ctx.creds.admin.id)throw Error('nest journey does not have the expected admin actor');
 const source=ctx.cardName('NestSource'),targetName=ctx.cardName('NestTarget'),target=source+'+'+targetName;
 const before='before the nest',body='Harness nested body '+target;
 ctx.created.push(source,target);
 await createTypedFixture(ctx,{name:source,type:'RichText',content:before});
 await createTypedFixture(ctx,{name:target,type:'PlainText',content:body});
 await ctx.visit('/'+encodeURIComponent(source));
 await page.locator('#main a.edit-link[href$="/edit"]').first().dispatchEvent('click');
 const id=await focusRichEditor(page),field=page.locator(`textarea[id="${id}"]`);
 const form=field.locator('xpath=ancestor::form[1]'),toolbar=field.locator('..').locator('.tox-tinymce');
 if(await toolbar.count()!==1||!await toolbar.evaluate((el,id)=>el===window.tinymce.get(id).editorContainer,id))throw Error('nest toolbar does not belong to the matching editor');
 await toolbar.getByRole('button',{name:'Insert/edit nest',exact:true}).click();
 const dialog=page.locator('.modal.show').filter({has:page.locator('input._nest-name')}).last();
 await dialog.locator('input._nest-name').fill(targetName);
 await page.waitForFunction(name=>(document.querySelector('input._nest-preview')?.value??'').includes(name),targetName,{timeout:10000});
 const preview=await dialog.locator('input._nest-preview').inputValue();
 const apply=dialog.locator('button._nest-apply'),wire=await applyWire(page,apply,id);
 await apply.click();await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(([id,text])=>(window.tinymce?.get(id)?.getContent?.()??'').includes(text),[id,preview],{timeout:10000});
 const inserted=await page.evaluate(id=>window.tinymce.get(id).getContent(),id);
 record('Nest Apply inserts the preview into the opening editor',inserted.includes(preview)&&inserted.includes(before),{actor:'admin',actorId,wire,preview,originalPreserved:inserted.includes(before)});
 const saveStatus=await saveEditor(ctx,form);
 const stored=database().prepare('SELECT db_content FROM cards WHERE name=? AND trash=0').get(source)?.db_content??'';
 const fresh=await ctx.visit('/'+encodeURIComponent(source));
 record('the inserted nest persists after Save and a fresh GET',saveStatus<400&&stored.includes(preview)&&stored.includes(before)&&fresh.status===200&&fresh.html.includes(body)&&fresh.html.includes(before),{actor:'admin',actorId,saveStatus,storedHasSnippet:stored.includes(preview),originalPreserved:stored.includes(before),freshStatus:fresh.status,nestedBody:fresh.html.includes(body)});
}
