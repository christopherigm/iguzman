#!/usr/bin/env node
/**
 * setup-dev-env.mjs
 *
 * Interactive development environment setup script.
 * Checks and installs: git, Node.js, pnpm, Docker, kubectl, Helm,
 * bash-git-prompt, Python, Django, and Claude Code CLI.
 *
 * Run: node scripts/setup-dev-env.mjs
 */

import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// ── ANSI Colors ───────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

const clr = {
  green: (s) => `${C.green}${s}${C.reset}`,
  red: (s) => `${C.red}${s}${C.reset}`,
  yellow: (s) => `${C.yellow}${s}${C.reset}`,
  cyan: (s) => `${C.cyan}${s}${C.reset}`,
  blue: (s) => `${C.blue}${s}${C.reset}`,
  magenta: (s) => `${C.magenta}${s}${C.reset}`,
  bold: (s) => `${C.bold}${s}${C.reset}`,
  dim: (s) => `${C.dim}${s}${C.reset}`,
  boldCyan: (s) => `${C.bold}${C.cyan}${s}${C.reset}`,
  boldGreen: (s) => `${C.bold}${C.green}${s}${C.reset}`,
  boldYellow: (s) => `${C.bold}${C.yellow}${s}${C.reset}`,
};

// ── i18n ──────────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    langPrompt: 'Select language / Selecciona idioma',
    langOptions: '[en/es]',
    welcome: 'Development Environment Setup',
    subtitle:
      'This script will check and install the required tools for development.',
    checking: 'Checking installed tools...',
    installed: 'installed',
    notInstalled: 'not installed',
    selectPrompt:
      'Use arrow keys to navigate, Space to toggle, Enter to confirm.\n' +
      '  Already-installed tools are pre-selected and cannot be deselected.',
    confirmInstall: 'The following tools will be installed:',
    confirmPrompt: 'Proceed? [y/n]',
    installing: 'Installing',
    installDone: 'Done',
    installFail: 'Failed to install',
    nothingToInstall:
      'Nothing to install — all selected tools are already present.',
    skipped: 'Installation skipped.',
    sshChecking: 'Checking for SSH key...',
    sshFound: 'SSH key found',
    sshNotFound: 'No SSH key found.',
    sshCreatePrompt: 'Create a new SSH key? [y/n]',
    sshEmail: 'Email address for the SSH key',
    sshKeyType: 'Key type',
    sshKeyTypeOptions: '[ed25519/rsa]',
    sshCreating: 'Creating SSH key...',
    sshCreated: 'SSH key created:',
    sshPublicKey: 'Public key (add to GitHub / GitLab):',
    dockerLoginPrompt: 'Docker is installed. Do you want to login now? [y/n]',
    claudeLoginPrompt:
      'Claude Code is installed. Do you want to login now? [y/n]',
    allDone: 'Setup complete! Happy coding.',
    tools: {
      git: 'Version control system',
      nodejs: 'JavaScript runtime',
      pnpm: 'Fast, disk-efficient package manager',
      docker: 'Container platform',
      kubectl: 'Kubernetes CLI',
      helm: 'Kubernetes package manager',
      bashGitPrompt: 'Git status in your shell prompt',
      python: 'Programming language (latest)',
      django: 'Python web framework',
      claude: 'AI coding assistant CLI',
    },
    installNote: {
      bashGitPrompt:
        'Add this to your ~/.bashrc or ~/.bash_profile to enable bash-git-prompt:\n' +
        '  GIT_PROMPT_ONLY_IN_REPO=1\n' +
        '  source ~/.bash-git-prompt/gitprompt.sh',
    },
  },
  es: {
    langPrompt: 'Select language / Selecciona idioma',
    langOptions: '[en/es]',
    welcome: 'Configuración del Entorno de Desarrollo',
    subtitle:
      'Este script verificará e instalará las herramientas necesarias para desarrollo.',
    checking: 'Verificando herramientas instaladas...',
    installed: 'instalado',
    notInstalled: 'no instalado',
    selectPrompt:
      'Usa las flechas para navegar, Espacio para seleccionar, Enter para confirmar.\n' +
      '  Las herramientas ya instaladas están preseleccionadas y no se pueden deseleccionar.',
    confirmInstall: 'Se instalarán las siguientes herramientas:',
    confirmPrompt: '¿Continuar? [s/n]',
    installing: 'Instalando',
    installDone: 'Listo',
    installFail: 'Error al instalar',
    nothingToInstall:
      'Nada que instalar — todas las herramientas seleccionadas ya están presentes.',
    skipped: 'Instalación omitida.',
    sshChecking: 'Verificando llave SSH...',
    sshFound: 'Llave SSH encontrada',
    sshNotFound: 'No se encontró ninguna llave SSH.',
    sshCreatePrompt: '¿Crear una nueva llave SSH? [s/n]',
    sshEmail: 'Correo electrónico para la llave SSH',
    sshKeyType: 'Tipo de llave',
    sshKeyTypeOptions: '[ed25519/rsa]',
    sshCreating: 'Creando llave SSH...',
    sshCreated: 'Llave SSH creada:',
    sshPublicKey: 'Llave pública (agrégala a GitHub / GitLab):',
    dockerLoginPrompt:
      'Docker está instalado. ¿Deseas iniciar sesión ahora? [s/n]',
    claudeLoginPrompt:
      'Claude Code está instalado. ¿Deseas iniciar sesión ahora? [s/n]',
    allDone: '¡Configuración completada! Feliz codificación.',
    tools: {
      git: 'Sistema de control de versiones',
      nodejs: 'Entorno de ejecución de JavaScript',
      pnpm: 'Gestor de paquetes rápido y eficiente',
      docker: 'Plataforma de contenedores',
      kubectl: 'CLI de Kubernetes',
      helm: 'Gestor de paquetes para Kubernetes',
      bashGitPrompt: 'Estado de Git en el prompt del shell',
      python: 'Lenguaje de programación (última versión)',
      django: 'Framework web de Python',
      claude: 'Asistente de código con IA',
    },
    installNote: {
      bashGitPrompt:
        'Agrega esto a tu ~/.bashrc o ~/.bash_profile para activar bash-git-prompt:\n' +
        '  GIT_PROMPT_ONLY_IN_REPO=1\n' +
        '  source ~/.bash-git-prompt/gitprompt.sh',
    },
  },
};

// ── Shell helpers ─────────────────────────────────────────────────────────────

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', shell: true }).toString().trim();
  } catch {
    return null;
  }
}

function runInteractive(cmd) {
  const result = spawnSync('bash', ['-c', cmd], { stdio: 'inherit' });
  return result.status === 0;
}


function isLinux() {
  return platform() === 'linux';
}

function isMac() {
  return platform() === 'darwin';
}

function hasBrew() {
  return tryExec('command -v brew') !== null;
}

function hasApt() {
  return tryExec('command -v apt-get') !== null;
}

function hasYum() {
  return tryExec('command -v yum') !== null;
}

function hasDnf() {
  return tryExec('command -v dnf') !== null;
}

// ── Install functions ─────────────────────────────────────────────────────────

function installGit() {
  if (isMac() && hasBrew()) return runInteractive('brew install git');
  if (hasApt())
    return runInteractive('sudo apt-get update && sudo apt-get install -y git');
  if (hasDnf()) return runInteractive('sudo dnf install -y git');
  if (hasYum()) return runInteractive('sudo yum install -y git');
  console.log(
    clr.yellow('  Please install Git manually: https://git-scm.com/downloads'),
  );
  return false;
}

function installNodejs() {
  console.log(clr.dim('  Installing Node.js via NodeSource (LTS)...'));
  if (isLinux() && hasApt()) {
    return runInteractive(
      'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
    );
  }
  if (isMac() && hasBrew()) return runInteractive('brew install node');
  console.log(
    clr.yellow('  Please install Node.js manually: https://nodejs.org'),
  );
  return false;
}

function installDocker() {
  if (isLinux()) {
    return runInteractive(
      'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER',
    );
  }
  if (isMac() && hasBrew()) {
    return runInteractive('brew install --cask docker');
  }
  console.log(
    clr.yellow(
      '  Please install Docker manually: https://docs.docker.com/get-docker/',
    ),
  );
  return false;
}

function installKubectl() {
  if (isLinux()) {
    if (tryExec('command -v snap') !== null) {
      return runInteractive('sudo snap install kubectl --classic');
    }
    if (hasApt()) {
      return runInteractive(
        'curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg && ' +
          "echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list && " +
          'sudo apt-get update && sudo apt-get install -y kubectl',
      );
    }
  }
  if (isMac() && hasBrew()) return runInteractive('brew install kubectl');
  console.log(
    clr.yellow(
      '  Please install kubectl manually: https://kubernetes.io/docs/tasks/tools/',
    ),
  );
  return false;
}

function installHelm() {
  return runInteractive(
    'curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash',
  );
}

function installBashGitPrompt() {
  const dest = join(homedir(), '.bash-git-prompt');
  if (existsSync(dest)) return true;
  return runInteractive(
    `git clone https://github.com/magicmonty/bash-git-prompt.git ${dest} --depth=1`,
  );
}

function installPython() {
  if (isMac() && hasBrew()) return runInteractive('brew install python3');
  if (hasApt())
    return runInteractive(
      'sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv',
    );
  if (hasDnf())
    return runInteractive('sudo dnf install -y python3 python3-pip');
  if (hasYum())
    return runInteractive('sudo yum install -y python3 python3-pip');
  console.log(
    clr.yellow(
      '  Please install Python manually: https://www.python.org/downloads/',
    ),
  );
  return false;
}

function installDjango() {
  if (tryExec('command -v pip3') !== null)
    return runInteractive('pip3 install django');
  if (tryExec('command -v pip') !== null)
    return runInteractive('pip install django');
  console.log(
    clr.yellow(
      '  pip not found. Install Python first, then run: pip3 install django',
    ),
  );
  return false;
}

function installPnpm() {
  if (tryExec('command -v npm') !== null)
    return runInteractive('npm install -g pnpm');
  if (isMac() && hasBrew()) return runInteractive('brew install pnpm');
  if (isLinux())
    return runInteractive('curl -fsSL https://get.pnpm.io/install.sh | sh -');
  console.log(
    clr.yellow('  Please install pnpm manually: https://pnpm.io/installation'),
  );
  return false;
}

function installClaude() {
  if (tryExec('command -v npm') !== null)
    return runInteractive('npm install -g @anthropic-ai/claude-code');
  console.log(
    clr.yellow(
      '  npm not found. Install Node.js first, then run: npm install -g @anthropic-ai/claude-code',
    ),
  );
  return false;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

function buildTools(t) {
  return [
    {
      id: 'git',
      label: 'Git',
      description: t.tools.git,
      check: () => tryExec('git --version') !== null,
      version: () => tryExec('git --version'),
      install: installGit,
    },
    {
      id: 'nodejs',
      label: 'Node.js',
      description: t.tools.nodejs,
      check: () => tryExec('node --version') !== null,
      version: () => tryExec('node --version'),
      install: installNodejs,
    },
    {
      id: 'pnpm',
      label: 'pnpm',
      description: t.tools.pnpm,
      check: () => tryExec('pnpm --version') !== null,
      version: () => {
        const v = tryExec('pnpm --version');
        return v ? `pnpm ${v}` : null;
      },
      install: installPnpm,
    },
    {
      id: 'docker',
      label: 'Docker',
      description: t.tools.docker,
      check: () => tryExec('docker --version') !== null,
      version: () => tryExec('docker --version'),
      install: installDocker,
    },
    {
      id: 'kubectl',
      label: 'kubectl',
      description: t.tools.kubectl,
      check: () => tryExec('kubectl version --client 2>/dev/null') !== null,
      version: () =>
        tryExec('kubectl version --client --short 2>/dev/null') ||
        tryExec('kubectl version --client 2>/dev/null | head -1'),
      install: installKubectl,
    },
    {
      id: 'helm',
      label: 'Helm',
      description: t.tools.helm,
      check: () => tryExec('helm version 2>/dev/null') !== null,
      version: () => tryExec('helm version --short 2>/dev/null'),
      install: installHelm,
    },
    {
      id: 'bash-git-prompt',
      label: 'bash-git-prompt',
      description: t.tools.bashGitPrompt,
      check: () => existsSync(join(homedir(), '.bash-git-prompt')),
      version: () =>
        existsSync(join(homedir(), '.bash-git-prompt'))
          ? join(homedir(), '.bash-git-prompt')
          : null,
      install: installBashGitPrompt,
    },
    {
      id: 'python',
      label: 'Python',
      description: t.tools.python,
      check: () => tryExec('python3 --version') !== null,
      version: () => tryExec('python3 --version'),
      install: installPython,
    },
    {
      id: 'django',
      label: 'Django',
      description: t.tools.django,
      check: () => tryExec('python3 -m django --version 2>/dev/null') !== null,
      version: () => {
        const v = tryExec('python3 -m django --version 2>/dev/null');
        return v ? `Django ${v}` : null;
      },
      install: installDjango,
    },
    {
      id: 'claude',
      label: 'Claude Code',
      description: t.tools.claude,
      check: () => tryExec('claude --version 2>/dev/null') !== null,
      version: () => tryExec('claude --version 2>/dev/null'),
      install: installClaude,
    },
  ];
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

function printHeader(t) {
  const line = '─'.repeat(54);
  console.log('');
  console.log(`  ${clr.boldCyan('┌' + line + '┐')}`);
  console.log(
    `  ${clr.boldCyan('│')}  ${clr.bold(t.welcome.padEnd(52))}${clr.boldCyan('│')}`,
  );
  console.log(
    `  ${clr.boldCyan('│')}  ${clr.dim(t.subtitle.slice(0, 52).padEnd(52))}${clr.boldCyan('│')}`,
  );
  console.log(`  ${clr.boldCyan('└' + line + '┘')}`);
  console.log('');
}

function printToolList(tools, t) {
  const labelWidth = 18;
  const versionWidth = 28;

  console.log(`  ${clr.bold('Tool Status')}`);
  console.log(`  ${'─'.repeat(62)}`);

  tools.forEach((tool, idx) => {
    const num = String(idx + 1).padStart(2);
    const checkbox = tool.installed ? clr.boldGreen('[✓]') : clr.dim('[ ]');
    const label = (tool.label + ' ').padEnd(labelWidth);
    const version = tool.installed
      ? clr.dim(
          (tool.versionStr || t.installed)
            .slice(0, versionWidth - 1)
            .padEnd(versionWidth),
        )
      : clr.red(t.notInstalled.padEnd(versionWidth));
    const desc = clr.dim(tool.description);

    console.log(
      `  ${clr.dim(num)}  ${checkbox} ${clr.bold(label)} ${version}  ${desc}`,
    );
  });

  console.log(`  ${'─'.repeat(62)}`);
  console.log('');
}

// ── Interactive Checkbox Selector ─────────────────────────────────────────────
//
// Arrow keys to move cursor, Space to toggle, Enter to confirm.
// Already-installed items are locked (cannot be deselected).
//

function interactiveSelect(tools) {
  return new Promise((resolve) => {
    // selected = Set of tool ids the user wants installed
    const selected = new Set(tools.filter((t) => t.installed).map((t) => t.id));
    let cursor = 0;

    // Move cursor to first non-installed item
    const firstUninstalled = tools.findIndex((t) => !t.installed);
    if (firstUninstalled !== -1) cursor = firstUninstalled;

    const labelWidth = 18;

    function renderLines() {
      const lines = tools.map((tool, idx) => {
        const isActive = idx === cursor;
        const isLocked = tool.installed;
        const isChecked = selected.has(tool.id);

        let checkbox;
        if (isLocked) {
          checkbox = clr.boldGreen('[✓]');
        } else if (isChecked) {
          checkbox = `${C.bold}${C.cyan}[✓]${C.reset}`;
        } else {
          checkbox = clr.dim('[ ]');
        }

        const label = tool.label.padEnd(labelWidth);
        const pointer = isActive && !isLocked ? clr.cyan('▶') : ' ';
        const labelStr =
          isActive && !isLocked
            ? clr.boldCyan(label)
            : isLocked
              ? clr.dim(label)
              : label;

        return `  ${pointer} ${checkbox} ${labelStr}`;
      });

      return lines;
    }

    // Initial render
    const lines = renderLines();
    lines.forEach((l) => process.stdout.write(l + '\n'));

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function refresh() {
      // Move cursor up by tools.length lines
      process.stdout.write(`\x1b[${tools.length}A`);
      const updated = renderLines();
      updated.forEach((l) => {
        // Clear line and rewrite
        process.stdout.write('\x1b[2K' + l + '\n');
      });
    }

    process.stdin.on('data', function onKey(key) {
      // Ctrl+C / Ctrl+D → exit
      if (key === '\x03' || key === '\x04') {
        cleanup();
        process.exit(0);
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(tools.filter((t) => selected.has(t.id) && !t.installed));
        return;
      }

      // Space → toggle current item (skip locked)
      if (key === ' ') {
        const tool = tools[cursor];
        if (!tool.installed) {
          if (selected.has(tool.id)) {
            selected.delete(tool.id);
          } else {
            selected.add(tool.id);
          }
          refresh();
        }
        return;
      }

      // Arrow up
      if (key === '\x1b[A') {
        cursor = (cursor - 1 + tools.length) % tools.length;
        refresh();
        return;
      }

      // Arrow down
      if (key === '\x1b[B') {
        cursor = (cursor + 1) % tools.length;
        refresh();
        return;
      }

      // 'a' → select all uninstalled
      if (key === 'a' || key === 'A') {
        tools.forEach((t) => {
          if (!t.installed) selected.add(t.id);
        });
        refresh();
        return;
      }

      // 'n' → deselect all uninstalled
      if (key === 'n' || key === 'N') {
        tools.forEach((t) => {
          if (!t.installed) selected.delete(t.id);
        });
        refresh();
        return;
      }
    });

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
      process.stdout.write('\x1b[?25h'); // show cursor
    }
  });
}

// ── Simple readline prompt ────────────────────────────────────────────────────


function createPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  function prompt(question, defaultValue) {
    const suffix = defaultValue !== undefined ? ` (${defaultValue})` : '';
    return new Promise((resolve) => {
      rl.question(`  ${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });
  }
  return { rl, prompt };
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

function findSshKey() {
  const keyFiles = [
    join(homedir(), '.ssh', 'id_ed25519'),
    join(homedir(), '.ssh', 'id_rsa'),
    join(homedir(), '.ssh', 'id_ecdsa'),
  ];
  return keyFiles.find((f) => existsSync(f)) || null;
}

async function handleSshKey(t, prompt) {
  console.log(`  ${clr.bold(t.sshChecking)}`);
  const existing = findSshKey();

  if (existing) {
    console.log(`  ${clr.boldGreen('✓')} ${t.sshFound}: ${clr.dim(existing)}`);
    try {
      const pub = readFileSync(existing + '.pub', 'utf-8').trim();
      console.log(`\n  ${clr.bold(t.sshPublicKey)}`);
      console.log(`  ${clr.cyan(pub)}`);
    } catch {
      // no pub file — ignore
    }
    console.log('');
    return;
  }

  console.log(`  ${clr.yellow('⚠')}  ${t.sshNotFound}`);
  const create = await prompt(t.sshCreatePrompt);

  if (
    !create.toLowerCase().startsWith('y') &&
    !create.toLowerCase().startsWith('s')
  ) {
    console.log('');
    return;
  }

  const email = await prompt(t.sshEmail, '');
  const keyType =
    (
      await prompt(`${t.sshKeyType} ${t.sshKeyTypeOptions}`, 'ed25519')
    ).trim() || 'ed25519';
  const keyPath = join(homedir(), '.ssh', `id_${keyType}`);

  console.log(`\n  ${t.sshCreating}\n`);

  const emailArg = email ? `-C "${email}"` : '';
  const ok = runInteractive(
    `ssh-keygen -t ${keyType} -f "${keyPath}" ${emailArg}`,
  );

  if (ok) {
    console.log(
      `\n  ${clr.boldGreen('✓')} ${t.sshCreated} ${clr.dim(keyPath)}`,
    );
    try {
      const pub = readFileSync(keyPath + '.pub', 'utf-8').trim();
      console.log(`\n  ${clr.bold(t.sshPublicKey)}`);
      console.log(`  ${clr.cyan(pub)}`);
    } catch {
      // ignore
    }
  }

  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Step 1: Language ──────────────────────────────────────────────────────

  const { rl: rlLang, prompt: promptLang } = createPrompt();
  const rawLang = await promptLang(
    `${STRINGS.en.langPrompt} ${STRINGS.en.langOptions}`,
    'en',
  );
  rlLang.close();

  const lang = rawLang.toLowerCase().startsWith('es') ? 'es' : 'en';
  const t = STRINGS[lang];

  // ── Step 2: Header ────────────────────────────────────────────────────────

  console.clear();
  printHeader(t);

  // ── Step 3: Check installed tools ────────────────────────────────────────

  console.log(`  ${clr.dim(t.checking)}\n`);

  const toolDefs = buildTools(t);
  const tools = toolDefs.map((tool) => {
    const installed = tool.check();
    const versionStr = installed ? tool.version() : null;
    return { ...tool, installed, versionStr };
  });

  printToolList(tools, t);

  // ── Step 4: Interactive selection ─────────────────────────────────────────

  const hasUninstalled = tools.some((t) => !t.installed);

  if (!hasUninstalled) {
    console.log(`  ${clr.boldGreen('✓')} ${t.nothingToInstall}\n`);
  } else {
    console.log(`  ${clr.bold('Select tools to install:')}`);
    console.log(`  ${clr.dim(t.selectPrompt)}`);
    console.log(`  ${clr.dim('(a = select all  ·  n = deselect all)')}\n`);

    const toInstall = await interactiveSelect(tools);

    console.log('');

    if (toInstall.length === 0) {
      console.log(`  ${t.skipped}\n`);
    } else {
      // Confirm
      console.log(`  ${clr.bold(t.confirmInstall)}`);
      toInstall.forEach((tool) => {
        console.log(`    ${clr.cyan('•')} ${tool.label}`);
      });
      console.log('');

      const { rl: rlConfirm, prompt: promptConfirm } = createPrompt();
      const confirm = await promptConfirm(t.confirmPrompt, 'y');
      rlConfirm.close();

      if (
        confirm.toLowerCase().startsWith('y') ||
        confirm.toLowerCase().startsWith('s')
      ) {
        for (const tool of toInstall) {
          console.log(
            `\n  ${clr.boldYellow('→')} ${t.installing} ${clr.bold(tool.label)}...\n`,
          );
          const ok = tool.install();
          if (ok) {
            console.log(
              `\n  ${clr.boldGreen('✓')} ${t.installDone}: ${tool.label}`,
            );
          } else {
            console.log(`\n  ${clr.red('✗')} ${t.installFail}: ${tool.label}`);
          }

          // Post-install notes
          if (t.installNote?.[tool.id]) {
            console.log('');
            console.log(`  ${clr.yellow('ℹ')}  ${t.installNote[tool.id]}`);
          }
        }
        console.log('');
      } else {
        console.log(`  ${t.skipped}\n`);
      }
    }
  }

  // ── Step 5: SSH Key ───────────────────────────────────────────────────────

  const { rl: rlSsh, prompt: promptSsh } = createPrompt();
  await handleSshKey(t, promptSsh);
  rlSsh.close();

  // ── Step 6: Docker login ──────────────────────────────────────────────────

  const dockerInstalled = tryExec('docker --version') !== null;
  if (dockerInstalled) {
    const { rl: rlDocker, prompt: promptDocker } = createPrompt();
    const doLogin = await promptDocker(t.dockerLoginPrompt, 'n');
    rlDocker.close();

    if (
      doLogin.toLowerCase().startsWith('y') ||
      doLogin.toLowerCase().startsWith('s')
    ) {
      console.log('');
      runInteractive('docker login');
      console.log('');
    }
  }

  // ── Step 7: Claude Code login ─────────────────────────────────────────────

  const claudeInstalled = tryExec('claude --version 2>/dev/null') !== null;
  if (claudeInstalled) {
    const { rl: rlClaude, prompt: promptClaude } = createPrompt();
    const doLogin = await promptClaude(t.claudeLoginPrompt, 'n');
    rlClaude.close();

    if (
      doLogin.toLowerCase().startsWith('y') ||
      doLogin.toLowerCase().startsWith('s')
    ) {
      console.log('');
      runInteractive('claude login');
      console.log('');
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log(`  ${clr.boldGreen('✓')} ${t.allDone}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
