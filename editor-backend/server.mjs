import http from 'node:http';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validateContent } from './content.mjs';
const derive = promisify(scrypt);
const LIMIT = 512 * 1024;
const WINDOW = 15 * 60 * 1000;
const SESSION_LIFE = 2 * 60 * 60 * 1000;
const error = (status, message) => Object.assign(new Error(message), {status});
const tokenHash = value => createHash('sha256').update(value).digest('hex');
export function createEditorServer(config, fetcher = fetch) {
  const { passwordHash, githubToken, allowedOrigin, branch = 'main' } = config;
  const [salt, hash, extra] = (passwordHash || '').split(':');
  if (!/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(hash || '') || extra !== undefined) throw new Error('Set a valid EDITOR_PASSWORD_HASH using npm run password.');
  const origin = new URL(allowedOrigin);
  if (origin.origin !== allowedOrigin || !['https:','http:'].includes(origin.protocol) || (origin.protocol === 'http:' && !['localhost','127.0.0.1'].includes(origin.hostname))) throw new Error('ALLOWED_ORIGIN must be an HTTPS origin (or localhost for testing), without a trailing slash.');
  if (!githubToken) throw new Error('Set GITHUB_TOKEN on the backend host.');
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..')) throw new Error('Invalid branch.');
  const expected = Buffer.from(hash, 'hex');
  const sessions = new Map();
  const attempts = new Map();
  let globalAttempts = {start:Date.now(), count:0};
  let publishing = false;
  const api = 'https://api.github.com/repos/Ray01-C146/CNU-Earth-One-Atlas/contents/site-content.json';
  async function github(method, body) {
    let response;
    try {
      response = await fetcher(api + (method === 'GET' ? `?ref=${encodeURIComponent(branch)}` : ''), {
        method, signal: AbortSignal.timeout(20000),
        headers: {Authorization:`Bearer ${githubToken}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2026-03-10', 'User-Agent':'CNU-Atlas-Editor', ...(body ? {'Content-Type':'application/json'} : {})},
        ...(body ? {body:JSON.stringify(body)} : {})
      });
    } catch { throw error(502, 'GitHub could not be reached. Check the repository before retrying a publish.'); }
    if (response.status === 404 && method === 'GET') return null;
    if ([409,422].includes(response.status)) throw error(409, 'GitHub rejected this update. Reload the latest content, then reapply your changes.');
    if (!response.ok) throw error(502, 'GitHub rejected the request. Check the backend token, repository permissions, and branch protection.');
    return response.json();
  }
  async function readContent() {
    const result = await github('GET');
    if (!result) return {data:null, sha:null};
    try {
      if (result.type !== 'file' || result.encoding !== 'base64' || !/^[a-f0-9]{40}$/.test(result.sha)) throw new Error();
      return {data:validateContent(JSON.parse(Buffer.from(result.content,'base64').toString('utf8'))),sha:result.sha};
    } catch { throw error(502, 'The repository content file has an invalid format.'); }
  }
  function authenticate(req) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
    const key = match && tokenHash(match[1]);
    const session = key && sessions.get(key);
    if (!session || session.expires <= Date.now()) { if (key) sessions.delete(key); throw error(401, 'Sign in to edit.'); }
    return key;
  }
  async function readBody(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw error(415,'JSON is required.');
    let bytes = 0; const chunks = [];
    for await (const chunk of req) { bytes += chunk.length; if (bytes > LIMIT) throw error(413,'The request is too large.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error(400,'Invalid JSON.'); }
  }
  const server = http.createServer(async (req, res) => {
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',Vary:'Origin'};
    const reply = (status, data) => { res.writeHead(status,headers);res.end(JSON.stringify(data)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/health' && req.method === 'GET') return reply(200,{ok:true});
      if (req.headers.origin !== allowedOrigin) throw error(403,'This website is not allowed to use the editor.');
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
      if (req.method === 'OPTIONS') {
        headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
        headers['Access-Control-Allow-Headers']='Authorization, Content-Type';
        return reply(204,{});
      }
      const now = Date.now();
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      for (const [key, value] of attempts) if (value.start + WINDOW <= now) attempts.delete(key);
      if (path === '/login' && req.method === 'POST') {
        // Use the socket IP rather than trusting spoofable X-Forwarded-For.
        // A host-level rate limiter is recommended for multi-instance deployment.
        const ip = req.socket.remoteAddress || 'unknown';
        const bucket = attempts.get(ip) || {start:now,count:0};
        if (globalAttempts.start + WINDOW <= now) globalAttempts = {start:now,count:0};
        if (bucket.count >= 5 || globalAttempts.count >= 50 || (attempts.size >= 1000 && !attempts.has(ip))) throw error(429,'Too many sign-in attempts. Wait 15 minutes.');
        bucket.count++; globalAttempts.count++; attempts.set(ip,bucket);
        const body = await readBody(req);
        if (typeof body.password !== 'string' || body.password.length > 1024) throw error(400,'Invalid password input.');
        const actual = await derive(body.password,salt,64);
        if (!timingSafeEqual(expected,actual)) throw error(401,'Incorrect password.');
        if (sessions.size >= 100) throw error(429,'Too many active sessions. Try again later.');
        const token = randomBytes(32).toString('hex');
        sessions.set(tokenHash(token),{expires:now+SESSION_LIFE});
        return reply(200,{token,expires:now+SESSION_LIFE});
      }
      const sessionKey = authenticate(req);
      if (path === '/session' && req.method === 'GET') return reply(200,{expires:sessions.get(sessionKey).expires});
      if (path === '/logout' && req.method === 'POST') { sessions.delete(sessionKey);return reply(200,{ok:true}); }
      if (path === '/content' && req.method === 'GET') return reply(200,await readContent());
      if (path === '/publish' && req.method === 'POST') {
        const body = await readBody(req);
        let data; try { data = validateContent(body.data); } catch (e) {throw error(400,e.message);}
        if (body.sha !== null && !/^[a-f0-9]{40}$/.test(body.sha || '')) throw error(400,'A valid content revision is required.');
        if (publishing) throw error(409,'Another publish is in progress. Try again when it finishes.');
        publishing = true;
        try {
          const current = await readContent();
          if (body.sha !== current.sha) throw error(409,'The repository changed since you opened the editor. Save a draft, reload the latest content, then reapply your changes.');
          const content = JSON.stringify(data,null,2)+'\n';
          if (Buffer.byteLength(content) > LIMIT) throw error(413,'The content file is too large.');
          const result = await github('PUT',{message:'Update Atlas content from website editor',branch,content:Buffer.from(content).toString('base64'),...(current.sha?{sha:current.sha}:{})});
          return reply(200,{sha:result.content.sha,commitUrl:result.commit.html_url});
        } finally { publishing = false; }
      }
      throw error(404,'Editor endpoint not found.');
    } catch(e) {reply(e.status || 500,{error:e.status?e.message:'The editor server could not complete the request.'});}
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createEditorServer({passwordHash:process.env.EDITOR_PASSWORD_HASH,githubToken:process.env.GITHUB_TOKEN,allowedOrigin:process.env.ALLOWED_ORIGIN,branch:process.env.GITHUB_BRANCH || 'main'});
    server.listen(Number(process.env.PORT || 8001),'0.0.0.0',()=>console.log('Atlas editor backend is listening.'));
  } catch(e) { console.error(e.message);process.exit(1); }
}
