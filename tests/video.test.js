'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createServer}=require('../server');
test('演示视频支持正确媒体类型、拖动进度、HEAD、后缀范围及无效范围',async()=>{
 const file=path.resolve(__dirname,'../public/media/deadline-hunter-demo.mp4'),size=fs.statSync(file).size,handle=fs.openSync(file,'r'),head=Buffer.alloc(16);fs.readSync(handle,head,0,16,0);fs.closeSync(handle);
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  let response=await fetch(base+'/media/deadline-hunter-demo.mp4',{headers:{Range:'bytes=0-15'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(response.headers.get('accept-ranges'),'bytes');assert.equal(response.headers.get('content-range'),`bytes 0-15/${size}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),head);
  response=await fetch(base+'/media/deadline-hunter-demo.mp4',{method:'HEAD'});assert.equal(response.status,200);assert.equal(Number(response.headers.get('content-length')),size);assert.equal((await response.arrayBuffer()).byteLength,0);
  response=await fetch(base+'/media/deadline-hunter-demo.mp4',{headers:{Range:'bytes=-16'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${size-16}-${size-1}/${size}`);assert.equal((await response.arrayBuffer()).byteLength,16);
  for(const range of [`bytes=${size}-`,'bytes=4-3','bytes=-0','bytes=0-1,4-5','bytes=-','wrong']){response=await fetch(base+'/media/deadline-hunter-demo.mp4',{headers:{Range:range}});assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),`bytes */${size}`);}
  assert.equal((await fetch(base+'/media/demo-poster.jpg')).headers.get('content-type'),'image/jpeg');assert.equal((await fetch(base+'/media/demo-captions.vtt')).headers.get('content-type'),'text/vtt; charset=utf-8');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
