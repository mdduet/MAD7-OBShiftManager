const { spawn } = require('child_process');

const processes = [];
const commands = [
  { name: 'static', args: ['serve-static.js'], color: '\x1b[32m' },
  { name: 'proxy', args: ['proxy-server.js'], color: '\x1b[36m' }
];

function startProcess(command, label) {
  const nodePath = process.execPath;
  const env = { ...process.env };
  if (label === 'static') {
    env.SERVE_PORT = '8003';
  }
  if (label === 'proxy') {
    env.PACKMAN_PROXY_PORT = '3002';
  }
  const proc = spawn(nodePath, command.args, { stdio: 'inherit', shell: false, env });
  processes.push(proc);

  proc.on('exit', code => {
    console.log(`${label} exited with code ${code}`);
    shutdown(code || 0);
  });

  proc.on('error', err => {
    console.error(`${label} failed to start:`, err.message);
    shutdown(1);
  });
}

function shutdown(code) {
  while (processes.length) {
    const proc = processes.pop();
    if (!proc.killed) proc.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('🚀 Starting development environment...');
console.log('➡️ Static server: http://localhost:8003');
console.log('➡️ Packman proxy: http://localhost:3002/api/packman');
commands.forEach(cmd => startProcess(cmd, cmd.name));
