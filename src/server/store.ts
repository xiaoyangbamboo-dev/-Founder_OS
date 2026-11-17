import fs from 'fs';
import path from 'path';
import type { FounderOsState } from '../types/founderOs.ts';
import { createInitialSeedState } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'founder-os-state.json');

export function loadState(): FounderOsState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as FounderOsState;
      if (
        parsed &&
        Array.isArray(parsed.threads) &&
        Array.isArray(parsed.policyRules) &&
        Array.isArray(parsed.agentMessages) &&
        Array.isArray(parsed.founderCommands) &&
        Array.isArray(parsed.projects) &&
        parsed.projects.some((p) => Boolean(p.stages) && Boolean(p.shortName)) &&
        Array.isArray(parsed.decisionCases) &&
        parsed.decisionCases.every((c) => Boolean(c.decisionType)) &&
        parsed.qualityMetrics &&
        Array.isArray(parsed.qualityMetrics.decisionDurationsSeconds)
      ) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[store] Failed to read persisted state, re-seeding:', err);
  }

  const initial = createInitialSeedState();
  saveState(initial);
  return initial;
}

export function saveState(state: FounderOsState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

export function resetState(): FounderOsState {
  const initial = createInitialSeedState();
  saveState(initial);
  return initial;
}
