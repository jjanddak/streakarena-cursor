# Cursor IDE 초기 세팅 가이드

Cursor를 처음 쓰는 개발자를 위한 필수 설정, MCP, 규칙(Rules), 확장 프로그램 정리입니다.

---

## 1. 필수 IDE 설정

### 1.1 접근 방법
- **설정 열기**: `Cmd + ,` (macOS) / `Ctrl + ,` (Windows·Linux)
- **Cursor 전용 설정**: `Cursor Settings` 또는 `Settings → Cursor Settings`

### 1.2 꼭 켜두면 좋은 설정

| 설정 | 위치 | 설명 |
|------|------|------|
| **Cursor Tab** | Features | 코드 자동완성 (Tab으로 수락) |
| **Agent Stickiness** | Features → Chat | Agent/일반 모드 선택이 대화마다 유지됨 |
| **Codebase Indexing** | Features | 새 파일 기본 인덱싱 (큰 프로젝트는 `.cursorignore`로 제한) |
| **Iterative Lint (Beta)** | Features | 자동 린트/에러 수정 시도 |

### 1.3 Auto-Run (Agent 모드)
- **단축키**: `Cmd+Shift+J` (macOS) / `Ctrl+Shift+J` (Windows·Linux) → Agent 섹션
- **Auto-Run**: 켜두면 허용 목록에 있는 명령은 확인 없이 실행됨
- **Allow list 예시** (안전한 것만): `npm test`, `npm run build`, `npx tsc`, `git status`, `git diff`, `ls`, `pwd`
- **허용하지 말 것**: `rm -rf`, `git push`, `git reset --hard`, DB 삭제/덮어쓰기 등

### 1.4 모델 선택
- **Ctrl+K** / **Cmd+K**: 인라인 편집 시 모델 선택
- **Chat/Composer**: 설정에서 기본 모델 지정
- 복잡한 작업: Claude Opus, GPT-4 등 / 가벼운 작업: Claude Haiku, GPT-4o-mini 등으로 비용 절감

### 1.5 VS Code 사용자
- 설정에서 **Import from VS Code** 로 확장, 키바인딩, 스니펫 한 번에 가져오기
- 터미널에서 `cursor .` 로 프로젝트 열 수 있도록 **shell 명령 설치** (설치 시 옵션)

---

## 2. AI 규칙 (Rules) — 프로젝트/전역

AI가 프로젝트 컨벤션을 따르게 하려면 규칙을 두는 것이 좋습니다.

### 2.1 전역 규칙 (모든 프로젝트)
- **Settings → Cursor Settings → Rules**
- 예: “항상 한국어로 답변”, “함수/변수는 camelCase, 컴포넌트는 PascalCase” 등

### 2.2 프로젝트 규칙 (현재 저장소만)

**방법 A: 단일 파일**
- 프로젝트 루트에 **`.cursorrules`** 파일 생성
- 내용: 프로젝트 설명, 사용 스택, 코딩 스타일, 선호 라이브러리, 디렉터리 구조 등

**방법 B: 디렉터리 방식 (권장)**
- **`.cursor/rules/`** 폴더 생성
- `.mdc` 파일 + YAML frontmatter로 “언제 적용할지” 제어
- 규칙 종류:
  - **Always Apply** (`alwaysApply: true`): 매 대화마다 적용
  - **Auto-attached**: 특정 파일 패턴(globs) 편집 시만
  - **Agent-decided**: AI가 필요할 때만
  - **Manual**: `@규칙이름` 처럼 직접 참조할 때만

우선순위: **팀 규칙 → 프로젝트 규칙(.cursor/rules/) → 사용자 규칙 → .cursorrules**

### 2.3 .cursorignore (큰 프로젝트)
- `.gitignore`와 비슷하게, **인덱싱에서 제외할 경로** 지정
- `node_modules`, `dist`, 빌드 산출물, 대용량 파일 등 넣으면 성능·비용에 유리

---

## 3. MCP (Model Context Protocol)

MCP로 Cursor가 **DB, 이슈 트래커, Figma, Slack** 등 외부 도구/데이터에 접근하게 할 수 있습니다.

### 3.1 설정 위치
- **프로젝트**: `.cursor/mcp.json` (팀과 공유하려면 git에 커밋)
- **전역(본인만)**: `~/.cursor/mcp.json`

### 3.2 설치 방법
1. **원클릭**: **Cursor Settings → MCP** 에서 서버 목록 보고 “Add to Cursor”
2. **수동**: `mcp.json` 에 서버 설정 후 Cursor 재시작

### 3.3 자주 쓰는 MCP 서버 예시

| 용도 | 서버 예시 |
|------|-----------|
| DB | Supabase, PostgreSQL, MySQL (스키마/쿼리 조회·생성) |
| 이슈/PR | GitHub (이슈·PR 읽기), Linear (이슈 가져오기·상태 변경) |
| 디자인 | Figma (컴포넌트 스펙·레이아웃) |
| 커뮤니케이션 | Slack (대화 내용 조회) |
| 문서 | Context7 (외부 도구 문서) |

공식 설치/문서: [Cursor MCP Docs](https://cursor.com/docs/context/mcp), [MCP Install Links](https://cursor.com/docs/context/mcp/install-links)

---

## 4. 추천 확장 프로그램 (VS Code 호환)

Cursor는 VS Code 기반이라 대부분의 VS Code 확장을 쓸 수 있습니다.

### 생산성
- **Better Comments** / **TODO Highlight**: TODO·NOTE 시각화
- **Bookmarks**: 자주 쓰는 코드 위치 북마크
- **Path Intellisense**: 파일 경로 자동완성

### 코드 품질·포맷
- **ESLint**, **Prettier**: 린트·포맷
- **Tailwind CSS IntelliSense**: Tailwind 사용 시
- **Code Spell Checker**: 코드 내 철자 검사

### UI·가독성
- **indent-rainbow**: 들여쓰기 단계별 색상
- **Color Highlight** / **Color Info**: 색상 미리보기·변환
- **Highlight Matching Tag**, **Auto Rename Tag**: HTML/XML 태그

### 기타
- **Regex Previewer**: 정규식 테스트
- **Image preview**: 에디터에서 이미지 미리보기

대형 프로젝트에서는 불필요한 확장은 끄고, `.cursorignore`로 인덱싱 범위를 줄이면 속도에 도움이 됩니다.

---

## 5. 자주 쓰는 단축키·워크플로우

| 단축키 | 기능 |
|--------|------|
| **Cmd+K** / **Ctrl+K** | 인라인 편집 (선택 영역 수정 또는 빈 줄에서 새 코드 생성) |
| **Cmd+L** / **Ctrl+L** | 새 채팅 열기 |
| **Cmd+I** / **Ctrl+I** | Agent(Composer) 패널 열기 |
| **Tab** | AI 제안 수락 |
| **@** (채팅/Agent에서) | 파일·폴더·규칙 참조 (`@파일명`, `@폴더`, `@.cursor/rules/...`) |

### 워크플로우 팁
- **코드 수정**: Agent 모드 사용, 지시를 구체적으로
- **대화**: 짧고 목적별로 나누기, 필요한 파일만 `@`로 첨부
- **탭**: 안 쓰는 탭 정리해서 컨텍스트 노이즈 줄이기
- **커밋**: 자주 커밋해서 AI가 잘못 갔을 때 되돌리기 쉽게
- **테스트**: “이 기능에 대한 테스트 작성해줘” 처럼 테스트 작성 요청

---

## 6. 정리 체크리스트

- [ ] Cursor Tab, Agent Stickiness 등 Features 설정 확인
- [ ] Auto-Run 사용 시 Allow list만 안전한 명령으로 제한
- [ ] 전역 Rules에 공통 코딩 스타일/언어 설정
- [ ] 프로젝트마다 `.cursorrules` 또는 `.cursor/rules/` 설정
- [ ] 큰 프로젝트면 `.cursorignore` 설정
- [ ] 필요하면 MCP 서버 추가 (`.cursor/mcp.json` 또는 ~/.cursor/mcp.json)
- [ ] ESLint, Prettier, 언어/프레임워크용 확장 설치
- [ ] Cmd+K, Cmd+I, @ 참조 사용에 익숙해지기

이 가이드는 검색된 공식·커뮤니티 자료를 바탕으로 정리했습니다. Cursor 버전에 따라 메뉴 이름이나 경로가 조금 다를 수 있습니다.
