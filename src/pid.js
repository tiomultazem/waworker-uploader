import fs from 'fs';
import { execSync } from 'child_process';

const CONFIG_PATH = './config.json';

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

export function killOldInstance() {
  const config = readConfig();
  const oldPid = config.pid;

  if (!oldPid || oldPid === process.pid) return;

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${oldPid} /T`, { stdio: 'ignore' });
    } else {
      process.kill(oldPid, 'SIGKILL');
    }
    console.log(`🔪 Instance lama (PID ${oldPid}) dihentikan.`);
  } catch {
    // Proses sudah mati
  }
}

export function registerPid() {
  const config = readConfig();
  config.pid = process.pid;
  writeConfig(config);
  console.log(`📌 PID terdaftar: ${process.pid}`);
}

export function clearPid() {
  const config = readConfig();
  if (config.pid === process.pid) {
    delete config.pid;
    writeConfig(config);
  }
}
