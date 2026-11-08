'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../public/uncertainty'),D=require('../public/domain'),{validateOutput}=require('../ai');
function extracted(dateText){
 return validateOutput({tasks:[{title:'实验报告',dateText,checklist:[],uncertain:[],executionStatus:'unsubmitted'}]},dateText,'2026-11-08')[0];
}
test('缺少年份在预览中显式标为待确认，未逐项查看或未确认年份不可直接保存',()=>{
 const task=extracted('11月15日20:00前提交'),before=structuredClone(task);
 assert.ok(task.timeEvidence.yearInferred);assert.ok(U.hasIssues(task));
 assert.match(U.markup(task),/截止日期与时间 · 待确认/);assert.match(U.markup(task),/缺少年份/);
 assert.throws(()=>U.reviewedTask(task),/逐项查看/);
 assert.throws(()=>U.reviewedTask(task,{acknowledged:true}),/请选择/);
 assert.throws(()=>U.reviewedTask(task,{acknowledged:true,mode:'confirmed'}),/明确确认年份/);
 assert.deepEqual(task,before);
});
test('明确确认缺失年份或修改准确时间后可保存，不丢不确定标记及原文依据',()=>{
 const task=extracted('11月15日20:00前提交');
 const confirmed=U.reviewedTask(task,{acknowledged:true,mode:'confirmed',dateAcknowledged:true});
 assert.equal(confirmed.dueAt,task.dueAt);assert.equal(confirmed.dateConfirmed,true);
 assert.deepEqual(confirmed.uncertain,task.uncertain);assert.equal(confirmed.timeEvidence.raw,task.timeEvidence.raw);
 const changed=U.reviewedTask(task,{acknowledged:true,mode:'confirmed',dateAcknowledged:true,values:{dueAt:'2027-11-15T19:00',deadlineKind:'datetime'}});
 assert.equal(changed.dueAt,'2027-11-15T19:00');assert.equal(changed.timeEvidence.inferred,false);assert.equal(changed.timeEvidence.yearInferred,false);
});
test('缺少完整日期必须明确选择保留待确认；不制造当前日期或23:59',()=>{
 const task=extracted('请尽快提交实验报告');
 assert.equal(task.dueAt,'');assert.equal(task.dueDate,'');assert.ok(U.issues(task).some(item=>/完整日期/.test(item.message)));
 assert.throws(()=>U.reviewedTask(task,{acknowledged:true,mode:'confirmed',dateAcknowledged:true}),/完整日期/);
 const result=U.reviewedTask(task,{acknowledged:true,mode:'pending'});
 assert.equal(result.deadlineKind,'pending');assert.equal(result.dueAt,'');assert.equal(result.dueDate,'');assert.equal(result.startsAt,'');assert.equal(result.dateConfirmed,false);
 assert.deepEqual(result.uncertain,task.uncertain);assert.equal(result.timeEvidence.verification,'pending');
});
test('明确保留待确认会清除AI建议截止和开始时间，避免猜测日期落库',()=>{
 const task={...extracted('11月15日20:00前提交'),startsAt:'2026-11-15T18:00'};
 const result=U.reviewedTask(task,{acknowledged:true,mode:'pending'});
 assert.equal(result.dueAt,'');assert.equal(result.dueDate,'');assert.equal(result.startsAt,'');
 assert.equal(result.timeEvidence.inferred,false);assert.equal(result.timeEvidence.confirmed,false);assert.ok(task.dueAt);
});
test('删掉uncertain文本仍不能绕过待核实日期；完整日期无效也不能确认保存',()=>{
 const task={...extracted('11月15日20:00前提交'),uncertain:[]};
 assert.ok(U.hasIssues(task));assert.match(U.markup(task),/年份尚未人工核实/);
 assert.throws(()=>U.reviewedTask(task,{acknowledged:true,mode:'confirmed',dateAcknowledged:true,values:{dueAt:'2026-02-30T12:00'}}),/日期格式无效/);
 const pending=D.cleanTask({title:'无日期',deadlineKind:'pending',uncertain:[]});assert.ok(U.hasIssues(pending));
});
test('仅日期与活动开始分别保留精度，确认仅日期不补具体时刻',()=>{
 const date=extracted('11月15日前提交');
 const result=U.reviewedTask(date,{acknowledged:true,mode:'confirmed',dateAcknowledged:true});
 assert.equal(result.deadlineKind,'date');assert.equal(result.dueAt,'');assert.ok(result.dueDate);assert.equal(result.timeEvidence.verification,'date_only');
 const activity=D.cleanTask({title:'讲座',startsAt:'2026-12-01T10:00',deadlineKind:'none',uncertain:[]});
 assert.ok(U.issues(activity).some(item=>item.field==='startsAt'));
 const reviewed=U.reviewedTask(activity,{acknowledged:true,mode:'confirmed',dateAcknowledged:true});
 assert.equal(reviewed.startsAt,activity.startsAt);assert.equal(reviewed.dueAt,'');assert.equal(reviewed.dateConfirmed,true);
});
test('课程、地点、状态等疑点可见并需确认；无AI的无日期手动任务无需弹窗',async()=>{
 const task=D.cleanTask({title:'手动记录',deadlineKind:'none',uncertain:['课程名称被截断','活动地点不清楚','任务状态不确定']});
 assert.deepEqual(U.issues(task).map(item=>item.field),['course','location','executionStatus']);
 assert.throws(()=>U.reviewedTask(task),/逐项查看/);
 const result=U.reviewedTask(task,{acknowledged:true,values:{course:'大学物理',location:'实验楼101'}});
 assert.equal(result.course,'大学物理');assert.equal(result.location,'实验楼101');assert.equal(result.dateConfirmed,false);
 const manual=D.cleanTask({title:'手动记录',deadlineKind:'none'});assert.equal(U.hasIssues(manual),false);
 assert.deepEqual(await U.confirmTasks([manual]),[manual]);
});
test('不确定信息中的HTML始终转义，不允许在预览注入代码',()=>{
 const task=D.cleanTask({title:'任务',deadlineKind:'none',uncertain:['<img src=x onerror="alert(1)">地点待确认']});
 const html=U.markup(task);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&quot;'));
});
test('取消核对不修改输入任务，也不会将任何疑点标为已确认',async t=>{
 const previous=global.document,task=extracted('11月15日20:00前提交'),before=structuredClone(task),events=new Map(),cancel={};
 const form={};
 const dialog={open:false,innerHTML:'',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),querySelectorAll:selector=>selector==='[data-uncertainty-cancel]'?[cancel]:[],querySelector:selector=>selector==='form'?form:null,showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();}};
 global.document={querySelector:selector=>selector==='#uncertaintyDialog'?dialog:null};
 t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
 const pending=U.confirmTasks([task]);assert.equal(dialog.open,true);cancel.onclick();assert.equal(await pending,null);assert.deepEqual(task,before);assert.equal(dialog.open,false);
});
