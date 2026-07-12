/**
 * NovaOS architecture boundary check.
 *
 * Statically scans every TypeScript source file under `packages/*` and `apps/*`
 * and enforces the structural invariants from the architecture spec:
 *
 *   1. No deep imports into another package's internals (only `@novaos/<pkg>`).
 *   2. Every `@novaos/*` import is declared in the importing package's package.json.
 *   3. `@novaos/shared` depends on no other workspace package.
 *   4. `@novaos/ui` imports no workspace package (it stays domain-agnostic).
 *   5. Domain packages do not import UI libraries (react, next, monaco, zustand, ...).
 *   6. Deterministic packages contain no `Math.random()` / `Date.now()`.
 *   7. No `eval(` / `new Function(` anywhere.
 *   8. The inter-package dependency graph is acyclic.
 *
 * Exits non-zero (and prints every violation) when any rule is broken.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const PACKAGES_DIR = join(ROOT, 'packages');
const APPS_DIR = join(ROOT, 'apps');

interface Violation {
  rule: string;
  file: string;
  detail: string;
}

interface Owner {
  kind: 'package' | 'app';
  name: string;
  dir: string;
}

const DOMAIN_PACKAGES = new Set([
  'shared',
  'events',
  'simulator',
  'cpu',
  'memory',
  'kernel',
  'scheduler',
  'concurrency',
  'mmu',
  'filesystem',
  'shell',
  'terminal',
  'assembler',
  'compiler',
  'debugger',
]);

const DETERMINISTIC_PACKAGES = new Set([
  'shared',
  'events',
  'simulator',
  'cpu',
  'memory',
  'kernel',
  'scheduler',
  'concurrency',
  'mmu',
  'filesystem',
  'shell',
  'assembler',
  'compiler',
  'debugger',
]);

const FORBIDDEN_UI_IMPORTS = [
  'react',
  'react-dom',
  'next',
  'framer-motion',
  'zustand',
  'monaco-editor',
  '@monaco-editor/react',
  '@testing-library/react',
];

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', '.next']);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function ownerOf(file: string): Owner | null {
  const relPkg = relative(PACKAGES_DIR, file);
  if (!relPkg.startsWith('..')) {
    const name = relPkg.split(sep)[0];
    if (name) return { kind: 'package', name, dir: join(PACKAGES_DIR, name) };
  }
  const relApp = relative(APPS_DIR, file);
  if (!relApp.startsWith('..')) {
    const name = relApp.split(sep)[0];
    if (name) return { kind: 'app', name, dir: join(APPS_DIR, name) };
  }
  return null;
}

function importSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const spec = match[1];
      if (spec) specifiers.push(spec);
    }
  }
  return specifiers;
}

function declaredDependencies(pkgDir: string): Set<string> {
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return new Set();
  const raw = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return new Set([
    ...Object.keys(raw.dependencies ?? {}),
    ...Object.keys(raw.devDependencies ?? {}),
    ...Object.keys(raw.peerDependencies ?? {}),
  ]);
}

const violations: Violation[] = [];
const edges = new Map<string, Set<string>>();

function addEdge(from: string, to: string): void {
  let set = edges.get(from);
  if (!set) {
    set = new Set();
    edges.set(from, set);
  }
  set.add(to);
}

const files = [...walk(PACKAGES_DIR), ...walk(APPS_DIR)];

for (const file of files) {
  const owner = ownerOf(file);
  if (!owner) continue;
  const rel = relative(ROOT, file);
  const content = readFileSync(file, 'utf8');

  if (/\beval\s*\(/.test(content) || /\bnew\s+Function\s*\(/.test(content)) {
    violations.push({ rule: 'no-eval', file: rel, detail: 'eval/new Function is forbidden.' });
  }

  if (owner.kind === 'package' && DETERMINISTIC_PACKAGES.has(owner.name)) {
    if (/\bMath\.random\s*\(/.test(content)) {
      violations.push({
        rule: 'determinism',
        file: rel,
        detail: `Math.random() is forbidden in deterministic package "${owner.name}".`,
      });
    }
    if (/\bDate\.now\s*\(/.test(content)) {
      violations.push({
        rule: 'determinism',
        file: rel,
        detail: `Date.now() is forbidden in deterministic package "${owner.name}".`,
      });
    }
  }

  const deps = declaredDependencies(owner.dir);

  for (const spec of importSpecifiers(content)) {
    if (spec.startsWith('@novaos/')) {
      const parts = spec.split('/');
      const targetName = parts[1] ?? '';
      const targetPkg = `@novaos/${targetName}`;

      if (parts.length > 2) {
        violations.push({
          rule: 'no-internal-import',
          file: rel,
          detail: `Deep import "${spec}" — import only the package root "${targetPkg}".`,
        });
      }

      if (owner.kind === 'package' && owner.name === 'shared') {
        violations.push({
          rule: 'shared-no-deps',
          file: rel,
          detail: `@novaos/shared must not depend on workspace package "${targetPkg}".`,
        });
      }

      if (owner.kind === 'package' && owner.name === 'ui') {
        violations.push({
          rule: 'ui-domain-coupling',
          file: rel,
          detail: `@novaos/ui must stay domain-agnostic; it may not import "${targetPkg}".`,
        });
      }

      if (!deps.has(targetPkg) && targetName !== owner.name) {
        violations.push({
          rule: 'undeclared-dependency',
          file: rel,
          detail: `Imports "${targetPkg}" but it is not declared in ${owner.name}'s package.json.`,
        });
      }

      if (targetName && targetName !== owner.name) {
        addEdge(owner.name, targetName);
      }
    } else if (owner.kind === 'package' && DOMAIN_PACKAGES.has(owner.name)) {
      const forbidden = FORBIDDEN_UI_IMPORTS.some(
        (lib) => spec === lib || spec.startsWith(`${lib}/`),
      );
      if (forbidden) {
        violations.push({
          rule: 'domain-ui-import',
          file: rel,
          detail: `Domain package "${owner.name}" must not import UI dependency "${spec}".`,
        });
      }
    }
  }
}

// Cycle detection over the inter-package dependency graph.
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;
const color = new Map<string, number>();
const stack: string[] = [];
const cycles: string[] = [];

function visit(node: string): void {
  color.set(node, GRAY);
  stack.push(node);
  for (const next of edges.get(node) ?? []) {
    const c = color.get(next) ?? WHITE;
    if (c === GRAY) {
      const start = stack.indexOf(next);
      const cyclePath = [...stack.slice(start), next].join(' -> ');
      cycles.push(cyclePath);
    } else if (c === WHITE) {
      visit(next);
    }
  }
  stack.pop();
  color.set(node, BLACK);
}

for (const node of edges.keys()) {
  if ((color.get(node) ?? WHITE) === WHITE) visit(node);
}

for (const cyclePath of [...new Set(cycles)]) {
  violations.push({
    rule: 'circular-dependency',
    file: '(package graph)',
    detail: `Circular dependency: ${cyclePath}`,
  });
}

if (violations.length > 0) {
  console.error(`\n✗ Architecture check failed with ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}\n      ${v.detail}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`✓ Architecture checks passed (${files.length} source files scanned).`);
