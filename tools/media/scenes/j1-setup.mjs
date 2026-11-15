// J1 Zero to setup: the real installer, from the built adp.skill, in a throwaway HOME. Usage (repo root): node tools/media/scenes/j1-setup.mjs OUT_DIR
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { record } from './term.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'adp-j1-')), home = join(tmp, 'home'), skills = join(tmp, 'skills');
mkdirSync(home); mkdirSync(skills);
execFileSync('python3', ['-I', 'tools/package.py'], { stdio: 'ignore' });
execFileSync('unzip', ['-q', 'dist/adp.skill', '-d', skills]);

const adp = join(skills, 'adp/scripts/adp.py');
const tidy = s => s.replaceAll(home, '~').replaceAll(join(skills, 'adp'), '<adp skill folder>');
const run = (...args) => tidy(execFileSync('python3', ['-I', adp, ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' }));
const shell = cmd => tidy(execFileSync('sh', ['-c', cmd], { env: { ...process.env, HOME: home }, encoding: 'utf8' }));

const steps = [
  { say: '# The user said yes. First: what would setup change?' },
  { cmd: 'adp.py setup --dry-run', out: run('setup', '--dry-run') },
  { say: '# One question, answered: scope user.' },
  { cmd: 'adp.py setup --scope user', out: run('setup', '--scope', 'user') },
  { say: '# The road skills and the catalog are in place.' },
  { cmd: 'ls ~/.claude/skills; ls ~/.adp/catalog | head -4', out: shell('ls ~/.claude/skills; ls ~/.adp/catalog | head -4') },
];
await record(steps, process.argv[2]);
