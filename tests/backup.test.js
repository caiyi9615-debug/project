'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../public/backup'),D=require('../public/domain');
const task=(id,extra={})=>D.cleanTask({id,title:id,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...extra});
const state=(tasks=[])=>({version:2,tasks,sources:[],changes:[],history:[],theme:'light'});
test('旧 V2 备份校验及摘要兼容仅日期、精确日期和未知日期',()=>{
  const old=state([task('a',{dueDate:'2026-11-09',deadlineKind:'date'}),task('b',{dueAt:'2026-12-01T12:00'}),task('c')]);
  assert.deepEqual(B.summary(B.parse(JSON.stringify(old))),{count:3,earliest:'2026-11-09',latest:'2026-12-01'});
  assert.deepEqual(B.summary(state()),{count:0,earliest:'',latest:''});
  assert.throws(()=>B.parse(JSON.stringify({...old,version:1})),/V2/);
  assert.throws(()=>B.parse(JSON.stringify(state([task('a'),task('a')]))),/重复/);
});
test('合并保留现有偏好、任务和两份同 ID 冲突，重连通知、变更和历史',()=>{
  const current=state([task('a')]);current.sources=[{id:'s',text:'原通知'}];
  const incoming=state([task('a',{title:'另一份任务',sourceId:'s',sourceIds:['s']})]);
  incoming.theme='dark';incoming.sources=[{id:'s',text:'备份通知'}];
  incoming.changes=[{id:'c',taskId:'a',sourceId:'s',status:'pending',before:incoming.tasks[0],proposed:incoming.tasks[0]}];
  incoming.history=[{id:'h',taskId:'a',sourceId:'s',before:incoming.tasks[0],after:incoming.tasks[0]}];
  const before=structuredClone({current,incoming}),merged=B.prepare(current,incoming,'merge');
  assert.equal(merged.tasks.length,2);assert.deepEqual(merged.tasks[0],current.tasks[0]);assert.equal(merged.theme,'light');
  const added=merged.tasks[1];assert.notEqual(added.id,'a');assert.notEqual(added.sourceId,'s');
  assert.equal(added.sourceIds[0],added.sourceId);
  for(const row of [...merged.changes,...merged.history]){assert.equal(row.taskId,added.id);assert.equal(row.sourceId,added.sourceId);assert.equal(row.before.id,added.id);}
  assert.equal(merged.changes[0].proposed.id,added.id);assert.equal(merged.history[0].after.id,added.id);
  assert.deepEqual({current,incoming},before);
});
test('合并相同备份不重复，合并超过条目上限失败且不改变原数据',()=>{
  const current=state([task('a')]);assert.equal(B.prepare(current,current,'merge').tasks.length,1);
  const big=state(Array.from({length:5000},(_,i)=>task('t'+i))),snapshot=structuredClone(current);
  assert.throws(()=>B.prepare(current,big,'merge'),/条目过多/);assert.deepEqual(current,snapshot);
});
test('替换完整恢复备份而不修改输入对象，空备份也可显式替换',()=>{
  const current=state([task('old')]),incoming={...state([task('new')]),theme:'dark',plannerPreferences:{dailyHours:2}};
  const snapshot=structuredClone({current,incoming}),next=B.prepare(current,incoming,'replace');
  assert.deepEqual(next,incoming);assert.deepEqual({current,incoming},snapshot);
  assert.deepEqual(B.prepare(current,state(),'replace'),state());
});
test('损坏 JSON、错误日期、通知和历史格式均拒绝，不改变当前数据',()=>{
  const current=state([task('safe')]),snapshot=structuredClone(current);
  const corrupt=['{',JSON.stringify({...state(),tasks:[{title:'坏日期',dueAt:'garbage'}]}),JSON.stringify({...state(),sources:[{id:'s',text:3}]}),JSON.stringify({...state(),history:[{id:'h',taskId:'a'}]}),JSON.stringify({...state(),changes:[{id:'c',taskId:'a',status:'pending',proposed:task('a')}]} )];
  for(const text of corrupt){assert.throws(()=>B.prepare(current,B.parse(text),'replace'));assert.deepEqual(current,snapshot);}
});
test('提醒在七天或十条变更触发，偏好改变不计数，任务新增修改删除计数',()=>{
  const now=Date.parse('2026-11-08T00:00:00Z'),meta={lastExportAt:'2026-11-01T00:00:00Z',changes:0};
  assert.equal(B.due(meta,1,now-1),false);assert.equal(B.due(meta,1,now),true);
  assert.equal(B.due({...meta,lastExportAt:new Date(now).toISOString(),changes:10},1,now),true);
  assert.equal(B.due({changes:0},1,now),true);assert.equal(B.due({changes:10},0,now),false);
  const a=task('a');assert.equal(B.changed([a],[a]),0);assert.equal(B.changed([a],[{...a,title:'修改'},task('b')]),2);assert.equal(B.changed([a],[]),1);
});
