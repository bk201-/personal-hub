/**
 * Self-contained HTML error pages for Hono's onError / notFound handlers.
 * No external CSS/JS — everything is inline so the page works even when
 * static assets are unavailable.
 *
 * Respects prefers-color-scheme for dark/light mode.
 */

interface ErrorConfig {
  emoji: string;
  title: string;
  description: string;
}

function getConfig(status: number): ErrorConfig {
  if (status === 404) {
    return {
      emoji: '🔭',
      title: 'Nothing here',
      description: 'The endpoint you requested does not exist.',
    };
  }
  if (status === 403) {
    return {
      emoji: '🔐',
      title: 'No entry',
      description: 'You do not have permission to access this resource.',
    };
  }
  if (status === 429) {
    return {
      emoji: '⏳',
      title: 'Slow down!',
      description: 'Too many requests. Wait a moment and try again.',
    };
  }
  if (status === 503 || status === 502) {
    return {
      emoji: '🌙',
      title: 'Server is resting',
      description: 'The service is temporarily unavailable. It will be back shortly.',
    };
  }
  if (status >= 500) {
    return {
      emoji: '💥',
      title: 'Server hiccupped',
      description: 'An unexpected error occurred on the server side.',
    };
  }
  return {
    emoji: '😕',
    title: 'Request failed',
    description: 'The request could not be processed.',
  };
}

export function renderErrorHtml(status: number, detail?: string): string {
  const { emoji, title, description } = getConfig(status);
  const safeDetail = detail ? detail.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${status} — Oops!</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:    #f5f5f5;
      --card:  #ffffff;
      --text:  #1a1a1a;
      --sub:   #595959;
      --muted: #8c8c8c;
      --code:  #f0f0f0;
      --code-text: #595959;
      --border: #d9d9d9;
      --btn-bg: #1677ff;
      --btn-hover: #4096ff;
      --status-color: #d9d9d9;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg:    #141414;
        --card:  #1f1f1f;
        --text:  #f0f0f0;
        --sub:   #a6a6a6;
        --muted: #595959;
        --code:  #2a2a2a;
        --code-text: #a6a6a6;
        --border: #303030;
        --btn-bg: #1668dc;
        --btn-hover: #3c89e8;
        --status-color: #303030;
      }
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 24px;
      text-align: center;
      gap: 6px;
    }

    .emoji {
      font-size: 72px;
      line-height: 1;
      margin-bottom: 10px;
      animation: float 3.5s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      40%       { transform: translateY(-14px) rotate(-4deg); }
      60%       { transform: translateY(-10px) rotate(3deg); }
    }

    .oops {
      font-size: 48px;
      font-weight: 900;
      letter-spacing: -1px;
      line-height: 1;
      margin-bottom: 2px;
    }

    .status {
      font-size: 88px;
      font-weight: 900;
      line-height: 1;
      color: var(--status-color);
      letter-spacing: -5px;
      user-select: none;
    }

    .title {
      font-size: 20px;
      font-weight: 600;
      color: var(--sub);
      margin-top: 10px;
    }

    .desc {
      font-size: 14px;
      color: var(--muted);
      max-width: 400px;
      line-height: 1.65;
      margin-top: 4px;
    }

    .detail {
      margin-top: 16px;
      padding: 10px 16px;
      background: var(--code);
      color: var(--code-text);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
      font-size: 12px;
      max-width: 520px;
      width: 100%;
      text-align: left;
      word-break: break-all;
    }

    .btn {
      display: inline-block;
      margin-top: 24px;
      padding: 8px 24px;
      background: var(--btn-bg);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn:hover { background: var(--btn-hover); }
  </style>
</head>
<body>
  <div class="page">
    <span class="emoji">${emoji}</span>
    <p class="oops">Oops!</p>
    <p class="status">${status}</p>
    <p class="title">${title}</p>
    <p class="desc">${description}</p>
    ${safeDetail ? `<pre class="detail">${safeDetail}</pre>` : ''}
    <a class="btn" href="/">← Back to app</a>
  </div>
</body>
</html>`;
}
