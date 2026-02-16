import { execFile } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { EOL } from 'os';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Required environment variables for the build-and-deploy pipeline. */
interface EnvConfig {
  name: string;
  namespace: string;
  registry: string;
  host: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ENV_FILE = '.env';
const VERSION_KEY = 'NEXT_PUBLIC_VERSION';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Reads and validates the required environment variables.
 *
 * Exits the process with code 1 if any variable is missing.
 */
const loadEnvConfig = (): EnvConfig => {
  const name = process.env.NAME ?? '';
  const namespace = process.env.NAME_SPACE ?? '';
  const registry = process.env.REGISTRY ?? '';
  const host = process.env.HOST ?? '';

  if (!name || !namespace || !registry || !host) {
    console.error('Missing required environment variables: NAME, NAME_SPACE, REGISTRY, HOST');
    process.exit(1);
  }

  return { name, namespace, registry, host };
};

/**
 * Increments a semver-style version string by its patch segment.
 *
 * Segments are treated as unbounded integers (e.g. `1.2.15` → `1.2.16`),
 * unlike the previous implementation that capped at 9.
 *
 * @param version - A dot-separated version string (e.g. `"1.2.3"`).
 * @returns The incremented version string.
 */
const incrementVersion = (version: string): string => {
  const parts = version.split('.').map(Number);

  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid version format: "${version}"`);
  }

  parts[2] += 1;

  return parts.join('.');
};

/**
 * Reads the `.env` file, bumps the `NEXT_PUBLIC_VERSION` value, and
 * writes the file back.
 *
 * Lines that don't match the version key are preserved as-is.
 */
const bumpVersionInEnvFile = (): void => {
  const contents = readFileSync(ENV_FILE, 'utf-8');

  const updatedLines = contents
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line) => {
      if (line.startsWith(`${VERSION_KEY}=`)) {
        const value = line.split('=')[1].replace(/'/g, '');
        return `${VERSION_KEY}='${incrementVersion(value)}'`;
      }
      return line;
    });

  writeFileSync(ENV_FILE, updatedLines.join(EOL) + EOL);
};

/**
 * Runs a command with an explicit argument list (no shell interpolation)
 * and streams stdout to the console.
 *
 * @param command - The binary to execute.
 * @param args    - Arguments passed to the binary.
 * @returns The complete stdout output.
 */
const run = (command: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { maxBuffer: 1024 * 2048 },
      (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout);
      },
    );

    child.stdout?.on('data', (data: string) => console.log(data));
  });

/**
 * Logs a section header to the console for visual separation.
 */
const logSection = (title: string): void => {
  console.log(`\n========= ${title} =========`);
};

/* ------------------------------------------------------------------ */
/*  Pipeline steps                                                    */
/* ------------------------------------------------------------------ */

const getBranchName = async (): Promise<string> => {
  const stdout = await run('git', ['branch', '--show-current']);
  return stdout.replace(/(\r\n|\n|\r)/g, '');
};

const buildPackage = async (): Promise<void> => {
  logSection('Building App');
  await run('npm', ['run', 'build']);
};

const buildDockerImage = async (name: string): Promise<void> => {
  logSection('Building Docker Image');
  await run('docker', ['build', '-t', name, '.']);
  console.log('\nDocker image built');
};

const tagDockerImage = async (
  name: string,
  registry: string,
  branch: string,
): Promise<void> => {
  logSection('Tagging Docker Image');
  await run('docker', ['tag', name, `${registry}/${name}:${branch}`]);
  console.log('\nDocker image tagged');
};

const publishDockerImage = async (
  name: string,
  registry: string,
  branch: string,
): Promise<void> => {
  logSection('Publishing Docker Image');
  await run('docker', ['push', `${registry}/${name}:${branch}`]);
  console.log('\nDocker image published');
};

const deleteDeployment = async (
  name: string,
  namespace: string,
): Promise<void> => {
  logSection('Delete current Helm deployment');
  try {
    await run('helm', ['delete', name, '-n', namespace]);
  } catch {
    /** Deletion may fail if no previous release exists — this is acceptable. */
    console.log('\nNo existing deployment to delete (skipped)');
  }
};

const deployMicroservice = async (
  config: EnvConfig,
  branch: string,
): Promise<void> => {
  logSection('Install Helm deployment');
  const { name, namespace, registry, host } = config;

  await run('helm', [
    'install',
    name,
    'deployment',
    `--namespace=${namespace}`,
    `--set`, `name=${name}`,
    `--set`, `image.registry=${registry}`,
    `--set`, `image.repository=${name}`,
    `--set`, `image.tag=${branch}`,
    `--set`, `ingress.host=${host}`,
  ]);
};

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

const main = async (): Promise<void> => {
  const config = loadEnvConfig();
  const startTime = Date.now();

  bumpVersionInEnvFile();

  const branch = await getBranchName();

  await buildPackage();
  await buildDockerImage(config.name);
  await tagDockerImage(config.name, config.registry, branch);
  await publishDockerImage(config.name, config.registry, branch);
  await deleteDeployment(config.name, config.namespace);
  await deployMicroservice(config, branch);

  const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;

  console.log('\nProcess complete!');
  console.log('Branch:', branch);
  console.log('Processing time:', Math.round(elapsedMinutes * 100) / 100, 'minutes');

  process.exit(0);
};

main().catch((error: unknown) => {
  console.error('\nPipeline failed:', error);
  process.exit(1);
});
