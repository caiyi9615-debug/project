'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {jobs,owner,subscription,MINUTES,createPush,payload}=require('../push');
const T=require('../public/time');
const now=T.epoch('2026-10-26T12:00');
const task={id:'one',title:'实验报告',deadlineKind:'datetime',dueAt:'2026-10-28T12:00',dateConfirmed:true,timeEvidence:{verification:'confirmed'},executionStatus:'unsubmitted'};
test('推送五个阶段采用明确上海时区，任务/截止/阶段组成稳定去重ID',()=>{
 const a=jobs([task],'device',now);assert.deepEqual(a.map(j=>j.minutes),MINUTES);assert.equal(a.length,5);
 assert.equal(a[0].scheduled_at,'2026-10-27T04:00:00.000Z');assert.equal(a[4].scheduled_at,'2026-10-28T03:30:00.000Z');
 assert.deepEqual(jobs([task],'device',now),a);assert.notEqual(jobs([{...task,dueAt:'2026-10-29T12:00'}],'device',now)[0].id,a[0].id);
});
test('已完成/已提交/待批阅/未知、未确认、仅日期、无时间、演示、过期任务不进入云端队列',()=>{
 for(const executionStatus of ['completed','submitted','pending_review','unknown'])assert.equal(jobs([{...task,executionStatus}],'d',now).length,0);
 for(const change of [{dateConfirmed:false},{timeEvidence:{verification:'pending'}},{deadlineKind:'date'},{deadlineKind:'none'},{dueAt:''},{demo:true},{dueAt:'2026-10-25T12:00'}])assert.equal(jobs([{...task,...change}],'d',now).length,0);
 assert.throws(()=>jobs(Array(201).fill(task),'d',now),/200项/);
});
test('推送订阅只接受已知HTTPS推送服务，拒绝内网SSRF及伪造设备令牌',()=>{
 const keys={p256dh:'a'.repeat(87),auth:'a'.repeat(22)};
 assert.equal(subscription({endpoint:'https://web.push.apple.com/a',keys}).keys.auth,keys.auth);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://evil.test/a','https://fcm.googleapis.com.evil.test/a','https://u:p@fcm.googleapis.com/a','https://fcm.googleapis.com:123/a'])assert.throws(()=>subscription({endpoint,keys}));
 assert.throws(()=>owner('invalid'));assert.equal(owner('a'.repeat(64)).length,64);
});
test('推送消息包含截止与跳转，限时丢弃，显示实际剩余而非固定阶段',()=>{
 const j=jobs([task],'d',now)[4];const p=payload(j,T.epoch('2026-10-28T11:35'));
 assert.match(p.body,/25分钟/);assert.equal(p.url,'/#tasks');assert.equal(p.expires,T.epoch('2026-10-28T11:45'));
});
test('定时入口校验秘密，发送后确认，失效订阅清理；不泄露秘密',async()=>{
 const envKeys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','PUSH_JOIN_CODE','PUSH_CRON_SECRET'];
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));for(const k of envKeys)process.env[k]='test';
 try{
  const j={...jobs([{...task,dueAt:'2026-10-26T12:30'}],'d',now)[4],claim_id:'claim'};let finishes=[],deliveries=0,answer;
  const db=async(name,args)=>{if(name==='dh_push_claim')return [j];if(name==='dh_push_delivery')return {subscription:{}};if(name==='dh_push_finish')finishes.push(args);};
  const push=createPush({db,now:()=>now,deliver:async()=>{deliveries++;}});
  const req={url:'/api/push/tick',method:'POST',headers:{'content-type':'application/json',authorization:'Bearer wrong'}};
  const json=(res,status,p)=>{answer={status,p};};
  await assert.rejects(()=>push.handle(req,{},async()=>({}),json,{}),e=>e.status===401);
  req.headers.authorization='Bearer test';await push.handle(req,{},async()=>({}),json,{});
  assert.equal(deliveries,1);assert.equal(finishes[0].p_sent,true);assert.equal(answer.p.sent,1);
  const expired=createPush({db,now:()=>now,deliver:async()=>{throw {statusCode:410};}});
  await expired.handle(req,{},async()=>({}),json,{});assert.equal(finishes[1].p_expired,true);
  const unconfigured=createPush();delete process.env.VAPID_PRIVATE_KEY;
  await unconfigured.handle({url:'/api/push/config',method:'GET'}, {},null,json,{});assert.equal(answer.p.configured,false);assert.equal(answer.p.publicKey,'');
 }finally{for(const k of envKeys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
