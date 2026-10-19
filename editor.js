(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = value => JSON.parse(JSON.stringify(value));
  const defaults = JSON.parse($('atlas-default-content').textContent);
  const views = Object.keys(defaults.views);
  const dialog = $('editor-dialog');
  const form = $('editor-form');
  const draftKey = 'cnu-atlas-editor-draft-v1:' + location.pathname;
  const configured = document.querySelector('meta[name="atlas-editor-api"]').content.trim().replace(/\/$/,'');
  let api = '';
  if (configured) {
    const url = new URL(configured,location.href);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) api = url.href.replace(/\/$/,'');
  }
  let published = copy(defaults), working = copy(defaults);
  let token = '', expires = 0, expiryTimer, sha = null, busy = false;
  let viewId = 'Archive', eventId = working.events[0].id;
  function status(message) { $('editor-status').textContent = message; }
  function validate(value) {
    if (value?.version !== 1 || typeof value.brand !== 'string' || !value.brand.trim() || value.brand.length > 40 || typeof value.news !== 'string' || value.news.length > 2000) throw Error('Invalid site content.');
    if (!/^#[0-9a-f]{6}$/i.test(value.colors?.blue || '') || !/^#[0-9a-f]{6}$/i.test(value.colors?.bright || '')) throw Error('Invalid colors.');
    for (const id of views) { const v = value.views?.[id]; if (!v || typeof v.label !== 'string' || !v.label.trim() || v.label.length > 40 || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200 || typeof v.description !== 'string' || v.description.length > 20000) throw Error('Invalid section.'); }
    if (!Array.isArray(value.events) || !value.events.length || value.events.length > 1000) throw Error('Invalid events.');
    const ids = new Set();
    for (const e of value.events) { if (!Number.isSafeInteger(e.id) || e.id < 1 || ids.has(e.id) || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200 || typeof e.description !== 'string' || e.description.length > 20000) throw Error('Invalid event.'); ids.add(e.id); }
    return value;
  }
  function apply(data) {
    validate(data);
    window.atlasContent = copy(data);
    document.querySelector('.brand').textContent = data.brand;
    document.querySelector('.brand').setAttribute('aria-label',data.brand);
    document.title = data.brand;
    document.querySelector('.news-text').textContent = data.news;
    for (const [key,value] of Object.entries(data.colors)) if (['blue','bright'].includes(key)) document.documentElement.style.setProperty('--'+key,value);
    document.querySelectorAll('[data-view]').forEach(button => { button.textContent = data.views[button.dataset.view].label; });
    const selected = document.querySelector('[data-view][aria-current="page"]')?.dataset.view || 'Archive';
    $('view-title').textContent = data.views[selected].title;
    $('view-description').textContent = data.views[selected].description;
    window.atlasReplaceEvents(copy(data.events));
  }
  function lock(message = 'Editor locked.') {
    token = ''; expires = 0; clearTimeout(expiryTimer); sha = null;
    $('editor-password').value = '';
    form.hidden = true; $('editor-login').hidden = false;
    apply(published); status(message);
  }
  function requireSession() {
    if (!token || Date.now() >= expires) { lock('Your session expired. Sign in again.'); throw Error('Sign in again.'); }
  }
  async function request(path,body) {
    if (!api) throw Error('The editor backend is not connected yet. Configure its URL in index.html after deploying it.');
    if (path !== '/login') requireSession();
    let response;
    try {response = await fetch(api+path,{method:body === undefined?'GET':'POST',headers:{...(body === undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body === undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(30000)});}
    catch {throw Error('Could not reach the editor backend. If publishing timed out, check GitHub before retrying.');}
    let result;try {result=await response.json();}catch {throw Error('The backend returned an invalid response.');}
    if (!response.ok) { if (response.status === 401 && path !== '/login') lock('Session expired. Sign in again.'); throw Error(result.error || 'The request failed.'); }
    return result;
  }
  async function run(task) {
    if (busy) return;
    busy=true;dialog.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=true);
    try {await task();} catch(e) {status(e.message);} finally {busy=false;dialog.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=false);}
  }
  function fillView() { const v=working.views[viewId];$('edit-label').value=v.label;$('edit-heading').value=v.title;$('edit-description').value=v.description; }
  function saveView() {const v=working.views[viewId];v.label=$('edit-label').value;v.title=$('edit-heading').value;v.description=$('edit-description').value;}
  function fillEvent() {const e=working.events.find(e=>e.id===eventId);$('edit-event-title').value=e.title;$('edit-event-description').value=e.description;}
  function saveEvent() {const e=working.events.find(e=>e.id===eventId);e.title=$('edit-event-title').value;e.description=$('edit-event-description').value;}
  function collect() {
    requireSession();saveView();saveEvent();working.brand=$('edit-brand').value;working.news=$('edit-news').value;working.colors.blue=$('edit-blue').value;working.colors.bright=$('edit-bright').value;validate(working);return copy(working);
  }
  function option(value,label) {const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
  function fill() {
    $('edit-brand').value=working.brand;$('edit-news').value=working.news;$('edit-blue').value=working.colors.blue;$('edit-bright').value=working.colors.bright;
    $('edit-view').replaceChildren(...views.map(id=>option(id,working.views[id].label)));$('edit-view').value=viewId;fillView();
    if (!working.events.some(e=>e.id===eventId)) eventId=working.events[0].id;
    $('edit-event').replaceChildren(...working.events.map(e=>option(e.id,`${e.id}. ${e.title}`)));$('edit-event').value=eventId;fillEvent();
  }
  $('editor-open').onclick=()=>{dialog.showModal();if(!token){status(api?'Enter your editor password.':'The editor backend is not connected yet. The page remains publicly viewable.');$('editor-password').focus();}};
  $('editor-close').onclick=()=>dialog.close();
  $('editor-login').onsubmit=event=>{event.preventDefault();run(async()=>{
    const password=$('editor-password').value;$('editor-password').value='';status('Signing in…');await ready;
    const login=await request('/login',{password});token=login.token;expires=login.expires;
    try {
      const latest=await request('/content');published=copy(validate(latest.data || defaults));working=copy(published);sha=latest.sha;
      form.hidden=false;$('editor-login').hidden=true;fill();apply(published);
      clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>lock('Your session expired. Sign in again.'),Math.max(0,expires-Date.now()));
      status('Editor unlocked. Changes stay private until you publish.');
    } catch(e) {try {await request('/logout',{});}catch{}lock(e.message);}
  });};
  $('edit-view').onchange=()=>{saveView();viewId=$('edit-view').value;fillView();};
  $('edit-event').onchange=()=>{saveEvent();eventId=Number($('edit-event').value);fillEvent();};
  form.onsubmit=event=>{event.preventDefault();run(async()=>{const data=collect();apply(data);status('Preview applied. Close this panel to inspect the page. Nothing has been published.');});};
  $('editor-draft-save').onclick=()=>run(async()=>{const data=collect();localStorage.setItem(draftKey,JSON.stringify({data,sha,savedAt:new Date().toISOString()}));status('Draft saved in this browser. It has not been published.');});
  $('editor-draft-load').onclick=()=>run(async()=>{
    requireSession();const raw=localStorage.getItem(draftKey);if(!raw)throw Error('No saved draft in this browser.');
    const draft=JSON.parse(raw);validate(draft.data);
    if(draft.sha!==sha)throw Error('This draft is based on an older GitHub revision. It was not loaded. Copy out any changes you need from the browser draft before clearing it.');
    if(!confirm('Replace the current editor fields with your saved draft?'))return;
    working=copy(draft.data);fill();apply(working);status('Draft loaded. Publish when ready.');
  });
  $('editor-draft-export').onclick=()=>run(async()=>{
    requireSession();const raw=localStorage.getItem(draftKey);if(!raw)throw Error('Save a draft first.');
    const draft=JSON.parse(raw);validate(draft.data);
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='atlas-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Saved browser draft exported as atlas-draft.json.');
  });
  $('editor-publish').onclick=()=>{if(!form.reportValidity())return;return run(async()=>{
    const data=collect();localStorage.setItem(draftKey,JSON.stringify({data,sha,savedAt:new Date().toISOString()}));
    if(!confirm('Commit these content changes to the main branch of Ray01-C146/CNU-Earth-One-Atlas?'))return;
    status('Publishing to GitHub…');const result=await request('/publish',{data,sha});sha=result.sha;published=copy(data);working=copy(data);apply(data);
    // Keep the draft, rebased to the revision that was just saved.
    let draftSaved=true;try {localStorage.setItem(draftKey,JSON.stringify({data,sha,savedAt:new Date().toISOString()}));}catch {draftSaved=false;}
    status('Committed to GitHub. GitHub Pages may take a few minutes to update.'+(draftSaved?'':' The local draft could not be updated.'));
    if(typeof result.commitUrl==='string' && result.commitUrl.startsWith('https://github.com/Ray01-C146/CNU-Earth-One-Atlas/commit/')) {const a=document.createElement('a');a.href=result.commitUrl;a.textContent=' View commit';a.target='_blank';a.rel='noopener noreferrer';$('editor-status').append(a);}
  });};
  $('editor-reload').onclick=()=>run(async()=>{requireSession();if(!confirm('Discard the unsaved fields and load the latest GitHub content? Your saved browser draft will remain.'))return;const latest=await request('/content');published=copy(validate(latest.data || defaults));working=copy(published);sha=latest.sha;fill();apply(published);status('Latest GitHub content loaded.');});
  $('editor-logout').onclick=()=>run(async()=>{await request('/logout',{});lock();});
  addEventListener('beforeunload',()=>{token='';});
  // Static visitors read the public content file. Never load browser drafts automatically.
  apply(defaults);
  const ready=fetch(new URL('site-content.json',document.baseURI),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{published=copy(validate(data));if(!token)apply(published);}).catch(()=>{});

})();
