import { IndexedDbStorage } from './indexedDbStorage';
import { BrowserSkillFiles } from './browserSkillFiles';
import { mockRunner } from './mockRunner';
import type { AppPorts } from '../ports';
import { LocalCodexBridge } from './localCodexBridge';
export function createPorts(): AppPorts {
  const storage = new IndexedDbStorage();
  return { storage, files: new BrowserSkillFiles(storage), runner: mockRunner, codex: new LocalCodexBridge(), defaultCodexMode: import.meta.env.MODE === 'test' ? 'mock' : 'real' };
}
