async function render() {
  const info = await window.skillCanvasDesktop.info();
  document.documentElement.dataset.theme=info.theme==='gold'?'gold':info.theme==='light'?'light':info.theme==='dark'?'dark':localStorage.getItem('skill-canvas-theme')==='gold'?'gold':localStorage.getItem('skill-canvas-theme')==='light'?'light':'dark';
  document.documentElement.lang=info.language;
  const messages=await window.skillCanvasDesktop.translations(),t=value=>messages[value]||value;
  const migration = info.needsMigration;
  document.getElementById('title').textContent = t(migration ? '保留你的已有创作' : '无法启动本地服务');
  document.getElementById('description').textContent = t(migration ? '检测到旧版数据。复制并校验项目、原图和 Skill 后切换到桌面数据目录，旧文件不会删除。浏览器中未提交的草稿不会随磁盘迁移。' : '已有作品不会受影响。请重试启动本地服务。');
  document.getElementById('detail').textContent = t(info.startupError) || info.legacyWorkspace || '';
  const actions = document.getElementById('actions'); actions.replaceChildren();
  for (const [label, mode] of info.dataLocationError ? [['重新连接数据目录','reconnect'],['重新尝试','restart']] : migration ? [['复制并迁移','copy'],['暂不迁移','skip'],['选择旧版目录','choose']] : [['重新尝试','restart']]) {
    const button=document.createElement('button'); button.textContent=t(label); actions.append(button);
    button.onclick=async()=>{ for (const b of actions.children) b.disabled=true; try { if(mode==='reconnect') await window.skillCanvasDesktop.reconnectDataLocation(); else if(mode==='restart') await window.skillCanvasDesktop.restartBridge(); else await window.skillCanvasDesktop.migrate(mode); } catch(error) {document.getElementById('detail').textContent=error.message; for(const b of actions.children)b.disabled=false;} };
  }
}
render();
