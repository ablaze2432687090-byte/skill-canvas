import type { CodexBridge, CodexTaskHandle, CompiledCodexTask } from '../../bridge/protocol/task';
export class MockCodexBridge implements CodexBridge {
  private tasks = new Map<string, CodexTaskHandle>();
  async getStatus() { return { connected: false, version: null, model: null, models: [], authenticated: false, bridge: 'unavailable' as const, checkedAt: new Date().toISOString() }; }
  async getCapabilities() { return { automaticImageGeneration: false, reason: 'Mock 仅用于交互测试。', testedAt: null, fallback: 'confirmation_handoff' as const }; }
  async createTask(task: CompiledCodexTask) { const handle: CodexTaskHandle = { taskId: task.taskId, projectId: task.projectId, threadId: null, turnId: null, stage: 'submitted', sequence: 0, text: '', instruction: task.instruction, workspace: '', action: task.action, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.tasks.set(task.taskId, handle); return handle; }
  subscribe(id: string, listener: (task: CodexTaskHandle) => void) { const timer = setTimeout(() => { const task = this.tasks.get(id); if (task) listener({ ...task, stage: 'waiting', text: 'Mock 不会实际生成图片。' }); }, 100); return () => clearTimeout(timer); }
  async cancelTask(id: string) { const task = this.tasks.get(id)!; task.stage = 'cancelled'; return task; }
  async resumeTask(id: string) { return this.tasks.get(id)!; }
  async getOutput(): Promise<Blob> { throw new Error('Mock 没有真实输出。'); }
  async removeTask(id: string) { this.tasks.delete(id); }
}
