'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../advisor'),P=require('../public/planner'),D=require('../public/domain');
const project={title:'校园活动展示工具',description:'想为班级做一个展示工具，目前只有想法，不知道先做什么。',dueDate:'2028-11-15',dateConfirmed:true};
const limits={startDate:'2028-11-01',endDate:'2028-11-15',dailyMinutes:90,focusMinutes:30,bufferDays:1,excludedWeekdays:[0,6],excludedDates:[],style:'auto'};
const replies=[{question:'已有基础？',answer:'还没有代码，周三也不安排事情，希望集中推进。'}];
const output={summary:'先确认目标，再实现最小可用展示',scheduleExplanation:'依据零基础和已有要求，先小范围验证再制作。',steps:[{title:'写出三项核心需求并确认',description:'列出用户、场景与验收标准',phase:'明确范围',minutes:30},{title:'画出最小交互流程',description:'产出一份可讨论的草图',phase:'方案',minutes:20},{title:'检查并演示最小成果',description:'按需求清单验收并记录未完成项',phase:'验证',minutes:30}],refinedRules:{excludedWeekdays:[3],excludedDates:[],style:'burst'},assumptions:['尚未明确技术熟练度，时长为估计']};
const response=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
test('项目上下文与硬限制校验，不能延后截止或省略可用时间',()=>{
 assert.throws(()=>A.context({project:{title:'无描述'}}),/先说明/);
 assert.throws(()=>A.constraints({...limits,endDate:'2028-11-16'},project),/晚于/);
 assert.throws(()=>A.constraints({...limits,dailyMinutes:10},project),/15/);
 assert.throws(()=>A.constraints({...limits,focusMinutes:120},project),/不超过/);
 assert.throws(()=>A.constraints({...limits,excludedDates:['11月3日']},project),/休息日/);
});
test('项目追问结构化，问题不是预先写死的报告模板',()=>{
 const r=A.interview({summary:'理解项目',questions:[{question:'谁会使用这个展示工具？',why:'决定功能范围'},{question:'你已经做过类似界面吗？'}]});assert.equal(r.questions.length,2);assert.equal(r.questions[0].id,'q1');assert.match(r.questions[0].question,/展示工具/);
 assert.throws(()=>A.interview({questions:[]}),/追问/);
});
test('依据回答生成执行步骤、完成标准和时长估计，约束只收紧不自动放宽',()=>{
 const r=A.draft(output,project,A.constraints(limits,project),replies);assert.equal(r.plan.items.length,3);assert.equal(r.estimatedMinutes,80);assert.equal(r.plan.guidance.answers[0].answer,replies[0].answer);assert.equal(r.plan.rules.style,'burst');assert.ok(r.plan.rules.excludedWeekdays.includes(0));assert.ok(r.plan.rules.excludedWeekdays.includes(6));assert.ok(r.plan.rules.excludedWeekdays.includes(3));assert.deepEqual(r.errors,[]);
 for(const x of r.plan.items){assert.equal(x.done,false);assert.ok(![0,3,6].includes(P.weekday(x.date)));assert.ok(x.description);}
 assert.equal(r.plan.confirmed,false);
});
test('显式指定的节奏不被AI覆盖，AI建议不能增加硬预算或可用日',()=>{
 const r=A.draft({...output,refinedRules:{excludedWeekdays:[],maxPerDay:1000,dailyMinutes:720,style:'burst'}},project,A.constraints({...limits,style:'steady'},project),replies);
 assert.equal(r.plan.rules.style,'steady');assert.equal(r.plan.rules.maxPerDay,3);assert.equal(r.plan.guidance.dailyMinutes,90);assert.deepEqual(r.plan.rules.excludedWeekdays,[0,6]);
});
test('容量不足保留真实工作量并报错，不通过删除步骤伪造可行',()=>{
 const steps=Array.from({length:10},(_,i)=>({title:'必要步骤'+i,description:'明确产出',minutes:15}));
 const c=A.constraints({...limits,startDate:'2028-11-01',endDate:'2028-11-01',dailyMinutes:15,focusMinutes:15,bufferDays:0},project);
 const r=A.draft({...output,steps,refinedRules:{}},project,c,replies);assert.equal(r.plan.items.length,10);assert.match(r.errors[0],/排不下/);assert.equal(r.plan.items.filter(x=>x.date).length,1);
});
test('AI时长、完成标记不可信：超长步骤拒绝，完成状态始终从未完成开始',()=>{
 assert.throws(()=>A.draft({...output,steps:[{title:'过长步骤',minutes:120}]},project,A.constraints(limits,project),replies),/单段/);
 const r=A.draft({...output,steps:[{title:'可执行步骤',description:'产出可核对的结果',minutes:30,done:true,completedAt:'2026-01-01'}]},project,A.constraints(limits,project),replies);assert.equal(r.plan.items[0].done,false);assert.equal(r.plan.items[0].completedAt,'');
});
test('问答依据、估计和步骤细节随计划备份恢复，手动日期修改仍检查时间预算',()=>{
 const r=A.draft(output,project,A.constraints(limits,project),replies),task=D.cleanTask({title:'项目',plan:r.plan});
 const backup=D.validateBackup({version:2,tasks:[task],sources:[],changes:[],history:[]});assert.equal(backup.tasks[0].plan.guidance.estimatedMinutes,80);assert.equal(backup.tasks[0].plan.items[1].description,output.steps[1].description);
 const plan=backup.tasks[0].plan;plan.guidance.dailyMinutes=30;plan.rules.maxPerDay=10;plan.items.forEach(x=>x.date=plan.items[0].date);assert.ok(P.validate(plan).some(x=>x.includes('预算')));
});
test('AI适配器发送项目与回答、禁用默认思考消耗，密钥只放请求头',async()=>{
 const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='mock-secret-not-user';
 try{
  let calls=0;const result=await A.advise({stage:'questions',project},async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const b=JSON.parse(options.body);assert.equal(b.thinking.type,'disabled');assert.equal(b.response_format.type,'json_object');assert.ok(b.messages[1].content.includes(project.title));assert.ok(!options.body.includes('mock-secret-not-user'));return response({summary:'上下文',questions:[{question:'已有原型吗？'},{question:'最终给谁使用？'}]});});assert.equal(calls,1);assert.equal(result.questions.length,2);
  let attempts=0;await A.advise({stage:'draft',project,answers:replies,constraints:limits},async()=>{attempts++;return attempts===1?new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"steps":['}}]})):response(output);});assert.equal(attempts,2);
  attempts=0;await assert.rejects(()=>A.advise({stage:'questions',project},async()=>{attempts++;return new Response('{}',{status:401});}),/密钥/);assert.equal(attempts,1);
  delete process.env.DEEPSEEK_API_KEY;await assert.rejects(()=>A.advise({stage:'questions',project}),/手动DIY/);
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});
