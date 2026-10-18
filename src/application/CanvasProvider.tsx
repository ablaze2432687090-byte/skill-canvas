import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppPorts, RootSnapshot } from '../ports';
import type { AppSettings, ParameterValue, SkillManifest, SkillRoot } from '../domain/skill';
import { defaultSettings } from '../domain/skill';
import type { CanvasProject, Draft, Generation, ReferenceImage, Skill } from '../domain/types';
import { defaultDraft, demoGenerations } from '../fixtures/demoGenerations';
import { adaptSkill } from '../../bridge/protocol/skillProfiles';
import { applySkillParameters, demoManifests, toSkillView } from './skillViews';
import { validateGenerationDraft } from '../domain/generationValidation';
import { scanSkillSnapshots } from './scanSkills';
import { compileCodexTask } from './codexTaskCompiler';
import type { CodexCapabilities, CodexConnectionStatus, CodexTaskHandle } from '../../bridge/protocol/task';
import { terminalStages } from '../../bridge/protocol/task';
import { desktopSourceFiles } from '../adapters/desktopFiles';
import { createShowcaseProjects, latestShowcaseProjects } from './showcase';
import { mergeBridgeCatalog } from './bridgeCatalog';
import { applyTheme, normalizeTheme } from './theme';
import { applyLanguage, getLanguage, normalizeLanguage } from './i18n';
import {defaultCustomization,validateCustomization,type Customization,type SkillOverride,type PersonalMedia} from '../domain/customization';
import {applyDefaultImageLanguage} from './defaultPreferences';
import {personalizeSkill,mergeSkillOverride} from './customization';
import {rebaseState} from './rebaseState';
import {thumbnail} from './thumbnail';
import {executionManifest} from '../../bridge/protocol/executionManifest';

interface PersistedState { schema: 2;dataRoot?:string;groupMetadataVersion?:1;importedSnapshot?:string; settings: AppSettings; manifests: SkillManifest[]; projects: CanvasProject[]; activeProjectId: string | null; projectGroups?:{id:string;name:string}[] }
type SaveState = 'saved' | 'saving' | 'failed';
interface CanvasState {
  getAsset:(key:string,preview?:boolean)=>Promise<string>;
  prepareDraftBackup:(progress?:(completed:number,total:number)=>void)=>Promise<string>;
  personal:Customization;personalReady:boolean;savePersonal:(change:(value:Customization)=>Customization)=>Promise<void>;updateSkillDisplay:(id:string,patch:Partial<SkillOverride>)=>Promise<void>;uploadPersonalMedia:(file:File)=>Promise<PersonalMedia>;getPersonalMedia:(id:string)=>Promise<string>;
  renameProjectGroup:(id:string,name:string)=>Promise<void>;moveProjectGroup:(id:string,offset:number)=>Promise<void>;
  projectGroups:{id:string;name:string}[];addProjectGroup:(name:string)=>Promise<void>;removeProjectGroup:(id:string)=>Promise<void>;
  updateProjectMetadata:(id:string,patch:{title?:string;groupId?:string|null;tags?:string[];customCover?:string|null})=>Promise<void>;copyProject:(id:string)=>Promise<string>;
  refreshView: () => Promise<void>;
  generateShowcase: (id: string) => Promise<void>;
  showcaseForSkill: (id: string) => CanvasProject[];
  manageSkill: (action: string, input: Record<string, unknown>) => Promise<unknown>;
  codexStatus: CodexConnectionStatus | null; codexCapabilities: CodexCapabilities | null; checkCodex: () => Promise<void>; testCodex: () => Promise<string>; restoreCodexTask: (id: string) => Promise<void>; cleanCodexTask: (id: string) => Promise<void>;
  enqueueTask:(id:string)=>Promise<void>;
  retryTask: (id: string) => Promise<string>; originalOutput: (taskId: string, outputId: string) => Promise<Blob>;
  ready: boolean; error: string; saveState: SaveState; savingMessage: string; scanning: boolean;
  settings: AppSettings; skills: Skill[]; manifests: SkillManifest[]; projects: CanvasProject[]; activeProject: CanvasProject | undefined;
  draft: Draft; generations: Generation[]; findSkill: (id: string) => Skill | undefined;
  updateDraft: (patch: Partial<Draft>) => void; updateParameter: (id: string, value: ParameterValue) => void;
  selectSkill: (id: string) => void; ensureProject: () => void; openProject: (id: string) => void; deleteProject: (id: string) => Promise<void>;
  compilePrompt: (draft?: Draft) => string; startTask: (draft?: Draft) => Promise<string>; finishTask: (id: string) => void; cancelTask: (id: string) => Promise<void>;
  resumeDraft: (generation: Generation, instruction?: string, outputId?: string) => Draft; addReferences: (files: File[], replaceId?: string) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void; addRoot: () => Promise<void>; importRoot: (files: File[], replaceId?: string) => Promise<void>;
  scanRoots: () => Promise<void>; authorizeRoot: (root: SkillRoot) => Promise<void>; removeRoot: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => void; chooseExportFolder: () => Promise<void>; saveExport: (blob: Blob, name: string) => Promise<void>; retrySave: () => Promise<void>;
}
const CanvasContext = createContext<CanvasState | null>(null);
const initialState = (): PersistedState => ({ schema: 2, settings: structuredClone(defaultSettings), manifests: structuredClone(demoManifests), projects: [], activeProjectId: null });
const cleanDraft = (draft: Draft): Draft => ({ ...draft, references: draft.references.map(image => ({ ...image, url: image.assetId ? '' : image.url })) });
function cleanState(state: PersistedState): PersistedState {
  return { ...state, projects: state.projects.map(project => ({ ...project, draft: cleanDraft(project.draft), generations: project.generations.map(task => ({ ...task, draft: cleanDraft(task.draft) })) })) };
}

export function CanvasProvider({ children, ports }: { children: ReactNode; ports: AppPorts }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [personal,setPersonal]=useState<Customization>(defaultCustomization),[personalReady,setPersonalReady]=useState(false);
  const personalRef=useRef(personal),personalQueue=useRef(Promise.resolve()),mediaPromises=useRef(new Map<string,Promise<string>>()),personalReadyRef=useRef(false);
  const persistPersonal=useCallback(async(change:(value:Customization)=>Customization)=>{if(!personalReadyRef.current)throw Error('个人设置尚未准备好，请刷新后重试。');const operation=personalQueue.current.catch(()=>{}).then(async()=>{let next=validateCustomization(change(structuredClone(personalRef.current)));if(ports.defaultCodexMode==='real'&&ports.codex.manageSkill)next=validateCustomization(await ports.codex.manageSkill('personal-write',{value:next}));else next.revision++;personalRef.current=next;setPersonal(next);await ports.storage.set('personalization',next);});personalQueue.current=operation;await operation;},[ports]);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved'), [savingMessage, setSavingMessage] = useState('');
  const [scanning, setScanning] = useState(false), [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [codexStatus, setCodexStatus] = useState<CodexConnectionStatus | null>(null), [codexCapabilities, setCodexCapabilities] = useState<CodexCapabilities | null>(null);
  const accepting = useRef(new Set<string>());
  const showcaseStarting = useRef(new Set<string>());
  const stateRef = useRef(state), revision = useRef(0), queue = useRef(Promise.resolve()), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blobs = useRef(new Map<string, string>()), readyRef = useRef(false);
  const registerAsset = useCallback((key: string, blob: Blob) => {
    const old = blobs.current.get(key); if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(blob); blobs.current.set(key, url);
    setAssetUrls(current => ({ ...current, [key]: url }));
  }, []);
  const assetRequests=useRef(new Map<string,Promise<string>>());
  const getAsset=useCallback(async(key:string,preview=false)=>{
    const urlKey=preview?'preview:'+key:key;
    const cached=blobs.current.get(urlKey);if(cached)return cached;
    if(!key.startsWith('asset:'))return key;
    if(!assetRequests.current.has(urlKey)){
      const operation=(async()=>{
        if(preview){const small=await ports.storage.get<Blob>('thumbnail:'+key);if(small){registerAsset(urlKey,small);return blobs.current.get(urlKey)!;}}
        let blob=await ports.storage.get<Blob>(key);
        if(!blob){const output=/^asset:result:([^:]+):(.+)$/.exec(key);if(output)blob=await ports.codex.getOutput(output[1],output[2]);
          else{const ref=/^asset:reference:([^:]+):(.+)$/.exec(key),project=ref&&stateRef.current.projects.find(p=>p.id===ref[1]),task=project&&project.generations.find(g=>g.codex?.compiledTask?.images.some(i=>i.id===ref![2]));if(ref&&task&&ports.codex.getReference)blob=await ports.codex.getReference(task.id,ref[2]);}
          if(blob)await ports.storage.set(key,blob);
        }
        if(!(blob instanceof Blob))throw Error('本地图片丢失，请刷新或重新上传。');
        if(preview){blob=await thumbnail(blob);await ports.storage.set('thumbnail:'+key,blob);}
        registerAsset(urlKey,blob);return blobs.current.get(urlKey)!;
      })();assetRequests.current.set(urlKey,operation);operation.catch(()=>assetRequests.current.delete(urlKey));
    }
    return assetRequests.current.get(urlKey)!;
  },[ports,registerAsset]);
  const persist = useCallback((snapshot: PersistedState, version: number) => {
    setSaveState('saving');
    const operation = queue.current.catch(() => {}).then(() => ports.storage.set('app-state', cleanState(snapshot)));
    queue.current = operation;
    operation.then(() => { if (version === revision.current) { setSaveState('saved'); setSavingMessage(''); } }, failure => {
      if (version === revision.current) { setSaveState('failed'); setSavingMessage(failure instanceof Error ? failure.message : '本地保存失败'); }
    });
    return operation;
  }, [ports]);
  const commit = useCallback((change: (current: PersistedState) => PersistedState) => {
    const next = change(stateRef.current); stateRef.current = next; setState(next);
    const version = ++revision.current; setSaveState('saving'); clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist(next, version).catch(() => {}); }, 120);
  }, [persist]);
  const flush = useCallback(async () => { clearTimeout(timer.current); await persist(stateRef.current, revision.current); }, [persist]);
  const changeProjectGroups=async(change:(groups:{id:string;name:string}[])=>{id:string;name:string}[])=>{await persistPersonal(p=>({...p,projectGroups:change(p.projectGroups||[])}));commit(s=>({...s,projectGroups:personalRef.current.projectGroups||[]}));await flush();};
  useEffect(() => window.skillCanvasDesktop?.onBeforeClose(async()=>{if(!readyRef.current)throw Error('本地数据尚未准备完成，请稍后再试。');await personalQueue.current;await flush();}), [flush]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const desktopInfo = window.skillCanvasDesktop ? await window.skillCanvasDesktop.info() : undefined;
        if(desktopInfo?.dataId)await ports.storage.useNamespace?.(desktopInfo.dataId,desktopInfo.canImportLegacyCache);
        let saved = await ports.storage.get<PersistedState>('app-state');
        if(desktopInfo?.dataId&&ports.defaultCodexMode==='real'&&ports.codex.manageSkill){
          const portable=await ports.codex.manageSkill('portable-state',{}) as {manifest:{id:string;sourceRoot:string;assets:{key:string}[]};state:PersistedState}|null;
          if(portable){
            for(const asset of portable.manifest.assets){
              if(saved&&await ports.storage.get(asset.key))continue;
              const result=await ports.codex.manageSkill('portable-asset',{key:asset.key}) as {data:string;mime:string;sha256:string};
              const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));
              const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
              if(hash!==result.sha256)throw Error('草稿图片完整性校验失败。');
              await ports.storage.set(asset.key,new Blob([bytes],{type:result.mime}));
            }
            if(!saved){saved={...portable.state,dataRoot:portable.state.dataRoot||portable.manifest.sourceRoot,importedSnapshot:portable.manifest.id};await ports.storage.set('app-state',saved);}
            await ports.codex.manageSkill('portable-consume',{id:portable.manifest.id});
          }
        }
        try{const preferences=ports.defaultCodexMode==='real'&&ports.codex.manageSkill?await ports.codex.manageSkill('personal-read',{}):await ports.storage.get('personalization');let valid=preferences?validateCustomization(preferences):defaultCustomization();if(!saved?.groupMetadataVersion&&saved?.projectGroups?.length){valid.projectGroups=[...(valid.projectGroups||[]),...saved.projectGroups.filter(g=>!valid.projectGroups?.some(other=>other.id===g.id))];if(ports.defaultCodexMode==='real'&&ports.codex.manageSkill)valid=validateCustomization(await ports.codex.manageSkill('personal-write',{value:valid}));else await ports.storage.set('personalization',valid);}if(active){personalRef.current=valid;personalReadyRef.current=true;setPersonal(valid);setPersonalReady(true);}}catch(failure){if(active)setError(failure instanceof Error?failure.message:'个人设置加载失败，请刷新后重试。');}
        if (saved && saved.schema !== 2) throw new Error('本地数据版本不受支持，未覆盖原有数据。');
        let restored = saved || initialState();
        if(personalReadyRef.current){restored.projectGroups=personalRef.current.projectGroups||[];restored.groupMetadataVersion=1;}
        if(desktopInfo?.dataRoot){if(restored.dataRoot&&restored.dataRoot!==desktopInfo.dataRoot)restored=rebaseState(restored,restored.dataRoot,desktopInfo.dataRoot);restored.dataRoot=desktopInfo.dataRoot;}
        restored.settings.theme = normalizeTheme(desktopInfo?.theme ?? restored.settings.theme);
        restored.settings.language = normalizeLanguage(desktopInfo?.language ?? (saved ? restored.settings.language : getLanguage()));
        applyLanguage(restored.settings.language);
        applyTheme(restored.settings.theme);
        restored.settings.codexMode = ports.defaultCodexMode === 'real' ? 'real' : restored.settings.codexMode || 'mock';
        if (ports.defaultCodexMode === 'real') restored.settings.showDemoSkills = false;
        if (ports.defaultCodexMode === 'real') { restored.manifests = restored.manifests.filter(item => item.source.type !== 'demo'); restored.projects = restored.projects.filter(project => project.generations.every(task => !!task.codex)); }
        if (!active) return;
        stateRef.current = restored; setState(restored); readyRef.current = true; setReady(true);
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '无法打开本地存储'); }
    }
    void load();
    return () => { active = false; clearTimeout(timer.current); for (const url of blobs.current.values()) URL.revokeObjectURL(url); blobs.current.clear(); };
  }, [ports, registerAsset]);
  useEffect(() => {
    if (!ready) return;
    applyTheme(state.settings.theme);
    document.documentElement.style.setProperty('--text-scale',String(([90,100,110,125].includes(state.settings.textScale||100)?state.settings.textScale||100:100)/100));
  }, [ready, state.settings.theme,state.settings.textScale]);
  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      let changed = false;
      const projects = stateRef.current.projects.map(project => {
        let projectChanged = false;
        const generations = project.generations.map(task => { const next = ports.runner.advance(task, Date.now()); if (task !== next) projectChanged = true; return next; });
        if (!projectChanged) return project;
        changed = true; const latest = generations[0];
        return { ...project, generations, status: latest.status, updatedAt: new Date().toISOString(), thumbnail: latest.status === 'completed' ? latest.versions.at(-1)?.image || null : project.thumbnail };
      });
      if (changed) commit(value => ({ ...value, projects }));
    }, 250);
    return () => window.clearInterval(interval);
  }, [ready, ports, commit]);
  const acceptCodexTask = useCallback(async (handle: CodexTaskHandle) => {
    if (accepting.current.has(handle.taskId)) return;
    const previous = stateRef.current.projects.flatMap(project => project.generations).find(task => task.id === handle.taskId);
    if (!previous || (previous.codex && previous.codex.sequence > handle.sequence)) return;
    let versions = previous.versions, finalPrompt = previous.finalPrompt;
    if (handle.stage === 'completed' && handle.result && !previous.versions.some(version => version.taskId === handle.taskId)) {
      accepting.current.add(handle.taskId);
      // Release terminal SSE before fetching originals. Six open HTTP/1 streams
      // otherwise occupy Chromium's per-origin connection pool and starve PNGs.
      // Keep the local generation running until its originals are imported.
      commit(current => ({ ...current, projects: current.projects.map(project => project.id === handle.projectId ? { ...project, generations: project.generations.map(task => task.id === handle.taskId ? { ...task, codex: handle } : task) } : project) }));
      try {
        const changes: { key: string; value: Blob }[] = [];
        const history = stateRef.current.projects.find(project => project.id === handle.projectId)?.generations.filter(task => task.id !== handle.taskId && task.codex?.result && task.status === 'completed') || [];
        versions = [...(history[0]?.versions || [])];
        for (const [index, output] of handle.result.outputs.entries()) {
          const blob = await ports.codex.getOutput(handle.taskId, output.id), decoded = await createImageBitmap(blob);
          if (decoded.width !== output.width || decoded.height !== output.height) { decoded.close(); throw new Error('回传图片尺寸与验证结果不一致。'); } decoded.close();
          const key = `asset:result:${handle.taskId}:${output.id}`; changes.push({ key, value: blob });
          versions.push({ id: `${handle.taskId}:${output.id}`, taskId: handle.taskId, outputId: output.id, label: `V${handle.result.version || history.length + 1}${handle.result.outputs.length > 1 ? ` · ${index + 1}` : ''}`, image: key });
        }
        await ports.storage.batch(changes); for (const change of changes) registerAsset(change.key, change.value);
        finalPrompt = handle.result.finalPrompt || '';
        const showcase=handle.compiledTask?.showcase,skillId=handle.compiledTask?.skill.id;
        if(showcase&&skillId){const role=showcase.role==='cover'?'cover':'example',previous=role==='cover'?'previousCover':'previousExample';
          try{const media=personalRef.current.skills[skillId]?.[role];if(media&&Date.parse(media.createdAt)<Date.parse(handle.startedAt))await persistPersonal(p=>{const entry=p.skills[skillId]||{};if(!entry[role]||Date.parse(entry[role]!.createdAt)>=Date.parse(handle.startedAt))return p;return {...p,skills:{...p.skills,[skillId]:{...entry,[previous]:entry[role],[role]:undefined}}};});}
          catch{setError('图片已生成，但展示设置保存失败；可在详情页切换自动展示图。');}
        }
      } catch (failure) { handle = { ...handle, stage: 'failed', error: { code: 'REFERENCE_FILE_FAILED', message: failure instanceof Error ? failure.message : '结果保存失败，请恢复任务重试。' } }; }
      finally { accepting.current.delete(handle.taskId); }
    }
    const status: Generation['status'] = handle.stage === 'completed' ? 'completed' : handle.stage === 'cancelled' ? 'cancelled' : ['failed', 'interrupted', 'waiting'].includes(handle.stage) ? 'failed' : handle.stage === 'running' ? 'running' : 'queued';
    commit(current => ({ ...current, projects: current.projects.map(project => project.id === handle.projectId ? { ...project, codexThreadId: handle.threadId || project.codexThreadId, codexTurnId: handle.turnId || project.codexTurnId, status: project.generations[0]?.id === handle.taskId ? status : project.status, thumbnail: versions.at(-1)?.image || project.thumbnail, updatedAt: handle.updatedAt, generations: project.generations.map(task => task.id === handle.taskId ? { ...task, codex: handle, status, versions, finalPrompt, error: handle.error?.message } : task) } : project) }));
  }, [ports, commit, registerAsset,persistPersonal]);
  const activeCodexIds = state.projects.flatMap(project => project.generations).filter(task => task.codex && !terminalStages.includes(task.codex.stage) && ['queued', 'running'].includes(task.status)).map(task => task.id).sort().join(',');
  useEffect(() => {
    if (!ready || !activeCodexIds) return;
    const subscriptions = activeCodexIds.split(',').map(id => ports.codex.subscribe(id, handle => { void acceptCodexTask(handle); }, error => {
      commit(current => ({ ...current, projects: current.projects.map(project => ({ ...project, generations: project.generations.map(task => task.id === id ? { ...task, error: `${error.message} 可点击恢复连接重新核对。` } : task) })) }));
    }));
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [ready, activeCodexIds, ports, acceptCodexTask, commit]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (readyRef.current && saveState !== 'saved') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [saveState]);

  useEffect(()=>{if(!ready)return;const project=state.projects.find(p=>p.id===state.activeProjectId);for(const ref of project?.draft.references||[])if(ref.assetId&&!blobs.current.has(ref.assetId))void getAsset(ref.assetId).catch(()=>{});},[ready,state.activeProjectId,state.projects,getAsset]);
  const hydrateDraft = (draft: Draft) => ({ ...draft, references: draft.references.map(image => ({ ...image, url: image.assetId ? assetUrls[image.assetId] || '' : image.url })) });
  const allProjects = state.projects.map(project => ({ ...project, draft: hydrateDraft(project.draft), thumbnail: project.thumbnail?.startsWith('asset:') ? assetUrls[project.thumbnail] || project.thumbnail : project.thumbnail, generations: project.generations.map(task => ({ ...task, draft: hydrateDraft(task.draft), versions: task.versions.map(version => ({ ...version, image: assetUrls[version.image] || version.image })) })) }));
  const projects = allProjects.filter(project => !project.showcase);
  const allSkills = state.manifests.map(manifest => personalizeSkill(toSkillView(manifest, assetUrls, allProjects),personal));
  const activeProject = allProjects.find(project => project.id === state.activeProjectId);
  const draft = activeProject?.draft || applySkillParameters(structuredClone(defaultDraft), demoManifests.find(item => item.id === 'minimal-zine')!);
  const getManifest = (id: string) => stateRef.current.manifests.find(item => item.installation.id === id);
  const makeProject = (id: string) => {
    const skill = getManifest(id); if (!skill) throw new Error('Skill 不存在');
    const now = new Date().toISOString();
    const input = skill.source.type === 'demo' ? { ...structuredClone(defaultDraft), skillId: id, references: [] } : { ...structuredClone(defaultDraft), skillId: id, prompt: '', requirements: '', references: [] };
    const project: CanvasProject = { id: crypto.randomUUID(), title: '未命名作品', createdAt: now, updatedAt: now, skillName: skill.name, skillSnapshot: structuredClone(skill), draft: applyDefaultImageLanguage(applySkillParameters(input, skill),skill,personalRef.current.defaults.imageLanguage), status: 'draft', generations: [], thumbnail: null };
    commit(current => ({ ...current, projects: [project, ...current.projects], activeProjectId: project.id })); return project;
  };
  const updateDraft = (patch: Partial<Draft>) => {
    commit(current => ({ ...current, projects: current.projects.map(project => {
      if (project.id !== current.activeProjectId) return project;
      const skill = project.skillSnapshot || getManifest(patch.skillId || project.draft.skillId), merged = { ...project.draft, ...patch };
      const updated = skill ? applySkillParameters(merged, skill) : merged;
      if (updated.revision && patch.requirements !== undefined) updated.revision = { ...updated.revision, instruction: patch.requirements || '保留主体，生成细微变体。' };
      return { ...project, draft: updated, skillName: skill?.name || project.skillName, updatedAt: new Date().toISOString(), status: updated.prompt.trim() ? 'ready' : 'draft', thumbnail: project.generations.find(task => task.status === 'completed')?.versions.at(-1)?.image || null };
    }) }));
  };
  const draftManifest = (id: string) => stateRef.current.projects.find(project => project.id === stateRef.current.activeProjectId && project.draft.skillId === id)?.skillSnapshot || getManifest(id);
  const compilePrompt = (input = draft) => [
    `Skill：${draftManifest(input.skillId)?.name || input.skillId}`, input.prompt.trim(), input.requirements.trim() ? `具体要求：${input.requirements.trim()}` : '',
    ...Object.entries(input.parameters || {}).map(([key, value]) => `${draftManifest(input.skillId)?.parameters.find(parameter => parameter.id === key)?.label || key}：${value}`),
    `参考图：${input.references.length} 张`, ...input.references.map(image => `${image.name} · ${image.role || 'style_reference'}`),
  ].filter(Boolean).join('\n');
  const setTaskStatus = (id: string, status: Generation['status']) => commit(current => ({ ...current, projects: current.projects.map(project => {
    if (!project.generations.some(task => task.id === id && ['queued', 'running'].includes(task.status))) return project;
    const generations = project.generations.map(task => task.id === id ? { ...task, status } : task);
    return { ...project, generations, status, updatedAt: new Date().toISOString(), thumbnail: status === 'completed' ? generations.find(task => task.id === id)?.versions.at(-1)?.image || null : project.thumbnail };
  }) }));
  const applySnapshots = async (snapshots: RootSnapshot[]) => {
    const current = stateRef.current;
    const result = await scanSkillSnapshots(snapshots, current.manifests.filter(item => item.source.type === 'local' && !['managed', 'codex-native'].includes(item.installation.rootId)), current.settings.updateStrategy);
    await ports.storage.batch(result.assets);
    for (const asset of result.assets) if (asset.value instanceof Blob) registerAsset(asset.key, asset.value);
    commit(value => ({ ...value, manifests: [...value.manifests.filter(item => item.source.type === 'demo'), ...result.manifests.map(adaptSkill), ...value.manifests.filter(item => ['codex-native', 'managed'].includes(item.installation.rootId))], settings: { ...value.settings, skillRoots: [...value.settings.skillRoots.filter(root => !result.roots.some(next => next.id === root.id)), ...result.roots] } }));
    await flush();
  };
  const scanRoots = async () => { setScanning(true); try { await applySnapshots(await ports.files.scanDirectories(stateRef.current.settings.skillRoots.filter(root => root.mode === 'directory'))); } finally { setScanning(false); } };
  const startRealTask = async (project: CanvasProject, input: Draft, action: 'generate_image' | 'bridge_test' = 'generate_image') => {
    const skill = project.skillSnapshot || getManifest(input.skillId); if (!skill) throw new Error('Skill 不存在。');
    if (action === 'generate_image' && skill.source.type === 'demo') throw new Error('演示 Skill 不能真实执行，请选择本地 Skill；演示流程可在开发设置中使用 Mock。');
    const compiled = compileCodexTask(project, skill, input, action);
    const references = [];
    for (const image of input.references) {
      if(image.assetId)await getAsset(image.assetId);
      const blob = image.assetId ? await ports.storage.get<Blob>(image.assetId) : undefined;
      if (!blob) throw new Error(`参考图 ${image.name} 的本地文件缺失，请重新上传。`);
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
      references.push({ id: image.id, data });
    }
    const handle = await ports.codex.createTask(compiled, references);
    const task: Generation = { id: handle.taskId, projectId: project.id, skillName: skill.name, draft: structuredClone(input), finalPrompt: compiled.instruction, startedAt: Date.parse(handle.startedAt), duration: 0, status: 'queued', versions: [], codex: handle };
    commit(current => ({ ...current, projects: current.projects.map(item => item.id === project.id ? { ...item, status: 'queued', generations: [task, ...item.generations], updatedAt: handle.updatedAt } : item) }));
    await flush(); await acceptCodexTask(handle); return task.id;
  };
  const generateShowcase = async (id: string) => {
    const skill = getManifest(id); if (!skill) throw new Error('Skill 不存在。');
    if (showcaseStarting.current.has(id) || latestShowcaseProjects(skill, stateRef.current.projects).some(project => ['queued', 'running'].includes(project.status))) throw new Error('此 Skill 的案例仍在生成，请勿重复提交。');
    const collection = createShowcaseProjects(skill);
    showcaseStarting.current.add(id);
    try {
      // Separate real tasks: independent prompts, evidence, failures, and retry histories.
      // Never select a background showcase project as the user's current creative project.
      commit(current => ({ ...current, projects: [...collection, ...current.projects] })); await flush();
      await Promise.all(collection.map(async project => {
        try { await startRealTask(project, project.draft); }
        catch (failure) { commit(current => ({ ...current, projects: current.projects.map(item => item.id === project.id ? { ...item, status: 'failed', showcaseError: failure instanceof Error ? failure.message : '案例提交失败' } : item) })); await flush(); }
      }));
    } finally { showcaseStarting.current.delete(id); }
  };
  const draftFromHandle = (handle: CodexTaskHandle): Draft => {
    const compiled = handle.compiledTask!;
    return { skillId: compiled.manifest?.installation.id || compiled.skill.id, prompt: compiled.request.prompt, requirements: compiled.request.requirements.join('\n'), references: compiled.images.filter(image => image.origin !== 'base_version').map(image => ({ id: image.id, name: image.name, role: image.role, mime: image.mime, url: '', assetId: `asset:reference:${handle.projectId}:${image.id}`, projectId: handle.projectId })), ratio: compiled.settings.aspect_ratio, count: compiled.settings.output_count, size: compiled.settings.size, format: compiled.output.format.toUpperCase(), parameters: compiled.extensions, revision: compiled.revision };
  };
  const syncBridge = useCallback(async () => {
    if (!ports.codex.listProjects || !ports.codex.listSkills) return;
    const catalog = await ports.codex.listSkills().catch(failure => { setError(failure instanceof Error ? failure.message : 'Skill 检测失败，历史项目仍可查看'); return null; });
    if (catalog) commit(current => ({ ...current, manifests: mergeBridgeCatalog(current.manifests, catalog) }));
    const archived = await ports.codex.listProjects() as {id:string;archived?:boolean;management?:{title?:string;groupId?:string|null;tags?:string[]};tasks:CodexTaskHandle[]}[];
    const archivedIds = new Set(archived.filter(project => project.archived).map(project => project.id));
    if (archivedIds.size) commit(current => ({ ...current, activeProjectId: current.activeProjectId && archivedIds.has(current.activeProjectId) ? null : current.activeProjectId, projects: current.projects.filter(project => !archivedIds.has(project.id)) }));
    for (const project of archived.filter(project => !project.archived)) {
      const handles = project.tasks.filter(task => task.compiledTask?.manifest).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      if (!handles.length) continue;
      const first = handles[0], last = handles.at(-1)!;
      const local = stateRef.current.projects.find(item => item.id === project.id);
      const versions: Generation['versions'] = [], generations: Generation[] = [];
      for (const handle of handles) {
        const input = draftFromHandle(handle);
        let status: Generation['status'] = handle.stage === 'completed' ? 'completed' : handle.stage === 'cancelled' ? 'cancelled' : ['failed', 'interrupted', 'waiting'].includes(handle.stage) ? 'failed' : 'running';
        let error = handle.error?.message;
        for (const [index, output] of (handle.result?.outputs || []).entries()) {
          const key = `asset:result:${handle.taskId}:${output.id}`;
          try {
            if (!versions.some(version => version.id === `${handle.taskId}:${output.id}`)) versions.push({ id: `${handle.taskId}:${output.id}`, taskId: handle.taskId, outputId: output.id, label: `V${handle.result?.version || generations.filter(item => item.status === 'completed').length + 1}${handle.result!.outputs.length > 1 ? ' · ' + (index + 1) : ''}`, image: key });
          } catch (failure) { status = 'failed'; error = failure instanceof Error ? failure.message : '原图不可用'; }
        }
        generations.unshift({ id: handle.taskId, projectId: project.id, skillName: handle.compiledTask!.skill.name, draft: input, finalPrompt: handle.result?.finalPrompt || '', startedAt: Date.parse(handle.startedAt), duration: 0, codex: handle, status, versions: [...versions], error });
      }
      commit(current => {
        const existing = current.projects.find(item => item.id === project.id);
        const restored: CanvasProject = { id: project.id, showcase: first.compiledTask!.showcase, skillSnapshot: existing?.skillSnapshot || first.compiledTask!.manifest, title: first.compiledTask!.showcase?.label || '未命名作品', createdAt: first.startedAt, updatedAt: last.updatedAt, skillName: last.compiledTask!.skill.name, draft: local?.draft || draftFromHandle(last), status: generations[0].status, generations, thumbnail: versions.at(-1)?.image || null, codexThreadId: last.threadId || undefined, codexTurnId: last.turnId || undefined };
        // Keep unsent draft edits. Disk history is authoritative for submitted tasks.
        if (existing) {
          restored.draft = existing.draft; restored.title = existing.title;
          restored.generations = [...generations.map(incoming => {
            const newer = existing.generations.find(item => item.id === incoming.id && (item.codex?.sequence || 0) > (incoming.codex?.sequence || 0));
            return newer || incoming;
          }), ...existing.generations.filter(item => !generations.some(incoming => incoming.id === item.id))].sort((a, b) => b.startedAt - a.startedAt);
          restored.status = restored.generations[0]?.status || restored.status;
          restored.thumbnail = restored.generations.find(item => item.status === 'completed')?.versions.at(-1)?.image || restored.thumbnail;
          restored.groupId=existing.groupId;restored.tags=existing.tags;
        }
        if(project.management)Object.assign(restored,project.management);
        const missing = handles.map(handle => handle.compiledTask!.manifest!).filter(manifest => !current.manifests.some(item => item.installation.id === manifest.installation.id));
        return { ...current, manifests: [...current.manifests, ...missing.filter((item, index, all) => all.findIndex(other => other.installation.id === item.installation.id) === index)], projects: [...current.projects.filter(item => item.id !== project.id), restored] };
      });
    }
  }, [ports, commit]);
  useEffect(() => {
    if (ready && ports.defaultCodexMode === 'real') {
      void ports.codex.getStatus().then(setCodexStatus).catch(() => {});
      void ports.codex.getCapabilities().then(setCodexCapabilities).catch(() => {});
      void syncBridge().catch(failure => setError(failure instanceof Error ? failure.message : '无法恢复磁盘项目'));
    }
  }, [ready, ports, syncBridge]);
  const value: CanvasState = {
    getAsset,
    prepareDraftBackup:async progress=>{
      const desktop=window.skillCanvasDesktop;if(!desktop?.beginDraftBackup)throw Error('当前环境不支持草稿备份。');await personalQueue.current;await flush();
      const source=stateRef.current,assets=new Map<string,()=>Promise<Blob|undefined>>(),inline=new Map<string,string>();
      const compact=(manifest:SkillManifest):SkillManifest=>{
        const result=executionManifest(manifest);result.examples=manifest.examples.map(example=>{const next={...example};for(const field of ['imageRef','beforeRef'] as const){const ref=example[field];if(ref?.startsWith('data:image/')){let key=inline.get(ref);if(!key){key='asset:portable-image:'+crypto.randomUUID();inline.set(ref,key);assets.set(key,async()=>{const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z\d+/=]+)$/.exec(ref);if(!match)throw Error('展示图片格式不支持草稿备份。');return new Blob([Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))],{type:match[1]});});}next[field]=key;}else if(ref?.startsWith('asset:')&&!['managed','codex-native','demo'].includes(manifest.installation.rootId))assets.set(ref,()=>ports.storage.get<Blob>(ref));}return next;});return result;
      };
      const projects=source.projects.map(project=>{
        const draft=cleanDraft(project.draft);for(const ref of draft.references){const formal=project.generations.some(task=>task.codex?.compiledTask?.images.some(image=>image.id===ref.id));if(ref.assetId&&!formal)assets.set(ref.assetId,()=>ports.storage.get<Blob>(ref.assetId!));else if(!ref.assetId)throw Error('参考图缺少本地身份，请重新上传后备份。');}
        return {...project,draft,skillSnapshot:project.skillSnapshot?compact(project.skillSnapshot):undefined,generations:[],thumbnail:null,status:project.draft.prompt.trim()?'ready' as const:'draft' as const};
      });
      const snapshot={...source,manifests:source.manifests.map(compact),projects};let token='';
      try{token=await desktop.beginDraftBackup(snapshot,[...assets.keys()]);let completed=0;progress?.(0,assets.size);for(const [key,load] of assets){const blob=await load();if(!(blob instanceof Blob))throw Error('草稿图片缺失，备份未提交。');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));await desktop.addDraftBackupAsset(token,{key,data:btoa(binary)});progress?.(++completed,assets.size);}await desktop.finishDraftBackup(token);return token;}
      catch(error){if(token)await desktop.cancelDraftBackup(token).catch(()=>{});throw error;}
    },
    personal,personalReady,
    savePersonal:persistPersonal,
    updateSkillDisplay:async(id,patch)=>{await value.savePersonal(current=>({...current,skills:{...current.skills,[id]:mergeSkillOverride(current.skills[id]||{},patch)}}));},
    uploadPersonalMedia:async file=>{if(file.type!=='image/png'||file.size>8*1024*1024)throw Error('请上传不超过 8 MB 的 PNG。');const bitmap=await createImageBitmap(file);const width=bitmap.width,height=bitmap.height;bitmap.close();const bytes=new Uint8Array(await file.arrayBuffer()),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');let media:PersonalMedia;
      if(ports.defaultCodexMode==='real'&&ports.codex.manageSkill){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));media=await ports.codex.manageSkill('personal-upload',{data:btoa(binary)}) as PersonalMedia;}else media={id:digest,mime:file.type,width,height,createdAt:new Date().toISOString(),source:'Personal upload',focusX:50,focusY:50};await ports.storage.set('asset:personal:'+media.id,file);return media;},
    getPersonalMedia:async id=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('图片身份无效。');if(!mediaPromises.current.has(id)){const operation=(async()=>{let blob=await ports.storage.get<Blob>('asset:personal:'+id);if(!blob&&ports.defaultCodexMode==='real'&&ports.codex.manageSkill){const result=await ports.codex.manageSkill('personal-media',{id}) as {data:string;mime:string};const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==id)throw Error('个人图片完整性校验失败。');blob=new Blob([bytes],{type:result.mime});await ports.storage.set('asset:personal:'+id,blob);}if(!blob)throw Error('个人图片丢失。');const key='asset:personal:'+id;registerAsset(key,blob);return blobs.current.get(key)!;})();mediaPromises.current.set(id,operation);operation.catch(()=>mediaPromises.current.delete(id));}return mediaPromises.current.get(id)!;},
    projectGroups:state.projectGroups||[],
    renameProjectGroup:async(id,name)=>{name=name.trim();if(!name||name.length>24)throw Error('分组名称须为 1–24 字。');if(stateRef.current.projectGroups?.some(g=>g.id!==id&&g.name===name))throw Error('分组名称已存在。');await changeProjectGroups(groups=>groups.map(g=>g.id===id?{...g,name}:g));},
    moveProjectGroup:async(id,offset)=>{const groups=[...(stateRef.current.projectGroups||[])],index=groups.findIndex(g=>g.id===id);if(![-1,1].includes(offset)||index<0||index+offset<0||index+offset>=groups.length)return;[groups[index],groups[index+offset]]=[groups[index+offset],groups[index]];await changeProjectGroups(()=>groups);},
    addProjectGroup:async name=>{name=name.trim();if(!name||name.length>24)throw new Error('分组名称须为 1–24 字。');if(stateRef.current.projectGroups?.some(g=>g.name===name))throw new Error('分组名称已存在。');await changeProjectGroups(groups=>[...groups,{id:crypto.randomUUID(),name}]);},
    removeProjectGroup:async id=>{for(const p of stateRef.current.projects.filter(p=>p.groupId===id))await value.updateProjectMetadata(p.id,{groupId:null});await changeProjectGroups(groups=>groups.filter(g=>g.id!==id));},
    updateProjectMetadata:async(id,patch)=>{
      if(patch.title!==undefined){patch.title=patch.title.trim();if(!patch.title||patch.title.length>120)throw new Error('项目名称须为 1–120 字。');}
      if(patch.tags){patch.tags=[...new Set(patch.tags.map(t=>t.trim()).filter(Boolean))];if(patch.tags.length>16||patch.tags.some(t=>t.length>24))throw new Error('最多 16 个标签，每个不超过 24 字。');}
      if(patch.groupId&&!stateRef.current.projectGroups?.some(g=>g.id===patch.groupId))throw new Error('分组不存在。');
      const project=stateRef.current.projects.find(p=>p.id===id);
      if(!project)throw new Error('项目不存在或已经删除。');
      if(ports.defaultCodexMode==='real'||stateRef.current.settings.codexMode!=='mock'&&project?.generations.some(g=>!!g.codex))await ports.codex.updateProjectMetadata?.(id,patch);
      commit(s=>({...s,projects:s.projects.map(p=>p.id===id?{...p,...patch}:p)}));await flush();
    },
    copyProject:async id=>{
      const source=stateRef.current.projects.find(p=>p.id===id);if(!source)throw new Error('项目不存在。');const newId=crypto.randomUUID(),references:ReferenceImage[]=[],changes:{key:string;value:Blob}[]=[];
      for(const ref of source.draft.references){if(ref.assetId)await getAsset(ref.assetId);const blob=ref.assetId?await ports.storage.get<Blob>(ref.assetId):ref.url?await fetch(ref.url).then(r=>r.blob()):undefined;if(!(blob instanceof Blob))throw new Error('参考图丢失，不能创建不完整的副本。');const imageId=crypto.randomUUID(),key=`asset:reference:${newId}:${imageId}`;references.push({...ref,id:imageId,assetId:key,projectId:newId,url:''});changes.push({key,value:blob});}
      await ports.storage.batch(changes);for(const change of changes)registerAsset(change.key,change.value);
      const now=new Date().toISOString(),copy:CanvasProject={id:newId,title:source.title.slice(0,115)+' 副本',createdAt:now,updatedAt:now,skillName:source.skillName,skillSnapshot:structuredClone(source.skillSnapshot),groupId:source.groupId,tags:[...(source.tags||[])],draft:{...structuredClone(source.draft),references,revision:undefined},status:'draft',generations:[],thumbnail:references[0]?.assetId||null};
      commit(s=>({...s,projects:[copy,...s.projects]}));await flush();return newId;
    },
    generateShowcase,
    showcaseForSkill: id => { const skill = getManifest(id); return skill ? latestShowcaseProjects(skill, allProjects) : []; },
    manageSkill: async (action, input) => {
      if (!ports.codex.manageSkill) throw new Error('当前模式不支持安装 Skill。');
      const { generateShowcase: autoShowcase, ...operation } = input;
      let result: unknown;
      try { result = await ports.codex.manageSkill(action, operation); }
      finally { if (!['preview','review','changes','delete-impact','storage-usage','storage-clean','queue-state'].includes(action)) await syncBridge(); }
      if (action === 'install' && autoShowcase === true) {
        const installed = result as SkillManifest;
        if (installed.runtime.status === 'ready') {
          try { await generateShowcase(installed.installation.id); }
          catch (failure) { setError(`Skill 已安装，案例尚未生成：${failure instanceof Error ? failure.message : '生成不可用'}`); }
        }
      }
      return result;
    },
    enqueueTask:async id=>{if(!ports.codex.enqueueTask)throw Error('此模式不支持继续排队。');await acceptCodexTask(await ports.codex.enqueueTask(id));},
    originalOutput: (taskId, outputId) => ports.codex.getOutput(taskId, outputId),
    retryTask: async id => {
      if (!ports.codex.retryTask) throw new Error('此运行模式不支持真实重试。');
      const handle = await ports.codex.retryTask(id);
      const previous = stateRef.current.projects.flatMap(project => project.generations).find(task => task.id === id)!;
      if (handle.taskId === id) { await acceptCodexTask(handle); return id; }
      const task: Generation = { ...previous, id: handle.taskId, draft: draftFromHandle(handle), finalPrompt: '', startedAt: Date.parse(handle.startedAt), codex: handle, status: 'queued', versions: [], error: undefined };
      commit(current => ({ ...current, activeProjectId: handle.projectId, projects: current.projects.map(project => project.id === handle.projectId ? { ...project, status: 'queued', generations: [task, ...project.generations] } : project) }));
      await flush(); await acceptCodexTask(handle); return handle.taskId;
    },
    codexStatus, codexCapabilities,
    checkCodex: async () => { try { setCodexStatus(await ports.codex.getStatus()); setCodexCapabilities(await ports.codex.getCapabilities()); if (ports.defaultCodexMode === 'real') { await syncBridge(); setError(''); } } catch (failure) { setCodexStatus({ connected: false, version: null, model: null, models: [], authenticated: false, bridge: 'unavailable', checkedAt: new Date().toISOString(), error: { code: 'CODEX_CONNECTION_LOST', message: failure instanceof Error ? failure.message : '本地 Bridge 未启动' } }); } },
    testCodex: async () => { const project = stateRef.current.projects.find(item => item.id === stateRef.current.activeProjectId) || makeProject('minimal-zine'); return startRealTask(project, { ...project.draft, prompt: 'SKILL_CANVAS_CODEX_BRIDGE_OK', references: [] }, 'bridge_test'); },
    restoreCodexTask: async id => { await acceptCodexTask(await ports.codex.resumeTask(id)); },
    cleanCodexTask: async id => { await ports.codex.removeTask(id); },
    ready, error, saveState, savingMessage, scanning, settings: state.settings, manifests: state.manifests,
    skills: allSkills.filter(skill => skill.manifest?.source.type === 'demo' ? state.settings.showDemoSkills && ports.defaultCodexMode !== 'real' : skill.manifest?.installation.installed || skill.manifest?.installation.rootId === 'catalog-pending'),
    projects, activeProject, draft, generations: [...allProjects.flatMap(project => project.generations), ...(ports.defaultCodexMode === 'real' ? [] : demoGenerations)],
    findSkill: id => allSkills.find(skill => skill.id === id), updateDraft,
    updateParameter: (id, value) => updateDraft({ parameters: { ...draft.parameters, [id]: value } }),
    selectSkill: id => { makeProject(id); },
    ensureProject: () => { if (!stateRef.current.activeProjectId && readyRef.current) { const skill = allSkills.find(item => item.id === 'minimal-zine' && state.settings.showDemoSkills && ports.defaultCodexMode !== 'real') || allSkills.find(item => item.manifest?.source.type === 'local' && item.manifest.runtime.status === 'ready'); if (skill) makeProject(skill.id); } },
    openProject: id => { if (stateRef.current.projects.some(project => project.id === id)) { commit(current => ({ ...current, activeProjectId: id })); void flush().catch(() => {}); } },
    deleteProject: async id => {
      const project = stateRef.current.projects.find(item => item.id === id);
      if (project?.generations.some(task => ['queued', 'running'].includes(task.status))) throw new Error('请先取消正在执行的任务，再删除项目。');
      const real=ports.defaultCodexMode==='real'||stateRef.current.settings.codexMode!=='mock'&&project?.generations.some(g=>!!g.codex);
      if(real&&!ports.codex.deleteProject)throw new Error('当前 Bridge 未支持彻底删除，请更新应用后重试。');
      if(real)await ports.codex.deleteProject?.(id);
      commit(current => ({ ...current, projects: current.projects.filter(project => project.id !== id), activeProjectId: current.activeProjectId === id ? null : current.activeProjectId })); await flush();
      const assets = await ports.storage.entries<Blob>(`asset:reference:${id}:`);
      for (const task of project?.generations || []) assets.push(...await ports.storage.entries<Blob>(`asset:result:${task.id}:`));
      const protectedAssets=new Set(stateRef.current.projects.flatMap(p=>[...p.draft.references,...p.generations.flatMap(g=>g.draft.references)].map(r=>r.assetId).filter(Boolean)));
      const removable=assets.filter(([key])=>!protectedAssets.has(key));
      await ports.storage.batch(removable.flatMap(([key]) => [{ key, remove: true },{key:'thumbnail:'+key,remove:true}]));
      for (const [key] of removable) for(const cached of [key,'preview:'+key]){ const url = blobs.current.get(cached); if (url) URL.revokeObjectURL(url); blobs.current.delete(cached);assetRequests.current.delete(cached); }
    },
    compilePrompt,
    startTask: async (input = draft) => {
      const current = stateRef.current.projects.find(project => project.id === stateRef.current.activeProjectId), skill = current?.skillSnapshot || getManifest(input.skillId);
      if (!current || !skill) throw new Error('请先建立项目并选择 Skill。');
      const validation = validateGenerationDraft(skill, input); if (validation) throw new Error(validation);
      if (current.generations.some(task => ['queued', 'running'].includes(task.status))) throw new Error('项目已有任务正在执行，请等待完成后再生成。');
      if (ports.defaultCodexMode === 'real' || stateRef.current.settings.codexMode !== 'mock') return startRealTask(current, input);
      const task = ports.runner.createTask(input, compilePrompt(input), skill, current.id);
      commit(value => ({ ...value, projects: value.projects.map(project => project.id === current.id ? { ...project, draft: input, status: 'queued', generations: [task, ...project.generations], updatedAt: new Date().toISOString() } : project) })); return task.id;
    },
    finishTask: id => { if (!stateRef.current.projects.flatMap(project => project.generations).find(task => task.id === id)?.codex) { setTaskStatus(id, 'completed'); void flush().catch(() => {}); } }, cancelTask: async id => { if (stateRef.current.projects.flatMap(project => project.generations).find(task => task.id === id)?.codex) await acceptCodexTask(await ports.codex.cancelTask(id)); else { setTaskStatus(id, 'cancelled'); await flush(); } },
    resumeDraft: (generation, instruction, outputId) => {
      if (generation.projectId && stateRef.current.projects.some(project => project.id === generation.projectId)) commit(current => ({ ...current, activeProjectId: generation.projectId! })); else makeProject(generation.draft.skillId);
      const next: Draft = { ...generation.draft, references: generation.codex ? generation.draft.references.filter(image => image.role !== 'edit_target') : generation.draft.references, requirements: generation.codex ? instruction?.trim() || generation.draft.requirements : [generation.draft.requirements, instruction?.trim()].filter(Boolean).join('\n'), revision: generation.codex?.result ? { baseTaskId: generation.id, baseOutputId: outputId || generation.codex.result.outputs[0].id, instruction: instruction?.trim() || '按照本轮具体要求修改这张原图，其余保持不变。' } : undefined };
      updateDraft(next); return next;
    },
    addReferences: async (files, replaceId) => {
      const project = stateRef.current.projects.find(item => item.id === stateRef.current.activeProjectId);
      if (!project) throw new Error('请先建立项目。');
      const replaced = project.draft.references.find(image=>image.id===replaceId);
      if (replaceId && (!replaced || files.length !== 1)) throw new Error('参考图不可用，请重新上传。');
      if (project.draft.references.length + files.length - (replaced ? 1 : 0) > 6) throw new Error('最多添加 6 张参考图。');
      const references: ReferenceImage[] = [], changes: { key: string; value: Blob }[] = [];
      for (const file of files) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请使用 PNG、JPG 或 WEBP 图片。');
        if (file.size > 8 * 1024 * 1024) throw new Error('每张参考图请控制在 8 MB 以内。');
        const image = await createImageBitmap(file).catch(() => { throw new Error(`图片无法读取：${file.name}`); });
        const id = crypto.randomUUID(), assetId = `asset:reference:${project.id}:${id}`;
        references.push({ id, name: file.name, role: personalRef.current.defaults.referenceRole as ReferenceImage['role'], width: image.width, height: image.height, mime: file.type, assetId, projectId: project.id, url: '' }); image.close(); changes.push({ key: assetId, value: file });
      }
      await ports.storage.batch(changes); for (const change of changes) registerAsset(change.key, change.value);
      commit(current => ({ ...current, projects: current.projects.map(item => item.id === project.id ? { ...item, draft: { ...item.draft, references: replaced ? item.draft.references.map(image=>image.id===replaceId?{...references[0],role:image.role}:image) : [...item.draft.references, ...references] }, thumbnail: item.thumbnail || references[0]?.assetId || null, updatedAt: new Date().toISOString() } : item) })); await flush();
    },
    updateSettings: patch => { if (patch.language) applyLanguage(patch.language); commit(current => ({ ...current, settings: { ...current.settings, ...patch, ...(ports.defaultCodexMode === 'real' ? { codexMode: 'real', showDemoSkills: false } : {}) }, manifests: patch.updateStrategy ? current.manifests.map(item => ({ ...item, installation: { ...item.installation, updateStrategy: patch.updateStrategy! } })) : current.manifests })); },
    addRoot: async () => { if (window.skillCanvasDesktop) { const source = await window.skillCanvasDesktop.pickSkillDirectory(); if (source) await applySnapshots([await ports.files.importDirectory(desktopSourceFiles(source))]); return; } const root = await ports.files.pickDirectory(); setScanning(true); try { await applySnapshots(await ports.files.scanDirectories([root])); } finally { setScanning(false); } },
    importRoot: async (files, replaceId) => { setScanning(true); try { await applySnapshots([await ports.files.importDirectory(files, replaceId)]); } finally { setScanning(false); } },
    scanRoots, authorizeRoot: async root => { await ports.files.requestAccess(root); await scanRoots(); },
    removeRoot: async id => { commit(current => ({ ...current, settings: { ...current.settings, skillRoots: current.settings.skillRoots.filter(root => root.id !== id) }, manifests: current.manifests.map(item => item.installation.rootId === id ? { ...item, installation: { ...item.installation, installed: false }, runtime: { ...item.runtime, status: 'unavailable', issues: ['根目录已移除；没有删除磁盘上的 Skill'] } } : item) })); await flush(); await ports.files.forgetRoot(id); },
    toggleFavorite: id => {const favorite=allSkills.find(skill=>skill.id===id)?.manifest?.installation.favorite;void value.updateSkillDisplay(id,{favorite:!favorite}).catch(failure=>setError(failure.message));},
    chooseExportFolder: async () => { const name = window.skillCanvasDesktop ? await window.skillCanvasDesktop.chooseExportDirectory() : await ports.files.pickExportDirectory(); commit(current => ({ ...current, settings: { ...current.settings, exportFolderName: name } })); },
    saveExport: (blob, name) => ports.files.saveExport(blob, name), retrySave: flush,
    refreshView: async () => {
      try { await flush(); await personalQueue.current.catch(()=>{});if(ports.defaultCodexMode==='real'&&ports.codex.manageSkill){const preferences=validateCustomization(await ports.codex.manageSkill('personal-read',{}));personalRef.current=preferences;personalReadyRef.current=true;setPersonal(preferences);setPersonalReady(true);}await syncBridge(); await flush(); setError(''); }
      catch (failure) { setError(failure instanceof Error ? failure.message : '刷新失败，请重试'); throw failure; }
    },
  };
  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}
export function useCanvas() { const value = useContext(CanvasContext); if (!value) throw new Error('CanvasProvider is missing'); return value; }
