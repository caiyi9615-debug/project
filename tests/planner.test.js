'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../public/planner'),D=require('../public/domain'),T=require('../public/time'),{validateOutput}=require('../ai');
const today='2026-11-02',rules={startDate:today,endDate:'2026-11-15',maxPerDay:1,bufferDays:1,excludedWeekdays:[0,6],style:'steady'};
function generate(n=7,options={}){return P.generate({items:P.makeItems({total:n,unit:'项'}),rules,task:{},today,...options});}
test('通用数量：7份报告、10章、5套试卷均可定制，不写死例子',()=>{
 for(const [total,unit] of [[7,'份报告'],[10,'章'],[5,'套试卷']]){const items=P.makeItems({total,unit}),r=generate(total,{items,unit});assert.equal(r.plan.items.length,total);assert.deepEqual(r.errors,[]);assert.match(items[0].title,new RegExp(unit));assert.equal(P.summary({plan:r.plan}).percent,0);}
});
test('遵守周末休息、额外休息日、每日上限与截止缓冲',()=>{
 const r=generate(7,{rules:{...rules,excludedDates:['2026-11-04']}});assert.deepEqual(r.errors,[]);
 const counts={};for(const x of r.plan.items){assert.ok(![0,6].includes(P.weekday(x.date)));assert.notEqual(x.date,'2026-11-04');assert.ok(x.date<'2026-11-15');counts[x.date]=(counts[x.date]||0)+1;}assert.ok(Object.values(counts).every(n=>n<=1));
});
test('容量不足明确返回剩余数量，不能悄悄占用休息日',()=>{
 const r=generate(7,{rules:{...rules,endDate:'2026-11-08'}});assert.equal(r.capacity,5);assert.match(r.errors[0],/只能安排5项.*2项排不下/);assert.equal(r.plan.items.filter(x=>!x.date).length,2);
 assert.ok(r.plan.items.filter(x=>x.date).every(x=>![0,6].includes(P.weekday(x.date))));
});
test('细水长流分散、集中推进聚集、提前完成压缩窗口，均不突破约束',()=>{
 const dates=style=>generate(4,{rules:{...rules,maxPerDay:2,style}}).plan.items.map(x=>x.date);
 const steady=dates('steady'),burst=dates('burst'),early=dates('early');
 assert.ok(new Set(steady).size>new Set(burst).size);assert.ok(early.at(-1)<steady.at(-1));assert.deepEqual(burst,['2026-11-02','2026-11-02','2026-11-03','2026-11-03']);
});
test('自定义阶段名称、总量调整保留已完成记录，不能缩小到已完成数量以下',()=>{
 const items=P.makeItems({stageNames:['自行调研','制作原型','测试','交付'],unit:'阶段'}),r=generate(4,{items,mode:'stages'});
 r.plan.items[2].done=true;const smaller=P.makeItems({total:2,existing:r.plan});assert.ok(smaller.some(x=>x.id===items[2].id&&x.done));assert.equal(smaller.length,2);
 assert.throws(()=>P.makeItems({total:0,existing:r.plan}),/1～500/);
 r.plan.items.forEach(x=>x.done=true);assert.throws(()=>P.makeItems({total:2,existing:r.plan}),/少于已完成/);
});
test('重排仅移动未完成且未固定的内容，保留ID与完成日期，不更改提交状态',()=>{
 const r=generate();r.plan.items[0].done=true;r.plan.items[0].completedAt='2026-11-02T04:00:00Z';r.plan.items[1].locked=true;r.plan.items[1].date='2026-11-10';
 const before=structuredClone(r.plan.items),task=D.cleanTask({title:'大任务',plan:r.plan,executionStatus:'unsubmitted'});
 const next=generate(7,{items:r.plan.items,existing:r.plan,rules:{...rules,startDate:'2026-11-04'},task});
 assert.deepEqual(next.errors,[]);assert.deepEqual(next.plan.items[0],before[0]);assert.deepEqual(next.plan.items[1],before[1]);assert.equal(task.executionStatus,'unsubmitted');
});
test('手动排期或拖拽违反休息日/上限/截止范围时不能保存',()=>{
 const r=generate();r.plan.items[0].date='2026-11-07';assert.ok(P.validate(r.plan).some(x=>x.includes('休息日')));
 r.plan.items[0].date=r.plan.items[1].date;assert.ok(P.validate(r.plan).some(x=>x.includes('上限')));
 r.plan.items[0].date='2026-11-16';assert.ok(P.validate(r.plan).some(x=>x.includes('超出')));
 assert.ok(generate(1,{task:{dueDate:'2026-11-10'}}).errors.some(x=>x.includes('晚于')));
});
test('进度以实际完成为准，不随时间、材料清单或提交状态自动变化',()=>{
 const r=generate();r.plan.items[0].done=true;r.plan.items[1].done=true;
 const task=D.cleanTask({title:'大任务',plan:r.plan,executionStatus:'unsubmitted',checklist:[{text:'材料',done:true}]});
 assert.equal(P.summary(task,'2026-11-02').percent,28.6);assert.equal(P.summary(task,'2026-12-01').percent,28.6);assert.equal(D.progress(task),100);
 task.plan.items.forEach(x=>x.done=true);assert.equal(P.summary(task).percent,100);assert.equal(task.executionStatus,'unsubmitted');
});
test('按具体日程计算落后、按自然周汇总，跨月/跨年/闰年无时区偏移',()=>{
 const r=generate();const s=P.summary({plan:r.plan},'2026-11-15');assert.equal(s.expected,7);assert.equal(s.overdue,7);assert.equal(P.weeks(r.plan).reduce((n,w)=>n+w.items.length,0),7);
 assert.equal(P.add('2028-02-28',1),'2028-02-29');assert.equal(P.add('2026-12-31',1),'2027-01-01');
 const saved=process.env.TZ;try{for(const tz of ['UTC','America/Los_Angeles','Asia/Shanghai']){process.env.TZ=tz;assert.deepEqual(generate().plan.items.map(x=>x.date),r.plan.items.map(x=>x.date));}}finally{if(saved===undefined)delete process.env.TZ;else process.env.TZ=saved;}
});
test('快照51/166必须确认，不以局部章节列表猜完成数量，且不自动创建计划',()=>{
 const suggestion=P.suggestion({title:'课程',evidence:'任务点进度：51 / 166'});assert.equal(suggestion.completed,51);assert.equal(suggestion.total,166);
 assert.throws(()=>P.makeItems({total:166,completed:51}),/先核实/);
 const items=P.makeItems({total:166,completed:51,snapshotConfirmed:true});assert.equal(items.filter(x=>x.snapshot&&x.done).length,51);
 assert.equal(P.suggestion({title:'课程',evidence:'第1章 阅读 第2章 阅读'}),null);
 const task=validateOutput({tasks:[{title:'课程',workload:{total:166,completed:51,unit:'任务点',evidence:'51/166'},checklist:[],uncertain:[],plan:generate().plan}]})[0];
 assert.equal(task.plan,null);assert.equal(task.planSuggestion.completed,51);
});
test('未知截止允许自选计划日期但不回填截止；截图中的15号不会猜年份',()=>{
 const task=D.cleanTask({title:'15号前交8份报告',dateText:'15号前',deadlineKind:'pending'}),r=generate(8,{task});assert.deepEqual(r.errors,[]);assert.equal(task.dueAt,'');assert.equal(task.dueDate,'');assert.equal(P.suggestion(task).total,8);
 assert.ok(generate(1,{rules:{...rules,endDate:''}}).errors.length);
});
test('备份/迁移/通知更新保留计划及默认习惯，截止调整只标记需复核',()=>{
 const r=generate(),task=D.cleanTask({title:'大任务',plan:r.plan,executionStatus:'unsubmitted'});task.plan.confirmed=true;
 const state=D.validateBackup({version:2,tasks:[task],sources:[],changes:[],history:[],plannerPreferences:P.rules(rules)});assert.equal(state.tasks[0].plan.items.length,7);assert.deepEqual(state.plannerPreferences.excludedWeekdays,[0,6]);
 const change={taskId:task.id,baseUpdatedAt:task.updatedAt,sourceId:'notice',proposed:D.cleanTask({...task,plan:null,dueDate:'2026-11-20',deadlineKind:'date'}),status:'pending'};
 D.applyChange(state,change);assert.equal(state.tasks[0].plan.items.length,7);assert.equal(P.summary(state.tasks[0]).changed,true);
 assert.equal(D.cleanTask({title:'旧任务'}).plan,null);
 assert.throws(()=>D.cleanTask({title:'无效计划',plan:{items:[{title:'x',date:'wrong'}]}},{strict:true}),/计划数据/);
});
test('计划落后显示为执行风险而非伪造通知逾期，终态任务不再催办',()=>{
 const r=generate(),task=D.cleanTask({title:'大任务',plan:r.plan,executionStatus:'unsubmitted'});
 const risk=D.risks([task],new Date('2026-11-20T00:00:00Z'))[0];assert.ok(risk.reasons.some(x=>x.includes('不等同于通知已逾期')));
 for(const executionStatus of ['completed','pending_review','submitted'])assert.equal(D.risks([{...task,executionStatus}],new Date('2026-11-20T00:00:00Z')).length,0);
});
