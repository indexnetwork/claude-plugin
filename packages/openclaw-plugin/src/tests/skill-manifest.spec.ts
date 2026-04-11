import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PluginManifest {
  skills?: string[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readManifest(): PluginManifest {
  const manifestPath = join(packageRoot, 'openclaw.plugin.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest;
}

function frontmatterName(skillMarkdown: string): string | null {
  const match = skillMarkdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const nameLine = match[1]
    .split('\n')
    .find((line) => line.trimStart().startsWith('name:'));
  if (!nameLine) {
    return null;
  }

  return nameLine.slice(nameLine.indexOf(':') + 1).trim();
}

describe('OpenClaw plugin skill payload', () => {
  test('keeps SKILL.md names aligned with their containing folders', () => {
    const manifest = readManifest();
    expect(manifest.skills).toBeArray();

    for (const skillRoot of manifest.skills ?? []) {
      const absoluteSkillRoot = resolve(packageRoot, skillRoot);
      const skillFolders = readdirSync(absoluteSkillRoot)
        .map((entry) => join(absoluteSkillRoot, entry))
        .filter((entryPath) => statSync(entryPath).isDirectory())
        .filter((entryPath) => existsSync(join(entryPath, 'SKILL.md')));

      expect(skillFolders.length).toBeGreaterThan(0);

      for (const skillFolder of skillFolders) {
        const skillMarkdown = readFileSync(join(skillFolder, 'SKILL.md'), 'utf8');
        expect(frontmatterName(skillMarkdown)).toBe(basename(skillFolder));
      }
    }
  });
});
