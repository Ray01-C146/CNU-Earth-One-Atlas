export const VIEW_IDS = ['Home','World','Codex','Story','Gallery','Theater','Archive','Workshop'];
export function validateContent(value) {
  function text(v, max, name, required = false) {
    if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error(`Invalid ${name}.`);
    return v;
  }
  if (!value || typeof value !== 'object' || value.version !== 1) throw new Error('Unsupported content version.');
  const result = { version: 1, brand: text(value.brand, 40, 'site name', true), news: text(value.news, 2000, 'news'), colors: {}, views: {}, events: [] };
  for (const name of ['blue','bright']) {
    if (!/^#[0-9a-f]{6}$/i.test(value.colors?.[name] || '')) throw new Error('Colors must use six-digit hex values.');
    result.colors[name] = value.colors[name];
  }
  for (const id of VIEW_IDS) {
    const view = value.views?.[id];
    result.views[id] = { label: text(view?.label, 40, 'navigation label', true), title: text(view?.title, 200, 'section title', true), description: text(view?.description, 20000, 'section description') };
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 1000) throw new Error('Use between 1 and 1000 events.');
  const ids = new Set();
  result.events = value.events.map(event => {
    if (!Number.isSafeInteger(event.id) || event.id < 1 || ids.has(event.id)) throw new Error('Each event needs a unique positive integer ID.');
    ids.add(event.id);
    return { id: event.id, title: text(event.title, 200, 'event title', true), description: text(event.description, 20000, 'event description') };
  });
  return result;
}
