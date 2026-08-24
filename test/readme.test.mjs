import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const releaseCommit = '2a869c0a83f7547eb4e964b9b75543be2ec5d93a';
const localeDocs = [
  {
    locale: 'ko',
    path: 'docs/i18n/README.ko.md',
    sections: [
      '# Fable을 넘어 빌드하기',
      '## 창업자가 얻는 효용',
      '## Before / After',
      '## 어떻게 가능한가',
      '## 무엇이 다른가',
      '## 60초 만에 시작하기',
      '## 신뢰와 안전',
      '## 호환성과 한계',
      '## 로드맵',
      '## 개발 및 릴리스 검사',
      '## 기여하기',
      '## 라이선스',
    ],
    safety: [/MCP 서버가 없/i, /텔레메트리|telemetry/i, /네트워크.*없|네트워크에 연결하지/i, /계정.*없|계정이 필요하지 않/i, /Apache-2\.0/],
  },
  {
    locale: 'ja',
    path: 'docs/i18n/README.ja.md',
    sections: [
      '# Fableを超えて構築する',
      '## 得られるもの',
      '## Before / After',
      '## どのように可能にするか',
      '## 何が違うのか',
      '## 60秒で始める',
      '## 信頼と安全性',
      '## 対応状況と制限',
      '## ロードマップ',
      '## 開発とリリースのチェック',
      '## コントリビューション',
      '## ライセンス',
    ],
    safety: [/MCPサーバー.*(?:あり?ません|な?い)/i, /テレメトリ|telemetry/i, /ネットワーク.*(?:あり?ません|な?い)|ネットワーク.*接続しな/i, /アカウント.*(?:あり?ません|な?い)|アカウント.*不要/i, /Apache-2\.0/],
  },
  {
    locale: 'zh-CN',
    path: 'docs/i18n/README.zh-CN.md',
    sections: [
      '# 超越 Fable 构建产品',
      '## 你将获得什么',
      '## Before / After',
      '## 如何实现',
      '## 有何不同',
      '## 60 秒开始使用',
      '## 信任与安全',
      '## 兼容性与限制',
      '## 路线图',
      '## 开发与发布检查',
      '## 参与贡献',
      '## 许可证',
    ],
    safety: [/没有 MCP 服务器|无 MCP 服务器/i, /遥测|telemetry/i, /不需要.*网络|没有.*网络|无需.*网络|不访问网络/i, /没有.*账户|无需.*账户/i, /Apache-2\.0/],
  },
  {
    locale: 'es',
    path: 'docs/i18n/README.es.md',
    sections: [
      '# Construye más allá de Fable',
      '## Qué obtienes',
      '## Before / After',
      '## Cómo es posible',
      '## Qué lo hace diferente',
      '## Empieza en 60 segundos',
      '## Confianza y seguridad',
      '## Compatibilidad y limitaciones',
      '## Hoja de ruta',
      '## Comprobaciones de desarrollo y publicación',
      '## Contribuir',
      '## Licencia',
    ],
    safety: [/sin servidor MCP|no hay servidor MCP/i, /telemetría|telemetry/i, /no necesita.*red|no hay.*red|sin red|sin acceso a la red|no accede a la red/i, /sin cuenta|no (?:necesita|requiere).*cuenta/i, /Apache-2\.0/],
  },
];

const languageLinks = [
  'README.md',
  'docs/i18n/README.ko.md',
  'docs/i18n/README.ja.md',
  'docs/i18n/README.zh-CN.md',
  'docs/i18n/README.es.md',
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function sectionIndex(readme, heading) {
  const index = readme.indexOf(heading);
  assert.notEqual(index, -1, `README is missing required heading: ${heading}`);
  return index;
}

test('README follows the founder-first public launch narrative', async () => {
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  const requiredSections = [
    '# Build Beyond Fable',
    '## What You Gain',
    '## How It Works',
    '## Start in 60 Seconds',
  ];
  const positions = requiredSections.map((heading) => sectionIndex(readme, heading));

  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(
      positions[index - 1] < positions[index],
      `${requiredSections[index]} must follow ${requiredSections[index - 1]}`,
    );
  }
});

test('README exposes the multilingual, trust, and contribution paths', async () => {
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  for (const locale of [
    'docs/i18n/README.ko.md',
    'docs/i18n/README.ja.md',
    'docs/i18n/README.zh-CN.md',
    'docs/i18n/README.es.md',
  ]) {
    assert.match(readme, new RegExp(`\\(${locale.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\)`));
  }
  for (const heading of [
    '## Before / After',
    '## Why It Is Different',
    '## Trust and Safety',
    '## Compatibility and Limitations',
    '## Roadmap',
    '## Contributing',
  ]) {
    sectionIndex(readme, heading);
  }
  for (const link of [
    'docs/SHOWCASE.md',
    'docs/ROADMAP.md',
    'docs/TRANSLATION_GUIDE.md',
    'docs/assets/social-preview.svg',
  ]) {
    assert.match(readme, new RegExp(`\\]\\(${escapeRegex(link)}\\)`), `README should surface ${link}`);
  }
  assert.match(readme, /no telemetry/i);
  assert.match(readme, /Apache-2\.0/);
  assert.match(readme, /Fable/);
  assert.match(readme, /codex plugin marketplace add/);
});

test('README documents the v0 artifact boundary and readiness-only judge', async () => {
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  for (const artifact of [
    'product-ir.json',
    'readiness.json',
    'executable-spec.json',
    'goal-dag.json',
    'diagnostics.json',
    'compilation-receipt.json',
  ]) assert.match(readme, new RegExp(`\\b${escapeRegex(artifact)}\\b`));
  assert.doesNotMatch(readme, /├── product-judge\\.json/i);
  assert.match(readme, /readiness-based|readiness-based decision/i);
  assert.match(readme, /does not emit[\s\S]*product-judge/i);
  assert.doesNotMatch(readme, /evaluates the result through three|Code Oracle.*Journey Oracle.*Thesis Oracle/is);
});

test('every locale follows the canonical founder-first section order', async () => {
  for (const locale of localeDocs) {
    const readme = await readFile(resolve(root, locale.path), 'utf8');
    const positions = locale.sections.map((heading) => {
      const position = readme.indexOf(heading);
      assert.notEqual(position, -1, `${locale.locale} is missing required heading: ${heading}`);
      return position;
    });
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(
        positions[index - 1] < positions[index],
        `${locale.locale}: ${locale.sections[index]} must follow ${locale.sections[index - 1]}`,
      );
    }
  }
});

test('every locale preserves the verified install target and release version', async () => {
  const english = await readFile(resolve(root, 'README.md'), 'utf8');
  const installCommand = `codex plugin marketplace add plugtheliam/founder-product-compiler --ref ${releaseCommit}`;
  assert.match(english, new RegExp(escapeRegex(installCommand)));
  assert.match(english, /v0\.1\.0/);

  for (const locale of localeDocs) {
    const readme = await readFile(resolve(root, locale.path), 'utf8');
    assert.match(readme, new RegExp(escapeRegex(installCommand)), `${locale.locale} must preserve the verified install command`);
    assert.match(readme, new RegExp(escapeRegex(releaseCommit)), `${locale.locale} must preserve the release SHA`);
    assert.match(readme, /v0\.1\.0/, `${locale.locale} must name the public release version`);
  }
});

test('every locale preserves the canonical safety and licensing claims', async () => {
  const english = await readFile(resolve(root, 'README.md'), 'utf8');
  const canonicalSafety = [
    /no MCP/i,
    /no telemetry/i,
    /no network/i,
    /no (?:product )?account/i,
    /Apache-2\.0/,
  ];
  for (const claim of canonicalSafety) assert.match(english, claim);

  for (const locale of localeDocs) {
    const readme = await readFile(resolve(root, locale.path), 'utf8');
    for (const claim of locale.safety) {
      assert.match(readme, claim, `${locale.locale} is missing a translated safety claim: ${claim}`);
    }
  }
});

test('every locale documents the six v0 artifacts without claiming a judge artifact', async () => {
  const artifacts = [
    'product-ir.json',
    'readiness.json',
    'executable-spec.json',
    'goal-dag.json',
    'diagnostics.json',
    'compilation-receipt.json',
  ];
  for (const locale of localeDocs) {
    const readme = await readFile(resolve(root, locale.path), 'utf8');
    for (const artifact of artifacts) assert.match(readme, new RegExp(`\\b${escapeRegex(artifact)}\\b`), `${locale.locale} is missing ${artifact}`);
    assert.doesNotMatch(readme, /├── product-judge\\.json/i, `${locale.locale} claims a non-existent judge artifact`);
    assert.match(readme, /readiness|準備|준비|就绪|preparación/i, `${locale.locale} should describe readiness`);
  }
});

test('every locale has a complete cross-language navigation switcher', async () => {
  for (const locale of localeDocs) {
    const readme = await readFile(resolve(root, locale.path), 'utf8');
    for (const link of languageLinks) {
      const relativeLink = link === 'README.md' ? '../../README.md' : link.replace('docs/i18n/', '');
      assert.match(
        readme,
        new RegExp(`\\]\\(${escapeRegex(relativeLink)}\\)`),
        `${locale.locale} is missing language navigation to ${relativeLink}`,
      );
    }
  }
});
