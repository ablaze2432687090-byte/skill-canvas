const terminal=new Set(['completed','failed','cancelled','interrupted','waiting']);
export class TaskQueue {
 constructor({limit=2,start,failed,queued}){
  if(!Number.isInteger(limit)||limit<1||limit>4)throw Error('并发上限须为 1–4。');
  this.limit=limit;this.start=start;this.failed=failed;this.queued=queued;this.running=new Set();this.groups=new Map();this.pending=[];this.paused=false;
 }
 setLimit(limit){if(!Number.isInteger(limit)||limit<1||limit>4)throw Error('并发上限须为 1–4。');this.limit=limit;this.drain();}
 async enqueue(record){
  if(terminal.has(record.stage)||this.running.has(record.taskId)||this.pending.some(t=>t.taskId===record.taskId))return;
  if(this.paused)record.queuePaused=true;
  if(this.running.size>=this.limit||this.paused||record.projectId&&[...this.groups.values()].includes(record.projectId)){record.stage='queued';await this.queued(record);}
  this.pending.push(record);this.drain();
 }
 restore(record){record.stage='queued';record.queuePaused=true;if(!this.pending.some(t=>t.taskId===record.taskId))this.pending.push(record);}
 pause(){this.paused=true;for(const record of this.pending)record.queuePaused=true;}
 async resume(record){record.queuePaused=false;this.paused=false;if(!this.pending.some(t=>t.taskId===record.taskId)){record.stage='preparing';await this.enqueue(record);}else{await this.queued(record);this.drain();}}
 remove(id){this.pending=this.pending.filter(record=>record.taskId!==id);}
 release(id){this.running.delete(id);this.groups.delete(id);this.drain();}
 drain(){
  if(this.paused)return;
  while(this.running.size<this.limit){const index=this.pending.findIndex(record=>!record.queuePaused&&!terminal.has(record.stage)&&(!record.projectId||![...this.groups.values()].includes(record.projectId)));if(index<0)break;const [record]=this.pending.splice(index,1);this.running.add(record.taskId);if(record.projectId)this.groups.set(record.taskId,record.projectId);void Promise.resolve().then(()=>this.start(record)).catch(error=>this.failed(record,error));}
 }
 snapshot(){return {limit:this.limit,running:[...this.running],queued:this.pending.map(t=>({taskId:t.taskId,paused:!!t.queuePaused})),paused:this.paused};}
}
