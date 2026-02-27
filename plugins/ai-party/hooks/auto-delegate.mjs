#!/usr/bin/env node
// auto-delegate.mjs — UserPromptSubmit 훅
// 사용자 메시지에서 개발/운영 작업 감지 → ai-party 위임 지시 주입
// 단순 대화/질문이면 무시 (exit 0, 출력 없음)

import { readFileSync } from "node:fs";

// ── stdin에서 hook payload 읽기 ──
let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const userPrompt = (payload?.user_prompt ?? "").toLowerCase();

// 빈 메시지 무시
if (!userPrompt.trim()) {
  process.exit(0);
}

// ── 제외 패턴 (이것들은 에이전트 위임 불필요) ──
const EXCLUDE_PATTERNS = [
  // 인사/잡담
  /^(안녕|hi|hello|hey|ㅎㅇ|ㅎㅎ)\b/,
  /뭐야\s*\??$/, /뭐해\s*\??$/,
  // 단순 지식 질문 (설명만 요청)
  /^.{0,10}(알려줘|설명해|가르쳐|뭔지|뭐지)\s*\??$/,
  // git 직접 처리 (커밋/머지/푸시는 Host가 할 일)
  /\b(커밋|머지|푸시|commit|merge|push|pull|rebase|cherry-?pick)\b/,
  // 슬래시 커맨드 (다른 플러그인/스킬 호출)
  /^\//,
];

// ── 작업 감지 패턴 (개발 라이프사이클 전체) ──
const TASK_PATTERNS = [
  // ── 기획/설계 ──
  /기획/, /설계/, /아키텍처/, /스펙/, /요구사항/, /유스케이스/,
  /ERD/, /스키마/, /데이터\s*모델/, /와이어프레임/,
  /\bdesign\b/, /\barchitect/, /\bspec\b/, /\bschema\b/,
  /\bplanning\b/, /\brequirement/,

  // ── 개발/구현 ──
  /구현/, /개발/, /코드/, /코딩/, /프로그래밍/,
  /만들어/, /생성/, /작성/, /추가/, /수정/, /변경/,
  /삭제/, /이동/, /리팩토링/, /리팩터/,
  /컴포넌트/, /함수/, /클래스/, /모듈/, /서비스/,
  /API/, /엔드포인트/, /라우트/, /핸들러/,
  /타입/, /인터페이스/, /DTO/, /모델/,
  /\bimplement/, /\bcreate\b/, /\bgenerate\b/, /\bbuild\b/,
  /\bwrite\b/, /\badd\b/, /\bfix\b/, /\bupdate\b/,
  /\brefactor/, /\bmodify/, /\bremove\b/, /\bdelete\b/,
  /\bdevelop/, /\bcode\b/, /\bcoding\b/,

  // ── 리뷰/분석 ──
  /리뷰/, /분석/, /검토/, /평가/, /진단/, /조사/,
  /코드\s*리뷰/, /아키텍처\s*리뷰/, /PR\s*리뷰/,
  /성능\s*분석/, /보안\s*분석/, /의존성\s*분석/,
  /\breview\b/, /\banalyze\b/, /\baudit\b/, /\binspect/,
  /\bevaluate\b/, /\bassess/,

  // ── 테스트/QA ──
  /테스트/, /검증/, /검수/, /QA/, /품질/,
  /단위\s*테스트/, /통합\s*테스트/, /E2E/, /부하\s*테스트/,
  /커버리지/, /테스트\s*케이스/,
  /\btest/, /\bvalidat/, /\bverif/, /\bqa\b/,
  /\bcoverage\b/, /\bbenchmark/,

  // ── 디버깅/트러블슈팅 ──
  /디버그/, /디버깅/, /버그/, /오류/, /에러/, /장애/,
  /문제/, /이슈/, /트러블슈팅/, /원인\s*분석/,
  /\bdebug/, /\btroubleshoot/, /\berror\b/, /\bbug\b/,
  /\bcrash/, /\bfail/, /\bbroken\b/,

  // ── 최적화/개선 ──
  /최적화/, /개선/, /성능/, /속도/, /메모리/, /캐시/,
  /튜닝/, /프로파일/, /병목/, /부하/,
  /\boptimiz/, /\bperformanc/, /\bimprove/, /\benhance/,
  /\bspeed/, /\bmemory\b/, /\bcach/, /\btun/,

  // ── 문서화 ──
  /문서/, /문서화/, /가이드/, /매뉴얼/, /위키/,
  /README/, /CHANGELOG/, /릴리스\s*노트/,
  /\bdocument/, /\bguide\b/, /\bmanual\b/, /\bwiki\b/,

  // ── 인프라/DevOps ──
  /배포/, /빌드/, /CI/, /CD/, /파이프라인/,
  /도커/, /컨테이너/, /쿠버네티스/, /K8S/i,
  /인프라/, /서버/, /클라우드/, /AWS/, /GCP/, /Azure/,
  /설정/, /환경\s*변수/, /마이그레이션/,
  /\bdeploy/, /\binfra/, /\bdocker/, /\bk8s\b/,
  /\bci\b.*\bcd\b/, /\bpipeline\b/, /\bterraform/,
  /\bansible/, /\bhelm\b/,

  // ── 모니터링/운영 ──
  /모니터링/, /모니터/, /알림/, /알럿/, /대시보드/,
  /로그/, /로깅/, /메트릭/, /트레이싱/, /옵저버빌리티/,
  /장애\s*대응/, /인시던트/, /SLA/, /SLO/, /SLI/,
  /스케일링/, /오토스케일/, /헬스\s*체크/,
  /\bmonitor/, /\balert/, /\bdashboard/,
  /\blog/, /\bmetric/, /\btrac/, /\bobservab/,
  /\bincident/, /\bscal/, /\bhealth\s*check/,

  // ── 보안 ──
  /보안/, /취약점/, /인증/, /인가/, /권한/,
  /암호화/, /SSL/, /TLS/, /CORS/, /CSRF/, /XSS/,
  /\bsecur/, /\bvulnerab/, /\bauth/, /\bencrypt/,
  /\bpermission/, /\baccess\s*control/,

  // ── 데이터/DB ──
  /데이터베이스/, /DB/, /쿼리/, /SQL/, /인덱스/,
  /마이그레이션/, /백업/, /복구/, /레플리카/,
  /\bdatabase/, /\bquery/, /\bsql\b/, /\bindex/,
  /\bmigrat/, /\bbackup/, /\breplicat/,

  // ── 파일 경로 패턴 (코드 파일 언급) ──
  /\.(ts|js|py|java|go|rs|cpp|c|rb|php|swift|kt)\b/,
  /\.(tsx|jsx|vue|svelte)\b/,
  /\.(yaml|yml|toml|tf|hcl)\b/,
  /\.(sql|graphql|proto)\b/,
  /dockerfile/i, /docker-compose/i,
  /package\.json/, /pom\.xml/, /build\.gradle/,
];

// ── 판단 로직 ──
const isExcluded = EXCLUDE_PATTERNS.some((p) => p.test(userPrompt));
if (isExcluded) {
  process.exit(0);
}

const isTask = TASK_PATTERNS.some((p) => p.test(userPrompt));
if (!isTask) {
  process.exit(0);
}

// ── 위임 지시 주입 ──
const result = {
  systemMessage: [
    "[ai-party] 개발/운영 작업 감지됨.",
    "Skill 도구로 ai-party:party-mode를 먼저 호출한 뒤, SKILL.md의 지시에 따라 적절한 에이전트에 위임하라.",
    "간단한 1-2줄 수정이 아닌 한, 직접 처리하지 말고 에이전트를 활용하라.",
  ].join(" "),
};

process.stdout.write(JSON.stringify(result));
process.exit(0);
