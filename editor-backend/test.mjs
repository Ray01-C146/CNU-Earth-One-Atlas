import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createEditorServer} from './server.mjs';
import {validateContent} from './content.mjs';
const data=JSON.parse(readFileSync(new URL('../site-content.json',import.meta.url)));
const password='local-test-password-only';
const salt='0123456789abcdef0123456789abcdef';
const config={passwordHash:salt+':'+scryptSync(password,salt,64).toString('hex'),githubToken:'test-only-token',allowedOrigin:'https://ray01-c146.github.io',branch:'main'};
async function setup(t,fetcher) {
 const server=createEditorServer(config,fetcher);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,{method='GET',body,token,origin=config.allowedOrigin}={})=>{
  const response=await fetch(base+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:response.status===204?null:await response.json(),headers:response.headers};
 };
 const login=async()=>{const r=await req('/login',{method:'POST',body:{password}});assert.equal(r.status,200);return r.body.token;};
 return {req,login};
}
test('content validator rejects malformed colors, duplicate IDs and script-shaped settings',()=>{
 assert.deepEqual(validateContent(data),data);
 for (const mutate of [d=>d.colors.blue='url(javascript:x)',d=>d.events[1].id=d.events[0].id,d=>d.views.Home.title='',d=>d.events=[]]) {const value=structuredClone(data);mutate(value);assert.throws(()=>validateContent(value));}
});
test('unauthenticated writes, wrong origins and wrong passwords are rejected; logout revokes token',async t=>{
 let calls=0;const {req,login}=await setup(t,async()=>{calls++;throw Error('Unexpected GitHub call');});
 assert.equal((await req('/publish',{method:'POST',body:{data,sha:null}})).status,401);
 assert.equal((await req('/login',{method:'POST',body:{password},origin:'https://other.example'})).status,403);
 assert.equal((await req('/login',{method:'POST',body:{password:'wrong'}})).status,401);
 const token=await login();assert.equal((await req('/session',{token})).status,200);
 assert.equal((await req('/session',{token:'0'.repeat(64)})).status,401);
 assert.equal((await req('/logout',{method:'POST',body:{},token})).status,200);
 assert.equal((await req('/session',{token})).status,401);assert.equal(calls,0);
});
test('sixth password attempt is rate limited',async t=>{const {req}=await setup(t);for(let i=0;i<5;i++)assert.equal((await req('/login',{method:'POST',body:{password:'wrong'}})).status,401);assert.equal((await req('/login',{method:'POST',body:{password}})).status,429);});
test('publish uses fixed repository path, current SHA, branch and server credential; stale updates fail',async t=>{
 let current=structuredClone(data),sha='a'.repeat(40),writes=0;
 const {req,login}=await setup(t,async(url,options)=>{
  assert.ok(url.startsWith('https://api.github.com/repos/Ray01-C146/CNU-Earth-One-Atlas/contents/site-content.json'));
  assert.equal(options.headers.Authorization,'Bearer test-only-token');
  if(options.method==='GET')return Response.json({type:'file',encoding:'base64',sha,content:Buffer.from(JSON.stringify(current)).toString('base64')});
  writes++;const body=JSON.parse(options.body);assert.equal(body.sha,sha);assert.equal(body.branch,'main');current=JSON.parse(Buffer.from(body.content,'base64').toString());sha='b'.repeat(40);return Response.json({content:{sha},commit:{html_url:'https://github.com/Ray01-C146/CNU-Earth-One-Atlas/commit/test'}});
 });
 const token=await login();assert.equal((await req('/content',{token})).body.sha,sha);
 const changed={...data,brand:'CNU Atlas'};
 assert.equal((await req('/publish',{method:'POST',token,body:{sha:'c'.repeat(40),data:changed}})).status,409);assert.equal(writes,0);
 const result=await req('/publish',{method:'POST',token,body:{sha,data:changed}});assert.equal(result.status,200);assert.equal(current.brand,'CNU Atlas');assert.equal(writes,1);
 assert.equal((await req('/publish',{method:'POST',token,body:{sha:'a'.repeat(40),data:changed}})).status,409);
});
test('first publish creates missing content; GitHub conflict never reports success',async t=>{
 let exists=false;
 const {req,login}=await setup(t,async(url,options)=>{if(options.method==='GET')return exists?Response.json({type:'file',encoding:'base64',sha:'a'.repeat(40),content:Buffer.from(JSON.stringify(data)).toString('base64')}):new Response('',{status:404});exists=true;return new Response('',{status:409});});
 const token=await login();assert.equal((await req('/content',{token})).body.sha,null);assert.equal((await req('/publish',{method:'POST',token,body:{sha:null,data}})).status,409);
});
test('session expires after two hours',async t=>{const {req,login}=await setup(t);const token=await login();const original=Date.now;try{Date.now=()=>original()+3*60*60*1000;assert.equal((await req('/session',{token})).status,401);}finally{Date.now=original;}});
