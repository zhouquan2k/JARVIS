import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type DocFixture = {
  relativePath: string;
  title: string;
  nav: { label: string; target: string }[];
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../../..');

const docsUnderTest: Array<[string, string, string]> = [
  ['readme-en', 'README.md', 'ChatPrism'],
  ['readme-zh', 'README.zh-CN.md', 'ChatPrism'],
  ['contributing-en', 'CONTRIBUTING.md', 'Contributing'],
  ['contributing-zh', 'CONTRIBUTING.zh-CN.md', '贡献指南'],
  ['architecture-en', 'ARCHITECTURE.md', 'Architecture'],
  ['architecture-zh', 'ARCHITECTURE.zh-CN.md', '架构总览'],
  ['docs-overall-en', 'docs/overall.md', 'Repository Overview'],
  ['docs-overall-zh', 'docs/zh/overall.zh-CN.md', '仓库概览'],
  ['context-provider-en', 'docs/context-provider.md', 'Context Provider'],
  ['context-provider-zh', 'docs/zh/context-provider.zh-CN.md', 'Context Provider'],
  ['core-class-diagram-en', 'docs/architecture/core-class-diagram.md', 'Core Class Diagram'],
  ['core-class-diagram-zh', 'docs/zh/architecture/core-class-diagram.zh-CN.md', 'Core Class Diagram']
];

function parseTopNavigation(line: string): Array<{ label: string; target: string }> {
  return [...line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({
    label: match[1],
    target: match[2]
  }));
}

function loadFixtures(): DocFixture[] {
  return docsUnderTest.map(([, relativePath, title]) => {
    const absolutePath = path.join(repoRoot, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';

    return {
      relativePath,
      title,
      nav: parseTopNavigation(firstLine)
    };
  });
}

test('public documentation entry files expose reciprocal English and Chinese navigation', async ({ page }) => {
  const fixtures = loadFixtures();

  for (const fixture of fixtures) {
    expect(fixture.nav.length).toBeGreaterThanOrEqual(1);
  }

  const fixtureMap = Object.fromEntries(fixtures.map((fixture) => [fixture.relativePath, fixture]));

  await page.setContent(`
    <main>
      ${fixtures
        .map((fixture) => {
          const links = fixture.nav
            .map(
              (link) =>
                `<a data-doc="${fixture.relativePath}" data-target="${link.target}" href="${link.target}">${link.label}</a>`
            )
            .join('');

          return `<section data-testid="doc-card" data-path="${fixture.relativePath}">
            <h2>${fixture.title}</h2>
            <nav>${links}</nav>
          </section>`;
        })
        .join('')}
    </main>
  `);

  await expect(page.getByTestId('doc-card')).toHaveCount(fixtures.length);

  for (const fixture of fixtures) {
    const nav = page.locator(`[data-path="${fixture.relativePath}"] nav`);
    await expect(nav).toContainText(/English|中文/);

    for (const link of fixture.nav) {
      const targetPath = path.normalize(path.join(path.dirname(fixture.relativePath), link.target));
      expect(fs.existsSync(path.join(repoRoot, targetPath))).toBe(true);
      expect(fixtureMap[targetPath]).toBeDefined();
    }
  }
});

test('architecture entry points and mirrors resolve to the expected public sources', async ({ page }) => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const architecture = fs.readFileSync(path.join(repoRoot, 'ARCHITECTURE.md'), 'utf8');
  const chineseArchitecture = fs.readFileSync(path.join(repoRoot, 'ARCHITECTURE.zh-CN.md'), 'utf8');
  const overall = fs.readFileSync(path.join(repoRoot, 'docs/overall.md'), 'utf8');
  const workspaceDsl = fs.readFileSync(path.join(repoRoot, 'docs/workspace.dsl'), 'utf8');
  const workspaceDslZh = fs.readFileSync(path.join(repoRoot, 'docs/zh/workspace.zh-CN.dsl'), 'utf8');

  expect(readme).toContain('[ARCHITECTURE.md](ARCHITECTURE.md)');
  expect(architecture).toContain('`docs/workspace.dsl` is the primary public architecture source');
  expect(architecture).toContain('[docs/workspace.dsl](docs/workspace.dsl)');
  expect(chineseArchitecture).toContain('[docs/zh/workspace.zh-CN.dsl](docs/zh/workspace.zh-CN.dsl)');
  expect(overall).toContain('docs/history/');
  expect(workspaceDsl).toContain('Chinese mirror: docs/zh/workspace.zh-CN.dsl');
  expect(workspaceDslZh).toContain('Chinese mirror: docs/zh/workspace.zh-CN.dsl');

  await page.setContent(`
    <main>
      <a id="readme-architecture" href="ARCHITECTURE.md">Architecture</a>
      <a id="architecture-dsl" href="docs/workspace.dsl">workspace.dsl</a>
      <a id="architecture-zh-dsl" href="docs/zh/workspace.zh-CN.dsl">workspace.zh-CN.dsl</a>
    </main>
  `);

  await expect(page.locator('#readme-architecture')).toHaveAttribute('href', 'ARCHITECTURE.md');
  await expect(page.locator('#architecture-dsl')).toHaveAttribute('href', 'docs/workspace.dsl');
  await expect(page.locator('#architecture-zh-dsl')).toHaveAttribute('href', 'docs/zh/workspace.zh-CN.dsl');
});
