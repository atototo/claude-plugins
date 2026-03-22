# X 스크래핑 JavaScript 코드

X는 SPA라서 `screenshot`, `read_page`, `take_snapshot` 등이 "Page still loading" 에러를 낸다.
모든 데이터 추출은 `javascript_tool`로 직접 DOM에서 한다.

## 유니코드 안전 truncate 헬퍼

모든 텍스트 추출에서 `.substring()` 대신 이 함수를 사용한다.
`.substring()`은 이모지 같은 서로게이트 페어 중간을 잘라 JSON 직렬화 에러를 일으킨다.

```javascript
function safeTrunc(str, max) {
  if (!str || str.length <= max) return str;
  let s = str.substring(0, max);
  const last = s.charCodeAt(s.length - 1);
  if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, s.length - 1);
  return s;
}
```

## 포스트 목록 추출 (검색 결과 / 타임라인)

```javascript
function safeTrunc(str, max) { if (!str || str.length <= max) return str; let s = str.substring(0, max); const last = s.charCodeAt(s.length - 1); if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, s.length - 1); return s; }
const articles = document.querySelectorAll('article[data-testid="tweet"]');
const results = [];
articles.forEach((article, i) => {
  if (i >= 15) return;
  const userEl = article.querySelector('[data-testid="User-Name"]');
  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  const timeEl = article.querySelector('time');
  const linkEl = article.querySelector('a[href*="/status/"]');
  const likeBtn = article.querySelector('[data-testid="like"]');
  const retweetBtn = article.querySelector('[data-testid="retweet"]');
  const likesMatch = (likeBtn?.getAttribute('aria-label') || '0').match(/(\d+)/);
  const rtMatch = (retweetBtn?.getAttribute('aria-label') || '0').match(/(\d+)/);
  results.push({
    user: safeTrunc(userEl?.textContent || '', 60),
    t: safeTrunc((tweetTextEl?.textContent || '').replace(/https?:\/\/\S+/g, '[link]'), 500),
    d: timeEl?.getAttribute('datetime') || '',
    u: linkEl?.href?.split('?')[0] || '',
    l: likesMatch ? parseInt(likesMatch[1]) : 0,
    r: rtMatch ? parseInt(rtMatch[1]) : 0
  });
});
JSON.stringify({ n: results.length, r: results });
```

**주의:** 포스트 텍스트에 URL이 포함되면 Chrome 확장이 cookie/query string으로 인식하여 블로킹할 수 있다.
`replace(/https?:\/\/\S+/g, '[link]')`로 URL을 치환하여 이 문제를 우회한다.

## 스크롤로 추가 포스트 로드

```javascript
window.scrollBy(0, 4000);
```

스크롤 후 3초 대기, 다시 추출하여 카운트 비교. 새 포스트 없으면 중단.

## 스레드 전체 추출 (딥다이브용)

포스트 URL로 직접 이동한 후:

```javascript
function safeTrunc(str, max) { if (!str || str.length <= max) return str; let s = str.substring(0, max); const last = s.charCodeAt(s.length - 1); if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, s.length - 1); return s; }
const articles = document.querySelectorAll('article[data-testid="tweet"]');
const thread = [];
let originalAuthor = null;
articles.forEach((article, i) => {
  const userEl = article.querySelector('[data-testid="User-Name"]');
  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  const timeEl = article.querySelector('time');
  const user = safeTrunc(userEl?.textContent || '', 60);

  // 첫 포스트의 작성자를 기준으로 스레드 판별
  if (i === 0) originalAuthor = user.split('@')[1]?.split('·')[0];

  const isOriginalAuthor = user.includes(originalAuthor || '___');

  thread.push({
    idx: i,
    isAuthor: isOriginalAuthor,
    user: user,
    text: safeTrunc((tweetTextEl?.textContent || '').replace(/https?:\/\/\S+/g, '[link]'), 1000),
    time: timeEl?.getAttribute('datetime') || ''
  });
});
JSON.stringify({ threadLength: thread.length, thread });
```

- `isAuthor: true`인 포스트만 모으면 원작성자의 스레드
- `isAuthor: false`인 포스트 중 engagement 높은 것이 핵심 리플라이

## 프로필 정보 추출

`x.com/{handle}` 방문 후:

```javascript
const bio = document.querySelector('[data-testid="UserDescription"]')?.textContent || '';
const name = document.querySelector('[data-testid="UserName"]')?.textContent || '';
const followersEl = document.querySelector('a[href$="/verified_followers"]');
const followers = followersEl?.textContent || '';
function safeTrunc(str, max) { if (!str || str.length <= max) return str; let s = str.substring(0, max); const last = s.charCodeAt(s.length - 1); if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, s.length - 1); return s; }
JSON.stringify({ name, bio: safeTrunc(bio, 300), followers });
```
