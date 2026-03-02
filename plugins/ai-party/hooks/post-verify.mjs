#!/usr/bin/env node
// 공용 검증 훅 템플릿 — 빌드 시 각 플러그인의 hooks/로 복사됨
// 테스트 자동 탐지 + 실행 검증 로직

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();

/**
 * 프로젝트에서 테스트 커맨드를 탐지한다.
 * @returns {string|null} 테스트 실행 커맨드 또는 null
 */
function detectTestCommand() {
  const packageJsonPath = join(PLUGIN_ROOT, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(
        execSync(`cat "${packageJsonPath}"`, { encoding: "utf-8" })
      );
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        return "npm test";
      }
    } catch {
      // package.json 파싱 실패 시 무시
    }
  }
  return null;
}

/**
 * 테스트를 실행하고 결과를 반환한다.
 * @param {string} cmd 테스트 커맨드
 * @returns {{ ok: boolean, output: string }}
 */
function runTest(cmd) {
  try {
    const output = execSync(cmd, {
      cwd: PLUGIN_ROOT,
      encoding: "utf-8",
      timeout: 60_000,
    });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: err.stderr || err.message };
  }
}

export { detectTestCommand, runTest };
