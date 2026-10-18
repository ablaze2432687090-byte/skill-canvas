import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskManager} from '../../bridge/server/tasks.mjs';

test('归档旧案例默认隐藏；同步可读取明确归档标记，不传输归档原图',async()=>{
 const projects=[{id:'cover',tasks:[{taskId:'cover'}]},{id:'new-case',tasks:[{taskId:'new-case'}]},{id:'old-case',archived:true,tasks:[{taskId:'old-case',result:{outputs:[{path:'keep-original.png'}]}}]}];
 const manager={projects:{all:async()=>projects},tasks:new Map(),public:task=>({taskId:task.taskId})};
 assert.deepEqual((await TaskManager.prototype.projectList.call(manager)).map(p=>p.id),['cover','new-case']);
 const synced=await TaskManager.prototype.projectList.call(manager,true);assert.equal(synced[2].archived,true);assert.deepEqual(synced[2].tasks,[]);assert.equal(projects[2].tasks[0].result.outputs[0].path,'keep-original.png');
});
