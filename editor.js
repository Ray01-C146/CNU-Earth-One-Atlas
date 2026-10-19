(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = value => JSON.parse(JSON.stringify(value));
  const defaults = JSON.parse($('atlas-default-content').textContent);
  const views = Object.keys(defaults.views);
  const dialog = $('editor-dialog');
  const form = $('editor-form');
  // Keep the original draft key so drafts from the earlier editor remain available.
  const draftKey = 'cnu-atlas-editor-draft-v1:' + location.pathname;
  let published = copy(defaults), working = copy(defaults);
  let viewId = 'Archive', eventId = working.events[0].id;
  let busy = false, canExport = false, edited = false;
  function status(message) { $('editor-status').textContent = message; }
  function validate(value) {
    if (value?.version !== 1 || typeof value.brand !== 'string' || !value.brand.trim() || value.brand.length > 40 || typeof value.news !== 'string' || value.news.length > 2000) throw Error('Invalid site content.');
    for (const key of ['blue','bright']) if (!/^#[0-9a-f]{6}$/i.test(value.colors?.[key] || '')) throw Error('Invalid colors.');
    for (const id of views) {
      const v = value.views?.[id];
      if (!v || typeof v.label !== 'string' || !v.label.trim() || v.label.length > 40 || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200 || typeof v.description !== 'string' || v.description.length > 20000) throw Error('Invalid section content.');
    }
    if (!Array.isArray(value.events) || !value.events.length || value.events.length > 1000) throw Error('Use between 1 and 1000 events.');
    const ids = new Set();
    for (const e of value.events) {
      if (!Number.isSafeInteger(e.id) || e.id < 1 || ids.has(e.id) || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200 || typeof e.description !== 'string' || e.description.length > 20000) throw Error('Invalid event content.');
      ids.add(e.id);
    }
    return value;
  }
  function apply(data) {
    validate(data);
    window.atlasContent = copy(data);
    document.querySelector('.brand').textContent = data.brand;
    document.querySelector('.brand').setAttribute('aria-label', data.brand);
    document.title = data.brand;
    document.querySelector('.news-text').textContent = data.news;
    for (const key of ['blue','bright']) document.documentElement.style.setProperty('--' + key, data.colors[key]);
    document.querySelectorAll('[data-view]').forEach(button => { button.textContent = data.views[button.dataset.view].label; });
    const selected = document.querySelector('[data-view][aria-current="page"]')?.dataset.view || 'Archive';
    $('view-title').textContent = data.views[selected].title;
    $('view-description').textContent = data.views[selected].description;
    window.atlasReplaceEvents(copy(data.events));
  }
  function option(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
  function fillView() {
    const v = working.views[viewId];
    $('edit-label').value = v.label; $('edit-heading').value = v.title; $('edit-description').value = v.description;
  }
  function saveView() {
    const v = working.views[viewId];
    v.label = $('edit-label').value; v.title = $('edit-heading').value; v.description = $('edit-description').value;
  }
  function fillEvent() {
    const e = working.events.find(e => e.id === eventId);
    $('edit-event-title').value = e.title; $('edit-event-description').value = e.description;
  }
  function saveEvent() {
    const e = working.events.find(e => e.id === eventId);
    e.title = $('edit-event-title').value; e.description = $('edit-event-description').value;
  }
  function fill() {
    $('edit-brand').value = working.brand; $('edit-news').value = working.news;
    $('edit-blue').value = working.colors.blue; $('edit-bright').value = working.colors.bright;
    $('edit-view').replaceChildren(...views.map(id => option(id, working.views[id].label)));
    $('edit-view').value = viewId; fillView();
    if (!working.events.some(e => e.id === eventId)) eventId = working.events[0].id;
    $('edit-event').replaceChildren(...working.events.map(e => option(e.id, `${e.id}. ${e.title}`)));
    $('edit-event').value = eventId; fillEvent();
  }
  function collect() {
    saveView(); saveEvent(); working.brand = $('edit-brand').value; working.news = $('edit-news').value;
    working.colors.blue = $('edit-blue').value; working.colors.bright = $('edit-bright').value;
    return copy(validate(working));
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    dialog.querySelectorAll('button,input,textarea,select').forEach(e => e.disabled = true);
    try { await task(); } catch (e) { status(e.message); }
    finally { busy = false; dialog.querySelectorAll('button,input,textarea,select').forEach(e => e.disabled = false); }
  }
  async function loadPublished() {
    const response = await fetch(new URL('site-content.json', document.baseURI), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Published content could not be loaded. Check that site-content.json is beside index.html.');
    return validate(await response.json());
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function saveDraft(data) {
    localStorage.setItem(draftKey, JSON.stringify({ data, baseContent: published, savedAt: new Date().toISOString() }));
  }
  form.addEventListener('input', () => { edited = true; });
  $('editor-open').onclick = async () => {
    dialog.showModal();
    await run(async () => {
      await ready;
      status(canExport ? 'Editor ready. Changes stay in this browser until you upload an exported file to GitHub.' : 'Published content could not be loaded. Reload it or load a saved draft before exporting.');
    });
  };
  $('editor-close').onclick = () => dialog.close();
  $('edit-view').onchange = () => { saveView(); viewId = $('edit-view').value; fillView(); };
  $('edit-event').onchange = () => { saveEvent(); eventId = Number($('edit-event').value); fillEvent(); };
  form.onsubmit = event => {
    event.preventDefault();
    run(async () => { apply(collect()); status('Preview applied in this browser. Close the editor to inspect it. Nothing has been published.'); });
  };
  $('editor-draft-save').onclick = () => {
    if (!form.reportValidity()) return;
    run(async () => { saveDraft(collect()); edited = false; status('Draft saved in this browser. It has not been published.'); });
  };
  $('editor-draft-load').onclick = () => run(async () => {
    const raw = localStorage.getItem(draftKey); if (!raw) throw Error('No saved draft in this browser.');
    const draft = JSON.parse(raw); validate(draft.data);
    const changed = !draft.baseContent || JSON.stringify(draft.baseContent) !== JSON.stringify(published);
    if (!confirm(changed ? 'This draft may be older than the published content. Loading it will replace your editor fields. Continue?' : 'Replace your editor fields with the saved draft?')) return;
    working = copy(draft.data); canExport = true; edited = false; fill(); apply(working);
    status('Draft loaded. Review it before exporting; it has not changed the public site.');
  });
  $('editor-draft-export').onclick = () => run(async () => {
    const raw = localStorage.getItem(draftKey); if (!raw) throw Error('Save a draft first.');
    const draft = JSON.parse(raw); validate(draft.data); download(draft, 'atlas-draft.json');
    status('Saved draft exported as atlas-draft.json. This is a backup; use Export site-content.json for the publishable file.');
  });
  $('editor-export').onclick = () => {
    if (!form.reportValidity()) return;
    run(async () => {
      if (!canExport) throw Error('Reload published content or load a saved draft first, so sample content does not replace your public content accidentally.');
      const data = collect(); apply(data); download(data, 'site-content.json');
      let saved = true; try { saveDraft(data); edited = false; } catch { saved = false; }
      status('Exported site-content.json. Upload it to your GitHub repository root, replacing the existing file, and commit the change.' + (saved ? ' A browser draft was also saved.' : ' The browser draft could not be saved.'));
    });
  };
  $('editor-reload').onclick = () => run(async () => {
    if (!confirm('Discard the current editor fields and load published content? Saved browser drafts will remain.')) return;
    const data = await loadPublished(); published = copy(data); working = copy(data); canExport = true; edited = false; fill(); apply(data);
    status('Published content reloaded.');
  });
  addEventListener('beforeunload', event => { if (edited) { event.preventDefault(); event.returnValue = ''; } });
  apply(defaults); fill();
  const ready = loadPublished().then(data => {
    published = copy(data); canExport = true;
    if (!edited) { working = copy(data); fill(); apply(data); }
  }).catch(() => { canExport = false; });
})();
