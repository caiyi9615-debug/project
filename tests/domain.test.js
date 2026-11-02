'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../public/domain');
const {validateOutput,analyzeNotification}=require('../ai');
function task(overrides={}){return D.cleanTask({title:'大学物理实验报告',dueAt:'2026-10-28T18:00',checklist:['实验数据','PDF报告'],dateConfirmed:true,...overrides});}
test('dates reject impossible dates and never invent missing years',()=>{
  assert.equal(D.validDate('2026-02-30T18:00'),'');assert.equal(D.validDate('10月31日23:59'),'');assert.equal(D.validDate('2026-10-31T23:59'),'2026-10-31T23:59');
  const t=task({dueAt:'10月31日23:59'});assert.equal(t.dueAt,'');assert.ok(t.uncertain.length);
});
test('multi-task schema, invalid JSON fields and unknown dates',()=>{
  const tasks=validateOutput({tasks:[{title:'报名',checklist:[],uncertain:['缺少年份'],dateText:'10月25日'},{title:'开幕式',checklist:[],uncertain:[],dateText:'2026年10月25日10:00',startsAt:'2026-10-25T10:00'},{title:'作品提交',checklist:['源码'],uncertain:[],dateText:'2026年10月31日23:59',dueAt:'2026-10-31T23:59'}]});
  assert.equal(tasks.length,3);assert.equal(tasks[0].dueAt,'');assert.equal(tasks[1].dueAt,'');assert.ok(tasks[1].startsAt);
  assert.throws(()=>validateOutput({tasks:[]}),/未识别/);assert.throws(()=>validateOutput({tasks:[{title:'x',checklist:'wrong',uncertain:[]}]}),/不完整/);
});
test('risk rules cover overdue, 24h, 72h, concentration, preparation and provided capacity',()=>{
  const now=new Date('2026-10-25T12:00');const tasks=[task({dueAt:'2026-10-24T12:00'}),task({dueAt:'2026-10-25T18:00',estimatedHours:4,availableHours:1}),task({dueAt:'2026-10-27T18:00'}),task({dueAt:'2026-10-27T20:00'})];
  const risks=D.risks(tasks,now);assert.equal(risks[0].severity,4);assert.ok(risks.some(r=>r.reasons.some(x=>x.includes('24 小时'))));assert.ok(risks.some(r=>r.reasons.some(x=>x.includes('3 天'))));assert.ok(risks.some(r=>r.reasons.some(x=>x.includes('集中'))));assert.ok(risks.some(r=>r.reasons.some(x=>x.includes('可用'))));
  assert.equal(D.risks([task({dueAt:'2026-10-25T18:00',status:'done'})],now).length,0);
  assert.ok(!D.risks([task({estimatedHours:100,availableHours:null})],now).some(r=>r.reasons.some(x=>x.includes('预计需'))));
});
test('change requires confirmation, retains history and rejects stale base',()=>{
  const old=task();old.checklist[0].done=true;const state={tasks:[old],history:[]};
  const change={taskId:old.id,baseUpdatedAt:old.updatedAt,sourceId:'new-source',status:'pending',proposed:task({...old,dueAt:'2026-10-30T18:00'})};
  assert.equal(state.tasks[0].dueAt,'2026-10-28T18:00');
  const result=D.applyChange(state,change);assert.equal(result.dueAt,'2026-10-30T18:00');assert.equal(result.checklist[0].done,true);assert.equal(state.history[0].before.dueAt,'2026-10-28T18:00');assert.equal(change.status,'accepted');
  assert.throws(()=>D.applyChange(state,{...change,baseUpdatedAt:'2000-01-01T00:00:00Z'}),/已修改/);
});
test('ICS RFC line endings, Unicode folding and UTC conversion',()=>{
  const text=D.ics([task({title:'课程报告'.repeat(30)})]);assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));assert.match(text,/DTSTART:20261028T100000Z/);assert.match(text,/\r\n /);for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('backup schema validates data and rejects invalid dates',()=>{
  const state={version:2,tasks:[task()],sources:[],changes:[],history:[]};assert.equal(D.validateBackup(state).tasks.length,1);assert.throws(()=>D.validateBackup({...state,version:1}),/有效/);assert.throws(()=>D.validateBackup({...state,tasks:[task(),{...task(),dueAt:'nonsense'}]}),/日期/);
});
test('DeepSeek adapter uses multimodal input and rejects incomplete JSON / HTTP errors',async()=>{
  const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='only-in-test';
  try{
    const result=await analyzeNotification({text:'通知',image:{mimeType:'image/png',data:'cG5n'}},async(url,opts)=>{
      assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(opts.headers.Authorization,'Bearer only-in-test');const body=JSON.parse(opts.body);assert.equal(body.model,'deepseek-flash');assert.match(body.messages[0].content[1].image_url.url,/data:image\/png;base64/);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({tasks:[{title:'任务',checklist:[],uncertain:[]}]})}}]}));
    });assert.equal(result.tasks.length,1);
    for(const [status,hint] of [[401,/密钥/],[402,/余额/],[429,/频繁/]])await assert.rejects(()=>analyzeNotification({text:'x'},async()=>new Response('{}',{status})),hint);
    await assert.rejects(()=>analyzeNotification({text:'x'},async()=>new Response(JSON.stringify({choices:[{message:{content:'{"tasks":['}}]}))),/JSON/);
    delete process.env.DEEPSEEK_API_KEY;await assert.rejects(()=>analyzeNotification({text:'x'}),/未配置/);
  }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});
