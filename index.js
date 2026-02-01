#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import si from 'systeminformation';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Helpers ---
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getDefaultNetworkInterface() {
  try {
    return await si.networkInterfaceDefault();
  } catch {
    return null;
  }
}

// Terminal hyperlink (OSC 8) so Ctrl+Click opens the URL in Cursor/VS Code and other terminals
function terminalLink(url, label = url) {
  const OSC = '\x1b]8;;';
  const BEL = '\x07';
  const ST = '\x1b\\';
  return `${OSC}${url}${BEL}${label}${OSC}${BEL}`;
}

// --- Welcome (shown when no command) ---
function showWelcome() {
  const ghUrl = 'https://github.com/Eul45/os-nerve';
  const ghLink = terminalLink(ghUrl, chalk.blue(ghUrl));
  console.log(`
${chalk.green.bold('⚡ OS-NERVE')}
${chalk.gray('The nerve center for your system.')}

${chalk.white.bold('Quick start:')} ${chalk.cyan('nerve dash')} ${chalk.gray('— full dashboard')}
${chalk.white.bold('Live mode:')}  ${chalk.cyan('nerve dash --live')} ${chalk.gray('— auto-refresh every 2s')}
${chalk.white.bold('Processes:')}  ${chalk.cyan('nerve top')} ${chalk.gray('— top processes by CPU/RAM')}
${chalk.white.bold('Export:')}     ${chalk.cyan('nerve report')} ${chalk.gray('— JSON snapshot for scripts')}

${chalk.white.bold('🔗 GitHub:')} ${ghLink} ${chalk.dim('(Ctrl+Click to open)')}
${chalk.white.bold('👤 Author:')} ${chalk.yellow('Eyuel Engida')}
`);
}

// --- Dashboard (one-shot) ---
async function showDashboard(spinner = null) {
  const defaultIf = await getDefaultNetworkInterface();
  // Network rate (rx_sec/tx_sec) needs two samples over time; first call is always 0. Prime it.
  if (defaultIf) {
    if (spinner) spinner.text = 'Measuring network (1s)...';
    await si.networkStats(defaultIf).catch(() => []);
    await sleep(1000);
  }
  if (spinner) {
    spinner.text = 'Measuring CPU & memory...';
    const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
    spinner.text = 'Measuring network & disk...';
    const [battery, netData, diskData] = await Promise.all([
      si.battery().catch(() => ({ hasBattery: false })),
      defaultIf ? si.networkStats(defaultIf).catch(() => []) : Promise.resolve([]),
      si.fsSize().catch(() => [])
    ]);
    if (spinner.isSpinning) spinner.stop();
    renderDashboard(cpu, mem, battery, netData, diskData);
    return;
  }
  const [cpu, mem, battery, netData, diskData] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.battery().catch(() => ({ hasBattery: false })),
    defaultIf ? si.networkStats(defaultIf).catch(() => []) : Promise.resolve([]),
    si.fsSize().catch(() => [])
  ]);
  renderDashboard(cpu, mem, battery, netData, diskData);
}

function renderDashboard(cpu, mem, battery, netData, diskData) {
  const net = Array.isArray(netData) && netData[0] ? netData[0] : null;
  const totalDisk = diskData.length ? diskData.reduce((a, d) => a + d.size, 0) : 0;
  const usedDisk = diskData.length ? diskData.reduce((a, d) => a + d.used, 0) : 0;

  console.log(chalk.magenta.bold('\n--- 🛠️  OS-NERVE DASHBOARD ---'));
  console.log(chalk.cyan(' [System]'));
  console.log(`  CPU:     ${chalk.yellow(cpu.currentLoad.toFixed(1) + '%')} load`);
  console.log(`  RAM:     ${chalk.yellow(formatBytes(mem.active))} / ${formatBytes(mem.total)} active`);
  if (battery.hasBattery) {
    console.log(`  Battery: ${chalk.green(battery.percent + '%')} ${battery.isCharging ? '(charging)' : '(discharging)'}`);
  }
  console.log(chalk.cyan(' [Storage]'));
  if (totalDisk) {
    const pct = ((usedDisk / totalDisk) * 100).toFixed(1);
    console.log(`  Disk:    ${chalk.yellow(formatBytes(usedDisk))} / ${formatBytes(totalDisk)} (${pct}% used)`);
  } else {
    console.log(chalk.gray('  (no disk data)'));
  }
  console.log(chalk.cyan(' [Network]'));
  if (net) {
    console.log(`  ↓ ${chalk.white((net.rx_sec / 1024).toFixed(2) + ' KB/s')}  ↑ ${chalk.white((net.tx_sec / 1024).toFixed(2) + ' KB/s')}`);
  } else {
    console.log(chalk.gray('  Offline or no interface'));
  }
  console.log(chalk.magenta('--------------------------------\n'));
}

// --- Live dashboard (refresh loop) ---
async function runLiveDashboard(intervalMs = 2000) {
  const run = async () => {
    await showDashboard();
    console.log(chalk.dim(`Refreshing in ${intervalMs / 1000}s... (Ctrl+C to exit)`));
  };
  await run();
  setInterval(run, intervalMs);
}

// --- One-shot commands ---
async function cmdCpu() {
  const cpu = await si.currentLoad();
  console.log(chalk.cyan.bold('CPU'));
  console.log(`  Load:   ${chalk.yellow(cpu.currentLoad.toFixed(1) + '%')}`);
  console.log(`  User:   ${cpu.currentLoadUser.toFixed(1)}%  System: ${cpu.currentLoadSystem.toFixed(1)}%  Idle: ${cpu.currentLoadIdle.toFixed(1)}%`);
}

async function cmdMem() {
  const mem = await si.mem();
  const used = mem.total - mem.available;
  const pct = ((used / mem.total) * 100).toFixed(1);
  console.log(chalk.cyan.bold('Memory'));
  console.log(`  Used:   ${chalk.yellow(formatBytes(used))} (${pct}%)`);
  console.log(`  Total:  ${formatBytes(mem.total)}`);
  console.log(`  Active: ${formatBytes(mem.active)}`);
}

async function cmdNet() {
  const defaultIf = await getDefaultNetworkInterface();
  if (!defaultIf) {
    console.log(chalk.gray('No default network interface.'));
    return;
  }
  const stats = await si.networkStats(defaultIf).catch(() => []);
  const net = stats[0];
  if (!net) {
    console.log(chalk.gray('No network stats.'));
    return;
  }
  console.log(chalk.cyan.bold('Network') + chalk.gray(` (${defaultIf})`));
  console.log(`  Download: ${chalk.white((net.rx_sec / 1024).toFixed(2) + ' KB/s')}`);
  console.log(`  Upload:   ${chalk.white((net.tx_sec / 1024).toFixed(2) + ' KB/s')}`);
}

async function cmdDisk() {
  const disks = await si.fsSize().catch(() => []);
  if (!disks.length) {
    console.log(chalk.gray('No disk data.'));
    return;
  }
  console.log(chalk.cyan.bold('Storage'));
  for (const d of disks) {
    const pct = ((d.used / d.size) * 100).toFixed(1);
    console.log(`  ${d.mount}  ${chalk.yellow(formatBytes(d.used))} / ${formatBytes(d.size)} (${pct}%)`);
  }
}

async function cmdBattery() {
  const bat = await si.battery().catch(() => ({ hasBattery: false }));
  if (!bat.hasBattery) {
    console.log(chalk.gray('No battery (desktop/server).'));
    return;
  }
  console.log(chalk.cyan.bold('Battery'));
  console.log(`  Level:    ${chalk.green(bat.percent + '%')}`);
  console.log(`  State:    ${bat.isCharging ? 'Charging' : 'Discharging'}`);
  if (bat.timeRemaining !== null && !bat.isCharging) {
    const m = Math.floor(bat.timeRemaining / 60);
    console.log(`  Left:     ~${m} min`);
  }
}

async function cmdTop(limit = 10) {
  const { list } = await si.processes().catch(() => ({ list: [] }));
  const byCpu = [...list]
    .filter((p) => p.cpu !== undefined && p.cpu > 0)
    .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
    .slice(0, limit);
  console.log(chalk.cyan.bold(`Top ${limit} processes by CPU`));
  console.log(chalk.dim('  PID    CPU%   MEM%   Name'));
  for (const p of byCpu) {
    const name = (p.name || '').slice(0, 30);
    console.log(`  ${String(p.pid).padEnd(6)} ${String((p.cpu || 0).toFixed(1)).padStart(5)}% ${String((p.mem || 0).toFixed(1)).padStart(5)}%  ${name}`);
  }
  if (!byCpu.length) console.log(chalk.gray('  No data.'));
}

async function cmdReport(json = false) {
  const defaultIf = await getDefaultNetworkInterface();
  const [cpu, mem, battery, netData, diskData, osInfo] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.battery().catch(() => ({ hasBattery: false, percent: null, isCharging: false })),
    defaultIf ? si.networkStats(defaultIf).catch(() => []) : Promise.resolve([]),
    si.fsSize().catch(() => []),
    si.osInfo().catch(() => ({}))
  ]);
  const net = Array.isArray(netData) && netData[0] ? netData[0] : null;
  const totalDisk = diskData.length ? diskData.reduce((a, d) => a + d.size, 0) : 0;
  const usedDisk = diskData.length ? diskData.reduce((a, d) => a + d.used, 0) : 0;

  const report = {
    timestamp: new Date().toISOString(),
    os: osInfo.platform || process.platform,
    cpu: { load: cpu.currentLoad, user: cpu.currentLoadUser, system: cpu.currentLoadSystem },
    memory: { used: mem.active, total: mem.total, usedBytes: mem.total - mem.available },
    battery: battery.hasBattery ? { percent: battery.percent, charging: battery.isCharging } : null,
    disk: totalDisk ? { used: usedDisk, total: totalDisk } : null,
    network: net ? { rx_sec: net.rx_sec, tx_sec: net.tx_sec } : null
  };

  if (json) {
    console.log(JSON.stringify(report, null, 0));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

// --- CLI ---
program.name('nerve').version('1.3.0').description('System vitals and hardware monitor for the terminal');

program
  .command('dash')
  .description('Show system dashboard (CPU, RAM, disk, network, battery)')
  .option('-l, --live', 'Refresh every 2 seconds')
  .option('-i, --interval <seconds>', 'Refresh interval in seconds (with --live)', '2')
  .action(async (opts) => {
    if (opts.live) {
      const sec = Math.max(1, parseInt(opts.interval, 10) || 2);
      await runLiveDashboard(sec * 1000);
    } else {
      let keepRunning = true;
      while (keepRunning) {
        const spinner = ora('Measuring CPU & memory...').start();
        await showDashboard(spinner);
        const { action } = await inquirer.prompt([
          {
            type: 'rawlist',
            name: 'action',
            message: 'Next:',
            choices: ['Refresh', 'Show options', 'Exit']
          }
        ]);
        if (action === 'Exit') {
          console.log(chalk.yellow('See you later, Captain.'));
          keepRunning = false;
          process.exit(0);
        }
        if (action.startsWith('Show options')) {
          showWelcome();
          process.exit(0);
        }
      }
    }
  });

program.command('cpu').description('Show CPU load').action(cmdCpu);
program.command('mem').description('Show memory usage').action(cmdMem);
program.command('net').description('Show network speed').action(cmdNet);
program.command('disk').description('Show disk usage').action(cmdDisk);
program.command('battery').description('Show battery status').action(cmdBattery);

program
  .command('top')
  .description('Top processes by CPU')
  .option('-n, --lines <number>', 'Number of processes', '10')
  .action(async (opts) => {
    const n = Math.max(1, Math.min(50, parseInt(opts.lines, 10) || 10));
    await cmdTop(n);
  });

program
  .command('report')
  .description('Export system snapshot (JSON, for scripts)')
  .option('-j, --json', 'Compact JSON (one line)')
  .action(async (opts) => {
    await cmdReport(!!opts.json);
  });

program.action(() => {
  showWelcome();
  program.outputHelp();
});

program.parse();
