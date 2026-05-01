import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CONFIG_PATH =
  process.env.CONFIG_PATH ?? '/opt/server-video-editor/config.json';

export interface AgentConfig {
  uuid: string;
  wsBrokerUrl: string;
  label: string;
}

export function readConfig(): AgentConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config not found at ${CONFIG_PATH}. Re-run the installer.`,
    );
  }
  const raw = readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw) as AgentConfig;
}

export function writeConfig(config: AgentConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
