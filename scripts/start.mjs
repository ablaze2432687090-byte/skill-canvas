import { spawn } from 'node:child_process';
import net from 'node:net';
const ports = [4717, 5173];
async function available(port) { return new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); }); }
try { for (const port of ports) await available(port); }
catch { console.error('Skill Canvas 端口 4717 或 5173 已被占用。请先关闭已有服务，或使用已运行的页面。'); process.exit(1); }
const children = ['bridge/server/index.mjs', 'node_modules/vite/bin/vite.js'].map((script, index) => spawn(process.execPath, [script, ...(index ? ['--host', '127.0.0.1', '--port', '5173', '--strictPort'] : [])], { stdio: index ? 'inherit' : ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true }));
let stopping = false;
const stop = () => { if (stopping) return; stopping = true; if (children[0].connected) children[0].send({ type: 'shutdown' }, () => {}); else children[0].kill(); children[1].kill(); const deadline = setTimeout(() => children[0].kill(), 3000); deadline.unref(); };
children.forEach(child => { child.on('exit', code => { process.exitCode = code || 0; stop(); }); child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); }); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
