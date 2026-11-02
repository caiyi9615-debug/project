'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../public/sw.js'),'utf8');
function worker(task){
 const handlers={},shown=[];
 const indexedDB={open(){const r={};queueMicrotask(()=>{r.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={objectStore(){return {get(){const get={};queueMicrotask(()=>{get.result={tasks:task?[task]:[]};get.onsuccess();tx.oncomplete?.();});return get;}};}};return tx;}};r.onsuccess();});return r;}};
 const self={addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{},location:{origin:'https://test.example'}};
 vm.runInNewContext(code,{self,indexedDB,URL,Date});
 async function push(m){let done;handlers.push({data:{json:()=>m},waitUntil:p=>done=p});await done;}
 return {shown,push};
}
test('关闭页面的Service Worker：只显示仍未提交且截止未改的本地任务通知',async()=>{
 const task={id:'one',dueAt:'2026-10-30T12:00',dateConfirmed:true,executionStatus:'unsubmitted'};
 const w=worker(task);await w.push({taskId:'one',dueAt:task.dueAt,title:'提醒',expires:Date.now()+60000});assert.equal(w.shown.length,1);
 for(const t of [null,{...task,executionStatus:'completed'},{...task,executionStatus:'pending_review'},{...task,dateConfirmed:false},{...task,dueAt:'2026-11-01T12:00'}]){
  const w=worker(t);await w.push({taskId:'one',dueAt:task.dueAt,expires:Date.now()+60000});assert.equal(w.shown.length,0);
 }
});
test('Service Worker丢弃过期通知，允许不关联任务的测试通知',async()=>{
 const w=worker(null);await w.push({title:'过期',expires:Date.now()-1});assert.equal(w.shown.length,0);
 await w.push({title:'测试',expires:Date.now()+60000});assert.equal(w.shown.length,1);
});
