# X 스크래핑 JavaScript 코드

X는 SPA라서 `screenshot`, `read_page`, `take_snapshot` 등이 "Page still loading" 에러를 낸다.
모든 데이터 추출은 `javascript_tool`로 직접 DOM에서 한다.

## 포스트 목록 추출 (검색 결과 / 타임라인)

```javascript
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
    user: userEl?.textContent?.substring(0, 60) || '',
    t: (tweetTextEl?.textContent || '').substring(0, 500).replace(/https?:\/\/\S+/g, '[link]'),
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
const articles = document.querySelectorAll('article[data-testid="tweet"]');
const thread = [];
let originalAuthor = null;
articles.forEach((article, i) => {
  const userEl = article.querySelector('[data-testid="User-Name"]');
  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  const timeEl = article.querySelector('time');
  const user = userEl?.textContent?.substring(0, 60) || '';

  // 첫 포스트의 작성자를 기준으로 스레드 판별
  if (i === 0) originalAuthor = user.split('@')[1]?.split('·')[0];

  const isOriginalAuthor = user.includes(originalAuthor || '___');

  thread.push({
    idx: i,
    isAuthor: isOriginalAuthor,
    user: user,
    text: (tweetTextEl?.textContent || '').substring(0, 1000).replace(/https?:\/\/\S+/g, '[link]'),
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
JSON.stringify({ name, bio: bio.substring(0, 300), followers });
```
