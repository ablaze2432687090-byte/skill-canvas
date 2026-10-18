import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskQueue} from '../../bridge/server/taskQueue.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('same-project turns serialize even when other projects may run concurrently',async()=>{
 const started=[],queue=new TaskQueue({limit:3,start:async record=>started.push(record.taskId),queued:async()=>{},failed:async()=>{}});
 await queue.enqueue({taskId:'a1',projectId:'a',stage:'preparing'});await queue.enqueue({taskId:'a2',projectId:'a',stage:'preparing'});await queue.enqueue({taskId:'b1',projectId:'b',stage:'preparing'});await tick();assert.deepEqual(started,['a1','b1']);assert.equal(queue.pending[0].stage,'queued');queue.release('a1');await tick();assert.deepEqual(started,['a1','b1','a2']);
});
function fixture(limit=1){const started=[],saved=[],failed=[];const queue=new TaskQueue({limit,start:async record=>started.push(record.taskId),queued:async record=>saved.push(record.taskId),failed:async(record,error)=>failed.push(error)});return {queue,started,saved,failed};}
test('concurrency slots remain occupied until a true terminal release, not turn/start response',async()=>{
 const {queue,started,saved}=fixture();await queue.enqueue({taskId:'one',stage:'preparing'});await queue.enqueue({taskId:'two',stage:'preparing'});await tick();assert.deepEqual(started,['one']);assert.deepEqual(saved,['two']);queue.release('one');await tick();assert.deepEqual(started,['one','two']);assert.equal(queue.running.size,1);
});
test('cancelling queued work never starts it or creates an execution slot',async()=>{
 const {queue,started}=fixture();await queue.enqueue({taskId:'one',stage:'preparing'});await queue.enqueue({taskId:'two',stage:'preparing'});queue.remove('two');queue.release('one');await tick();assert.deepEqual(started,['one']);assert.equal(queue.pending.length,0);
});
test('restarted or disconnected queue needs an explicit resume; changing limits is not consent',async()=>{
 const {queue,started}=fixture(),record={taskId:'restored',stage:'queued'};queue.restore(record);queue.setLimit(4);await tick();assert.deepEqual(started,[]);await queue.resume(record);await tick();assert.deepEqual(started,['restored']);
 const next={taskId:'next',stage:'preparing'};queue.pause();await queue.enqueue(next);queue.release('restored');queue.setLimit(2);await tick();assert.deepEqual(started,['restored']);await queue.resume(next);await tick();assert.deepEqual(started,['restored','next']);
});
test('hundreds of pending jobs cannot exceed the configured cap',async()=>{
 const {queue,started}=fixture(4);for(let i=0;i<500;i++)await queue.enqueue({taskId:String(i),stage:'preparing'});await tick();assert.equal(started.length,4);assert.equal(queue.pending.length,496);for(let i=0;i<10;i++){queue.release(String(i));await tick();assert.equal(queue.running.size,4);}assert.equal(started.length,14);assert.throws(()=>queue.setLimit(0));assert.throws(()=>queue.setLimit(5));
});
