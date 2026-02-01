#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import si from 'systeminformation';

const showWelcome = () => {
    console.log(`
${chalk.green.bold('⚡ OS-NERVE INSTALLED')}
${chalk.gray('The nerve center for your system is now active.')}

${chalk.white.bold('🔗 GitHub:')} ${chalk.blue('https://github.com/Eul45/os-nerve')}
${chalk.white.bold('👤 Author:')} ${chalk.yellow('Eyuel Engida')}

Type ${chalk.cyan.bold('nerve dash')} to begin.
`);
};

program.name('nerve').version('1.2.0');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function showDashboard() {
    const spinner = ora('Measuring System Vitals (1s scan)...').start();
    const defaultIf = await si.networkInterfaceDefault();
    await si.networkStats(defaultIf);
    await sleep(1000);

    const [cpu, mem, battery, netData] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.battery(),
        si.networkStats(defaultIf)
    ]);
    
    spinner.stop();
    console.clear();

    const net = netData[0];

    console.log(chalk.magenta.bold('\n--- 🛠️  OS-NERVE SYSTEM DASHBOARD ---'));
    console.log(chalk.cyan(' [System]'));
    console.log(`  CPU Load: ${chalk.yellow(cpu.currentLoad.toFixed(1) + '%')}`);
    console.log(`  RAM:      ${chalk.yellow((mem.active / 1024 / 1024 / 1024).toFixed(2))} / ${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB`);
    
    if (battery.hasBattery) {
        console.log(`  Battery:  ${chalk.green(battery.percent + '%')} (${battery.isCharging ? 'Charging' : 'Discharging'})`);
    }

    console.log(chalk.cyan('\n [Network]'));
    if (net) {
        console.log(`  Download: ${chalk.white((net.rx_sec / 1024).toFixed(2))} KB/s`);
        console.log(`  Upload:   ${chalk.white((net.tx_sec / 1024).toFixed(2))} KB/s`);
    } else {
        console.log(chalk.gray('  Offline or No Interface Found'));
    }
    console.log(chalk.magenta('--------------------------------\n'));
}

program
  .command('dash')
  .description('Launch the dashboard')
  .action(async () => {
    showWelcome();
    
    let keepRunning = true;
    while (keepRunning) {
        const { action } = await inquirer.prompt([{
            type: 'rawlist', 
            name: 'action',
            message: 'Menu:',
            choices: ['Launch Dashboard', 'Exit']
        }]);

        if (action === 'Launch Dashboard') {
            await showDashboard();
        } else {
           console.log(chalk.yellow('See you later, Captain.'));
            keepRunning = false;
            process.exit();
        }
    }
  });

program.parse();