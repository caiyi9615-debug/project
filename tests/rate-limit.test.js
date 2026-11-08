'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../server');

test('Render throttles separate clients independently using first forwarded IP',async()=>{
 const previous=process.env.RENDER;
 process.env.RENDER='true';
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(ip)=>fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':ip+', 10.0.0.5'},body:'{}'});
 try{
  for(let i=0;i<8;i++)assert.equal((await request('198.51.100.10')).status,400);
  assert.equal((await request('198.51.100.10')).status,429);
  assert.equal((await request('198.51.100.11')).status,400);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(previous===undefined)delete process.env.RENDER;else process.env.RENDER=previous;
 }
});

test('Outside Render forwarded IP is ignored for throttling',async()=>{
 const previous=process.env.RENDER;
 delete process.env.RENDER;
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(let i=0;i<8;i++){
   const result=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`198.51.100.${i+1}`},body:'{}'});
   assert.equal(result.status,400);
  }
  const blocked=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.99'},body:'{}'});
  assert.equal(blocked.status,429);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(previous===undefined)delete process.env.RENDER;else process.env.RENDER=previous;
 }
});
