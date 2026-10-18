import { useEffect } from 'react';
import { t } from './application/i18n';
import { AppShell } from './components/AppShell';
import { EmptyState } from './components/primitives';
import { Link, useLocation, useScrollRestoration } from './application/router';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { SkillDetailPage } from './pages/SkillDetailPage';
import { CreatePage } from './pages/CreatePage';
import { TaskPage } from './pages/TaskPage';
import { ResultPage } from './pages/ResultPage';
import { ProjectsPage, UtilityPage } from './pages/UtilityPages';
import { useCanvas } from './application/CanvasProvider';
import { DesktopServiceNotice } from './components/DesktopServiceNotice';
import { DesktopSetup, DesktopUpdateNotice } from './components/DesktopSetup';

export default function App() {
  const { path } = useLocation();
  const { ready, error } = useCanvas();
  useScrollRestoration(ready);
  const parts = path.split('/').filter(Boolean);
  useEffect(() => { document.title = 'Skill Canvas'; }, [path]);
  if (!ready) return <AppShell><EmptyState title={t(error ? '本地数据加载失败' : '正在读取本地数据…')} description={t(error || '正在恢复 Skill 和创作项目。')} action={error ? <button onClick={() => window.location.reload()}>{t('重新加载')}</button> : undefined} /></AppShell>;
  let page;
  if (path === '/' || path === '/home') page = <HomePage />;
  else if (path === '/skills') page = <LibraryPage />;
  else if (parts[0] === 'skills' && parts.length === 2) page = <SkillDetailPage key={parts[1]} id={parts[1]} />;
  else if (path === '/create') page = <CreatePage />;
  else if (parts[0] === 'task' && parts.length === 2) page = <TaskPage key={parts[1]} id={parts[1]} />;
  else if (parts[0] === 'result' && parts.length === 2) page = <ResultPage key={parts[1]} id={parts[1]} />;
  else if (path === '/projects') page = <ProjectsPage />;
  else if (path === '/manage' || path === '/settings') page = <UtilityPage kind={path === '/manage' ? 'manage' : 'settings'} />;
  else page = <EmptyState title={t('页面不存在')} description={t('请选择左侧导航继续浏览。')} action={<Link href="/">{t('返回首页')}</Link>} />;
  return <AppShell><DesktopServiceNotice /><DesktopUpdateNotice /><DesktopSetup />{error && <p role="alert" className="field-error">{t(error)} {t('· 可在设置中重新检测连接。')}</p>}{page}</AppShell>;
}
