'use strict';
const test=require('node:test'),a=require('node:assert/strict'),D=require('../public/domain'),T=require('../public/time'),W=require('../public/workbench'),I=require('../public/inbox-model');
const task=x=>D.cleanTask({title:'高数第三章习题',executionStatus:'unsubmitted',...x}),empty=()=>({version:2,tasks:[],sources:[],changes:[],history:[]});
test('首页把今天步骤、过去积压、未来截止及待提交分开，截止不冒充执行日期',()=>{
 const tasks=[task({id:'today',focusDate:'2026-11-02',estimatedHours:.5}),task({id:'future',dueDate:'2026-11-04'}),task({id:'backlog',focusDate:'2026-11-01'}),task({id:'submission',category:'实验报告',workCompleted:true})];
 const o=W.overview(tasks,{},'2026-11-02');a.deepEqual(o.todayItems.map(x=>x.task.id),['today']);a.equal(o.minutes,30);a.equal(o.backlog.length,1);a.equal(o.week.length,1);a.equal(o.pending[0].id,'submission');a.equal(o.load[2].minutes,0);a.equal(o.load[2].due,1);
});
test('负载不编造时长和容量，已完成步骤不计入；容量包含休息日限制',()=>{
 const t=task({plan:{items:[{id:'a',title:'阅读',date:'2026-11-02',minutes:30,done:false},{id:'b',title:'整理',date:'2026-11-02',minutes:30,done:true}]}});
 let d=W.dayLoad([t],{},'2026-11-02')[0];a.equal(d.minutes,30);a.equal(d.capacity,null);a.equal(d.overload,false);
 d=W.dayLoad([t],{advisorPreferences:{dailyMinutes:45},plannerPreferences:{excludedWeekdays:[1]}},'2026-11-02')[0];a.equal(d.capacity,0);a.equal(d.overload,true);
});
test('工作完成与已提交分离；最后一步完成后进入待提交，终态不再催办',()=>{
 const t=task({category:'实验报告'});W.finish(t);a.equal(t.executionStatus,'unsubmitted');a.equal(W.pendingSubmission(t),true);
 t.executionStatus='submitted';a.equal(W.pendingSubmission(t),false);
 const simple=task({title:'整理桌面',category:'校园事务'});W.finish(simple);a.equal(simple.executionStatus,'completed');
 const planned=task({plan:{items:[{title:'检查',done:true}]}});a.equal(W.pendingSubmission(planned),true);
});
test('快捷批量写入及撤销保留无关任务，关联更新保留原计划和工作状态',()=>{
 const s=empty(),old=task({id:'old',workCompleted:true,focusDate:'2026-11-02'}),other=task({id:'other',title:'英语'});s.tasks=[old,other];
 const r=I.save(s,[task({id:'new',title:'物理'})],[{id:'old',before:structuredClone(old),task:task({title:old.title,dueDate:'2026-11-10',deadlineKind:'date'})}],{id:'source',text:'延期通知'});
 a.equal(s.tasks.length,3);a.equal(s.tasks[0].workCompleted,true);a.equal(s.changes[0].status,'accepted');a.equal(s.history.length,1);
 s.tasks.find(t=>t.id==='other').title='英语新标题';I.undo(s,r);a.equal(s.tasks.length,2);a.equal(s.tasks.find(t=>t.id==='old').dueDate,'');a.equal(s.tasks.find(t=>t.id==='other').title,'英语新标题');a.equal(s.sources.length,0);a.equal(s.history.length,0);
});
test('撤销拒绝覆盖保存后的新修改；保存拒绝失效的对比和重复ID',()=>{
 const s=empty(),t=task({id:'one'}),r=I.save(s,[t],[],null);s.tasks[0].title='已编辑';a.throws(()=>I.undo(s,r),/已修改/);a.equal(s.tasks[0].title,'已编辑');
 a.throws(()=>I.save(structuredClone(s),[t],[],null),/已保存|已经保存/);
 a.throws(()=>I.save(structuredClone(s),[],[{id:t.id,before:t,task:t}],null),/已改变/);
});
test('无时间任务保存、备份及日常工作字段保留',()=>{
 const s=empty();I.save(s,[task({deadlineKind:'none',focusDate:'2026-11-02',workCompleted:true})],[],null);const loaded=D.validateBackup(JSON.parse(JSON.stringify(s)));a.equal(loaded.tasks[0].deadlineKind,'none');a.equal(loaded.tasks[0].workCompleted,true);a.equal(loaded.tasks[0].focusDate,'2026-11-02');
});
for(const [raw,due] of [['明晚10点之前提交','2026-11-03T22:00'],['下周三晚上10点截止','2026-11-11T22:00'],['今天晚上24:00前','2026-11-03T00:00']])test('相对日期保留明确时刻：'+raw,()=>{
 a.equal(T.resolve({dateText:raw}).dueAt,'');const result=T.resolve({dateText:raw},'2026-11-02T17:35','用户核实的通知原始发布时间');a.equal(result.dueAt,due);a.equal(result.dateConfirmed,false);a.equal(result.timeEvidence.baseSource,'用户核实的通知原始发布时间');
});
test('跨年24:00归一至次日，模糊下个月仍待核实',()=>{a.equal(T.resolve({dateText:'2026年12月31日24:00前提交'}).dueAt,'2027-01-01T00:00');a.equal(T.resolve({dateText:'下个月交'},'2026-11-02T10:00').deadlineKind,'pending');});
