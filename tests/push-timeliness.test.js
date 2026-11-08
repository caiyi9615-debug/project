'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createPush,payload}=require('../push');
const ENV_KEYS=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','PUSH_JOIN_CODE','PUSH_CRON_SECRET'];
const SECRET='test-cron-secret',UPSTREAM_SECRET='test-upstream-private-details';
const BASE=Date.parse('2026-11-08T04:00:00Z'),iso=time=>new Date(time).toISOString();
function configure(t,{full=true}={}){
 const previous=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]]));
 for(const key of ENV_KEYS){if(full)process.env[key]='test-value-'+key;else delete process.env[key];}
 process.env.PUSH_CRON_SECRET=SECRET;
 t.after(()=>{for(const key of ENV_KEYS)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];});
}
function job(overrides={}){
 return {id:'job-one',task_id:'task-one',title:'实验报告',due_at:iso(BASE+60*60000),due_local:'2026-11-08T13:00',scheduled_at:iso(BASE-20*60000),minutes:60,...overrides};
}
function fixture(rows=[job()]){
 const model={time:BASE,rows:structuredClone(rows),calls:[],messages:[],claimErrors:0,deliveryErrors:0,finishErrors:0,sendErrors:0,generation:0};
 const db=async(name,args)=>{
  model.calls.push({name,args:structuredClone(args)});
  if(name==='dh_push_claim'){
   if(model.claimErrors-- >0)throw new Error(UPSTREAM_SECRET);
   return model.rows.filter(row=>!row.sent&&!row.disabled&&Date.parse(row.scheduled_at)<=model.time&&Date.parse(row.due_at)>model.time&&(!row.lease||row.lease<model.time)).map(row=>{
    row.claim_id='claim-'+(++model.generation);row.lease=model.time+2*60000;return structuredClone(row);
   });
  }
  const row=model.rows.find(row=>row.id===args.p_job&&row.claim_id===args.p_claim);
  if(name==='dh_push_delivery'){
   if(model.deliveryErrors-- >0)throw new Error(UPSTREAM_SECRET);
   return row&&!row.sent&&!row.disabled?{subscription:{endpoint:'mock-subscription'}}:null;
  }
  if(name==='dh_push_finish'){
   if(model.finishErrors-- >0)throw new Error(UPSTREAM_SECRET);
   if(row){row.sent=args.p_sent||row.sent;row.disabled=args.p_expired||row.disabled;row.lease=args.p_sent?null:model.time+4*60000;}
   return null;
  }
  throw new Error('unexpected RPC: '+name);
 };
 const deliver=async(sub,message)=>{
  if(model.sendErrors-- >0)throw new Error(UPSTREAM_SECRET);
  model.messages.push(structuredClone(message));
 };
 const push=createPush({db,deliver,now:()=>model.time});
 async function request(url='/api/push/tick',method='POST',authorization='Bearer '+SECRET){
  let answer;
  await push.handle({url,method,headers:{authorization,'content-type':'application/json'}},{},async()=>({}),(_,status,body)=>{answer={status,body};},{});
  return answer;
 }
 return {model,push,db,deliver,request,status:()=>request('/api/push/status','GET')};
}

test('HTTP tick/status 拒绝错误或缺失凭证，鉴权失败不执行数据库也不记录执行成功',async t=>{
 configure(t);
 const {model,push}=fixture();
 const server=http.createServer(async(req,res)=>{
  const json=(_,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  try{await push.handle(req,res,async()=>({}),json,{});}catch(error){json(res,error.status||503,{ok:false,error:error.publicMessage||'提醒服务暂不可用。'});}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 for(const authorization of [null,'Bearer wrong'])for(const route of ['/api/push/tick','/api/push/status']){
  const headers={'Content-Type':'application/json'};if(authorization)headers.Authorization=authorization;
  const response=await fetch(base+route,{method:route.endsWith('tick')?'POST':'GET',headers});
  assert.equal(response.status,401);assert.equal((await response.json()).ok,false);
 }
 const response=await fetch(base+'/api/push/status',{headers:{Authorization:'Bearer '+SECRET}});
 assert.equal(response.status,200);const info=await response.json();
 assert.equal(info.lastTick,null);assert.equal(info.lastSuccessAt,null);assert.equal(model.calls.length,0);
 assert.ok(!JSON.stringify(info).includes(SECRET));
});

test('status 仅需定时凭证即可诊断未配置服务，GET 只读且不泄漏配置',async t=>{
 configure(t,{full:false});
 const f=fixture(),first=await f.status();
 assert.equal(first.status,200);assert.equal(first.body.configured,false);assert.equal(first.body.startedAt,iso(BASE));
 assert.equal(first.body.running,false);assert.equal(first.body.lastTick,null);assert.equal(first.body.pendingAcknowledgements,0);
 f.model.time+=10*60000;assert.deepEqual(await f.status(),first);assert.equal(f.model.calls.length,0);
 await assert.rejects(()=>f.request('/api/push/status','POST'),error=>error.status===405);
 assert.deepEqual(await f.status(),first);
 const failure=await f.request('/api/push/tick');
 assert.equal(failure.status,503);assert.equal(failure.body.ok,false);assert.ok(failure.body.failed>0);assert.ok(failure.body.error);
 const info=(await f.status()).body;
 assert.equal(info.configured,false);assert.equal(info.lastTick.startedAt,iso(f.model.time));assert.equal(info.lastTick.finishedAt,iso(f.model.time));assert.equal(info.lastTick.ok,false);
 assert.equal(info.lastSuccessAt,null);assert.equal(f.model.calls.length,0);
});

test('领取失败明确返回503，下一次补发迟到但未截止的提醒，再次tick不重复发送',async t=>{
 configure(t);
 const f=fixture();f.model.claimErrors=1;
 const failed=await f.request();
 assert.equal(failed.status,503);assert.equal(failed.body.ok,false);assert.equal(failed.body.sent,0);assert.ok(failed.body.failed>0);
 assert.ok(failed.body.error);assert.ok(!JSON.stringify(failed.body).includes(UPSTREAM_SECRET));
 let info=(await f.status()).body;
 assert.equal(info.lastTick.startedAt,iso(BASE));assert.equal(info.lastTick.finishedAt,iso(BASE));assert.equal(info.lastTick.ok,false);assert.equal(info.lastSuccessAt,null);
 f.model.time+=10*60000;
 const retry=await f.request();assert.equal(retry.status,200);assert.equal(retry.body.sent,1);assert.equal(retry.body.failed,0);
 assert.equal(f.model.messages.length,1);assert.ok(f.model.messages[0].expires>f.model.time);assert.equal(f.model.messages[0].expires,f.model.time+5*60000);
 info=(await f.status()).body;
 assert.equal(info.lastTick.startedAt,iso(f.model.time));assert.equal(info.lastTick.finishedAt,iso(f.model.time));assert.equal(info.lastTick.ok,true);assert.equal(info.lastTick.sent,1);assert.equal(info.lastSuccessAt,iso(f.model.time));
 const beforeReads=f.model.calls.length;assert.deepEqual((await f.status()).body,info);assert.equal(f.model.calls.length,beforeReads);
 f.model.time+=10*60000;assert.equal((await f.request()).body.sent,0);assert.equal(f.model.messages.length,1);
});

test('订阅读取或推送发送失败均返回503，失败任务释放后可补发，成功任务不重发',async t=>{
 configure(t);
 for(const failure of ['deliveryErrors','sendErrors']){
  const f=fixture([job(),job({id:'job-two',task_id:'task-two'})]);f.model[failure]=1;
  const first=await f.request();assert.equal(first.status,503);assert.equal(first.body.sent,1);assert.equal(first.body.failed,1);
  assert.equal(f.model.rows.filter(row=>row.sent).length,1);
  assert.ok(!JSON.stringify(first.body).includes(UPSTREAM_SECRET));
  f.model.time+=10*60000;
  const retry=await f.request();assert.equal(retry.status,200);assert.equal(retry.body.sent,1);assert.equal(f.model.messages.length,2);
  assert.equal(new Set(f.model.messages.map(message=>message.tag)).size,2);
  f.model.time+=10*60000;assert.equal((await f.request()).body.sent,0);assert.equal(f.model.messages.length,2);
 }
});

test('已发送但确认失败时只重试确认，数据库仍失败则暂停领取，恢复后不重复发送',async t=>{
 configure(t);
 const f=fixture();f.model.finishErrors=2;
 const first=await f.request();assert.equal(first.status,503);assert.equal(first.body.sent,1);assert.equal(first.body.failed,1);assert.equal(first.body.pendingAcknowledgements,1);
 assert.equal(f.model.messages.length,1);assert.equal((await f.status()).body.pendingAcknowledgements,1);
 const claims=()=>f.model.calls.filter(call=>call.name==='dh_push_claim').length;
 assert.equal(claims(),1);
 f.model.time+=10*60000;
 const second=await f.request();assert.equal(second.status,503);assert.equal(second.body.sent,0);assert.equal(second.body.pendingAcknowledgements,1);
 assert.equal(claims(),1);assert.equal(f.model.messages.length,1);
 f.model.time+=10*60000;
 const third=await f.request();assert.equal(third.status,200);assert.equal(third.body.sent,0);assert.equal(third.body.pendingAcknowledgements,0);
 assert.equal(claims(),2);assert.equal(f.model.messages.length,1);assert.equal(f.model.rows[0].sent,true);
 const finishes=f.model.calls.filter(call=>call.name==='dh_push_finish');
 assert.equal(finishes.length,3);for(const call of finishes)assert.equal(call.args.p_sent,true);
});

test('执行期间到期的已领取任务不再补发，已取消的订阅也不发送',async t=>{
 configure(t);
 const time=BASE,rows=[job({id:'expired',due_at:iso(time)}),job({id:'removed',due_at:iso(time+60000)})],finishes=[];
 let sends=0;
 const push=createPush({now:()=>time,deliver:async()=>{sends++;},db:async(name,args)=>{
  if(name==='dh_push_claim')return rows.map(row=>({...row,claim_id:'lease'}));
  if(name==='dh_push_delivery')return args.p_job==='removed'?null:{subscription:{}};
  if(name==='dh_push_finish')finishes.push(args);
 }});
 let answer;await push.handle({url:'/api/push/tick',method:'POST',headers:{authorization:'Bearer '+SECRET,'content-type':'application/json'}},{},null,(_,status,body)=>answer={status,body},{});
 assert.equal(answer.status,200);assert.equal(answer.body.sent,0);assert.equal(answer.body.skipped,2);assert.equal(sends,0);
 assert.equal(finishes.length,2);for(const finish of finishes)assert.equal(finish.p_sent,false);
});

test('并发tick返回409且不覆盖正在执行的记录，status显示running直到原tick结束',async t=>{
 configure(t);
 let release,claims=0,time=BASE;
 const gate=new Promise(resolve=>release=resolve);
 const push=createPush({now:()=>time,db:async name=>{assert.equal(name,'dh_push_claim');claims++;await gate;return [];}});
 async function request(route='/api/push/tick'){
  let answer;await push.handle({url:route,method:route.endsWith('status')?'GET':'POST',headers:{authorization:'Bearer '+SECRET,'content-type':'application/json'}},{},null,(_,status,body)=>answer={status,body},{});return answer;
 }
 const active=request();t.after(()=>release());
 const during=await request('/api/push/status');assert.equal(during.body.running,true);assert.equal(during.body.lastTick.finishedAt,null);
 const overlap=await request();assert.equal(overlap.status,409);assert.equal(overlap.body.ok,false);assert.equal(overlap.body.busy,true);assert.equal(claims,1);
 assert.deepEqual((await request('/api/push/status')).body.lastTick,during.body.lastTick);
 time+=1500;release();const done=await active;assert.equal(done.status,200);
 const after=await request('/api/push/status');assert.equal(after.body.running,false);assert.equal(after.body.lastTick.startedAt,iso(BASE));assert.equal(after.body.lastTick.finishedAt,iso(time));
});

test('补发消息五分钟内有效，临近截止时不越过任务截止',()=>{
 const delayed=job();assert.equal(payload(delayed,BASE).expires,BASE+5*60000);
 assert.equal(payload({...delayed,due_at:iso(BASE+2*60000)},BASE).expires,BASE+2*60000);
});
