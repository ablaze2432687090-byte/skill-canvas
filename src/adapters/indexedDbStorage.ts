import type { StorageBridge, StorageMutation } from '../ports';
export const DATABASE_NAME = 'skill-canvas-local';
export class IndexedDbStorage implements StorageBridge {
  private namespace='';
  async useNamespace(id:string,migrateLegacy=false){
    if(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id))throw Error('数据缓存身份无效。');
    const prefix='dataset:'+id+':',db=await this.open();
    if(migrateLegacy)await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('缓存迁移未完成。'));tx.onerror=()=>reject(tx.error);
      const check=store.get(prefix+'app-state');check.onsuccess=()=>{if(check.result!==undefined)return;const request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const key=String(cursor.key);if(!key.startsWith('dataset:')){store.put(cursor.value,prefix+key);cursor.delete();}cursor.continue();};};
    });
    this.namespace=prefix;
  }
  private connection?: Promise<IDBDatabase>;
  private open() {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.connection = undefined; }; resolve(request.result); };
      request.onerror = () => { this.connection = undefined; reject(request.error); };
      request.onblocked = () => { this.connection = undefined; reject(new Error('本地存储被其他窗口占用，请关闭旧窗口后重试。')); };
    });
    return this.connection;
  }
  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('records').objectStore('records').get(this.namespace+key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  set(key: string, value: unknown) { return this.batch([{ key, value }]); }
  remove(key: string) { return this.batch([{ key, remove: true }]); }
  async batch(changes: StorageMutation[]) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('records', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('本地保存未完成。'));
      try { for (const change of changes) change.remove ? transaction.objectStore('records').delete(this.namespace+change.key) : transaction.objectStore('records').put(change.value, this.namespace+change.key); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }
  async entries<T>(prefix: string): Promise<[string, T][]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const result: [string, T][] = [];
      const scoped=this.namespace+prefix;
      const request = db.transaction('records').objectStore('records').openCursor(IDBKeyRange.bound(scoped, `${scoped}\uffff`));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const cursor = request.result; if (!cursor) return resolve(result); result.push([String(cursor.key).slice(this.namespace.length), cursor.value]); cursor.continue(); };
    });
  }
}
