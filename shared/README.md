# shared/

공용 모듈 저장소. 이 디렉토리의 파일은 직접 실행되지 않고, `bash scripts/build.sh`를 통해 각 플러그인 디렉토리로 복사된다.

## 구조

```
shared/
├── hooks/
│   └── post-verify.mjs    # 테스트 탐지/검증 로직
├── scripts/
│   └── common.sh           # JSON 출력, 상태 저장 등 범용 유틸
└── README.md
```

## 사용법

```bash
# shared 변경 후 각 플러그인에 반영
bash scripts/build.sh
```
