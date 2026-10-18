import type { CodexBridge, CodexConnectionStatus, CodexCapabilities, CodexTaskHandle, CompiledCodexTask, ReferenceUpload } from '../../bridge/protocol/task';
export class LocalCodexBridge implements CodexBridge {
  private token = '';
  private base = 'http://127.0.0.1:4717';
  private async request(route: string, init: RequestInit = {}, retried = false): Promise<Response> {
    if (window.skillCanvasDesktop) { const config = await window.skillCanvasDesktop.connection(); this.base = config.base; this.token = config.token; }
    if (!this.token) {
      const response = await fetch(`${this.base}/session`, { signal: AbortSignal.timeout(5000) }).catch(() => { throw new Error(window.skillCanvasDesktop ? '本地服务未连接，请重新启动 Bridge。' : '本地 Bridge 未启动，请运行启动脚本后重新检测。'); });
      if (!response.ok) throw new Error('无法建立本地 Bridge 会话。'); this.token = (await response.json()).token;
    }
    const response = await fetch(this.base + route, { ...init, signal: init.signal || AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', 'X-Skill-Canvas-Token': this.token, ...init.headers } });
    if (response.status === 401 && !retried) { this.token = ''; return this.request(route, init, true); }
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error?.message || '本地 Bridge 请求失败。'); }
    return response;
  }
  async listSkills(): Promise<import('../domain/skill').SkillManifest[]> { return (await this.request('/skills')).json(); }
  async manageSkill(action: string, input: Record<string, unknown>): Promise<unknown> { return (await this.request(`/skill-management/${action}`, { method: 'POST', body: JSON.stringify(input), signal: AbortSignal.timeout(180000) })).json(); }
  async listProjects(): Promise<{ id: string; archived?: boolean; tasks: CodexTaskHandle[] }[]> { return (await this.request('/projects?includeArchived=true')).json(); }
  async archiveProject(id: string) { await this.request(`/projects/${id}`, { method: 'DELETE' }); }
  async deleteProject(id:string){await this.request(`/projects/${id}`,{method:'DELETE'});}
  async updateProjectMetadata(id:string,patch:{title?:string;groupId?:string|null;tags?:string[];customCover?:string|null}){await this.request(`/projects/${id}`,{method:'PATCH',body:JSON.stringify(patch)});}
  async getReference(id: string, imageId: string): Promise<Blob> { return (await this.request(`/tasks/${id}/references/${imageId}`)).blob(); }
  async retryTask(id: string): Promise<CodexTaskHandle> { return (await this.request(`/tasks/${id}/retry`, { method: 'POST' })).json(); }
  async getStatus(): Promise<CodexConnectionStatus> { return (await this.request('/status')).json(); }
  async getCapabilities(): Promise<CodexCapabilities> { return (await this.request('/capabilities')).json(); }
  async createTask(task: CompiledCodexTask, references: ReferenceUpload[]): Promise<CodexTaskHandle> { return (await this.request('/tasks', { method: 'POST', body: JSON.stringify({ task, references }) })).json(); }
  async cancelTask(id: string): Promise<CodexTaskHandle> { return (await this.request(`/tasks/${id}/cancel`, { method: 'POST' })).json(); }
  async enqueueTask(id:string):Promise<CodexTaskHandle>{return (await this.request(`/tasks/${id}/enqueue`,{method:'POST'})).json();}
  async resumeTask(id: string): Promise<CodexTaskHandle> { return (await this.request(`/tasks/${id}/resume`, { method: 'POST' })).json(); }
  async getOutput(id: string, outputId: string): Promise<Blob> { return (await this.request(`/tasks/${id}/outputs/${encodeURIComponent(outputId)}`)).blob(); }
  async removeTask(id: string) { await this.request(`/tasks/${id}`, { method: 'DELETE' }); }
  subscribe(id: string, listener: (task: CodexTaskHandle) => void, onError: (error: Error) => void): () => void {
    const controller = new AbortController(); let retry: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    // SSE is primary; a quiet reconciliation also covers missed terminal events.
    let reconciling = false;
    const reconcile = setInterval(async () => {
      if (controller.signal.aborted || reconciling) return;
      reconciling = true;
      try { const response = await this.request(`/tasks/${id}`, { signal: controller.signal }); if (!controller.signal.aborted) listener(await response.json()); }
      catch { /* The live stream reports connection errors; do not multiply notices. */ }
      finally { reconciling = false; }
    }, 15000);
    const connect = async () => {
      try {
        const response = await this.request(`/tasks/${id}/events`, { signal: controller.signal });
        const reader = response.body!.getReader(), decoder = new TextDecoder(); let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read(); if (done) throw new Error('任务状态连接已中断。');
          buffer += decoder.decode(value, { stream: true }); let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = frame.split('\n').find(line => line.startsWith('data: '));
            if (data) { listener(JSON.parse(data.slice(6))); attempts = 0; }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) { onError(error instanceof Error ? error : new Error('事件连接中断')); if (++attempts <= 3) retry = setTimeout(() => void connect(), 1000 * 2 ** attempts); }
      }
    };
    void connect(); return () => { controller.abort(); clearTimeout(retry); clearInterval(reconcile); };
  }
}
