'use strict';
const crypto=require('node:crypto'),T=require('./public/time'),{fail}=require('./ai');
const MINUTES=[1440,720,180,60,30];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function config(){return ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','PUSH_JOIN_CODE','PUSH_CRON_SECRET'].every(k=>(process.env[k]||'').trim());}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length>0&&crypto.timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));}
function owner(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail('设备凭证无效，请重新开启提醒。',401);return hash(token);}
function subscription(value){
 let url;try{url=new URL(value?.endpoint);}catch{throw fail('推送订阅地址无效。',400);}
 const hosts=['fcm.googleapis.com','push.services.mozilla.com','push.apple.com','notify.windows.com'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw fail('暂不支持该浏览器的推送服务，请使用Chrome、Edge、Firefox或Safari。',400);
 const keys=value?.keys;
 if(!keys||!/^[-_A-Za-z0-9]{86,88}$/.test(keys.p256dh||'')||!/^[-_A-Za-z0-9]{22,24}$/.test(keys.auth||''))throw fail('推送订阅密钥无效。',400);
 return {endpoint:url.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
function jobs(tasks,device,now=Date.now()){
 if(!Array.isArray(tasks)||tasks.length>200)throw fail('免费试用最多同步200项任务；请先整理任务数量。',400);
 const out=[];
 for(const t of tasks){
  if(!t||typeof t.id!=='string'||t.id.length>100||typeof t.title!=='string')throw fail('提醒任务格式无效。',400);
  if(t.demo||t.deadlineKind!=='datetime'||t.dateConfirmed!==true||t.timeEvidence?.verification!=='confirmed'||!['unsubmitted','overdue'].includes(t.executionStatus))continue;
  const due=T.epoch(t.dueAt);if(!Number.isFinite(due)||due<=now)continue;
  for(const minutes of MINUTES)out.push({id:hash(device+'|'+t.id+'|'+t.dueAt+'|'+minutes),task_id:t.id,title:t.title.slice(0,150),due_at:new Date(due).toISOString(),due_local:t.dueAt,scheduled_at:new Date(due-minutes*60000).toISOString(),minutes});
 }
 return out;
}
async function rpc(name,args,request=fetch){
 const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))throw fail('云数据库地址配置无效。',503);
 const response=await request(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw fail('提醒云数据库请求失败，请检查配置及建表SQL。',503);
 return response.status===204?null:response.json();
}
async function send(sub,payload){return require('web-push').sendNotification(subscription(sub),JSON.stringify(payload),{TTL:300,timeout:10000,urgency:'high',vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY}});}
function payload(job,now=Date.now()){
 const left=Math.max(1,Math.ceil((Date.parse(job.due_at)-now)/60000));
 return {title:'Deadline Hunter · 截止提醒',body:`${job.title}：距截止约${left}分钟；截止 ${job.due_local.replace('T',' ')}（北京时间）`,tag:job.id,url:'/#tasks',taskId:job.task_id,dueAt:job.due_local,expires:Math.min(Date.parse(job.due_at),Date.parse(job.scheduled_at)+15*60000)};
}
function createPush({db=rpc,deliver=send,now=()=>Date.now()}={}){
 let running=false;const limits=new Map();
 async function handle(req,res,readJson,json,headers){
  const route=req.url;
  if(route==='/api/push/config'&&req.method==='GET'){json(res,200,{configured:config(),publicKey:config()?process.env.VAPID_PUBLIC_KEY:'',minutes:MINUTES,scheduler:'Supabase Cron 每5分钟；需单独配置，不保证准时'},headers);return;}
  if(!config())throw fail('后台提醒尚未配置，请按免费推送说明配置云数据库及定时任务。关闭网页后的提醒当前未生效。',503);
  if(req.method!=='POST')throw fail('请求方式不支持。',405);
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('请使用JSON请求。',415);
  if(route==='/api/push/tick'){
   if(!equal(req.headers.authorization,'Bearer '+process.env.PUSH_CRON_SECRET))throw fail('定时服务凭证无效。',401);
   if(running){json(res,200,{ok:true,busy:true},headers);return;}
   running=true;
   try{
    const batch=await db('dh_push_claim',{});let sent=0,failed=0;
    await Promise.all((batch||[]).map(async job=>{
     let success=false,expired=false;
     try{
      const device=await db('dh_push_delivery',{p_job:job.id,p_claim:job.claim_id});
      if(!device||Date.parse(job.due_at)<=now()||Date.parse(job.scheduled_at)<now()-15*60000)return;
      await deliver(device.subscription,payload(job,now()));success=true;sent++;
     }catch(e){failed++;expired=[404,410].includes(e.statusCode);}
     finally{await db('dh_push_finish',{p_job:job.id,p_claim:job.claim_id,p_sent:success,p_expired:expired}).catch(()=>{failed++;});}
    }));json(res,200,{ok:true,claimed:(batch||[]).length,sent,failed},headers);
   }finally{running=false;}return;
  }
  const body=await readJson(req),device=owner(body?.token);
  const count=limits.get(device)||{at:now(),n:0};if(now()-count.at>60000){count.at=now();count.n=0;}if(++count.n>15)throw fail('提醒操作过于频繁，请一分钟后重试。',429);limits.set(device,count);if(limits.size>2000)limits.clear();
  if(route==='/api/push/subscribe'){
   if(!equal(body.joinCode,process.env.PUSH_JOIN_CODE))throw fail('提醒邀请码不正确，请向维护者获取，勿填写API密钥。',403);
   const sub=subscription(body.subscription),list=jobs(body.tasks,device,now());
   await db('dh_push_register',{p_device:device,p_subscription:sub});await db('dh_push_sync',{p_device:device,p_jobs:list});
   json(res,200,{ok:true,count:list.length,message:'订阅及任务摘要已保存；请确认后台定时任务运行。'},headers);return;
  }
  if(route==='/api/push/sync'){const list=jobs(body.tasks,device,now());await db('dh_push_sync',{p_device:device,p_jobs:list});json(res,200,{ok:true,count:list.length,syncedAt:new Date(now()).toISOString()},headers);return;}
  if(route==='/api/push/disable'){await db('dh_push_remove',{p_device:device});json(res,200,{ok:true},headers);return;}
  if(route==='/api/push/test'){
   const record=await db('dh_push_device',{p_device:device});if(!record)throw fail('设备订阅已失效，请重新开启提醒。',401);
   try{await deliver(record.subscription,{title:'Deadline Hunter · 测试通知',body:'推送服务已接受这条测试消息，请检查通知栏；这不代表定时任务已配置。',tag:'dh-test',url:'/#settings',expires:now()+300000});}catch{throw fail('测试推送未成功，请检查VAPID配置、订阅和推送服务网络。',502);}
   json(res,200,{ok:true,message:'推送服务已接受，请检查通知栏（不代表设备已送达）。'},headers);return;
  }
  throw fail('提醒接口不存在。',404);
 }
 return {handle};
}
module.exports={createPush,jobs,subscription,owner,payload,MINUTES};
