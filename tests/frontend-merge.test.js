'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../public/domain'),T=require('../public/time'),P=require('../public/planner');
test('合并：人工确认的真实日期修正证据显示，保留计划和快照建议',()=>{
 const plan=P.generate({items:P.makeItems({total:3}),rules:{startDate:'2028-11-01',endDate:'2028-11-15'},today:'2026-10-26'}).plan;
 const t=D.cleanTask({title:'回归任务',dueAt:'2028-11-15T12:00',dateConfirmed:true,timeEvidence:{verification:'pending'},plan,planSuggestion:{total:3,unit:'项',completed:0}});
 assert.equal(t.timeEvidence.type,'manual');assert.equal(t.timeEvidence.verification,'confirmed');assert.equal(t.timeEvidence.precision,'分钟');assert.match(t.timeEvidence.method,/用户直接填写/);assert.equal(t.plan.items.length,3);assert.equal(t.planSuggestion.total,3);
});
test('合并：无日期不冒充精确时间，推算依据不因人工确认被抹去',()=>{
 const empty=D.cleanTask({title:'无日期',dateConfirmed:true});assert.notEqual(empty.timeEvidence.precision,'分钟');assert.notEqual(empty.timeEvidence.type,'manual');
 const estimated=D.cleanTask({title:'已核实推算值',dueAt:'2028-11-15T12:00',dateConfirmed:true,dateText:'剩余111小时',timeEvidence:{type:'duration',inferred:true,precision:'小时取整',method:'截图基准＋时长',verification:'estimated'}});
 assert.equal(estimated.timeEvidence.inferred,true);assert.equal(estimated.timeEvidence.precision,'小时取整');assert.equal(estimated.timeEvidence.method,'截图基准＋时长');
});
test('合并：本周五保留自然周含义，不为了避免逾期顺延至下周',()=>{
 const t=T.resolve({dateText:'本周五之前提交'},'2026-10-25T17:35');assert.equal(t.dueDate,'2026-10-23');assert.equal(t.dateConfirmed,false);
 assert.equal(T.resolve({dateText:'下周五之前提交'},'2026-10-25T17:35').dueDate,'2026-10-30');
});
