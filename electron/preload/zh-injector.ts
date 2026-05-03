export type DictFile = {
  exact?: Record<string, string>;
  regex?: Array<{ pattern: string; replace: string }>;
};

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;

function compileRegex(entries: DictFile['regex']): Array<{ re: RegExp; replace: string }> {
  if (!entries?.length) return [];
  return entries.map(({ pattern, replace }) => ({ re: new RegExp(pattern, 'g'), replace }));
}

function translateText(raw: string, exact: Record<string, string>, regexes: Array<{ re: RegExp; replace: string }>): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const hit = exact[trimmed];
  if (hit) return trimmed === raw ? hit : raw.replace(trimmed, hit);
  let s = trimmed;
  for (const { re, replace } of regexes) {
    re.lastIndex = 0;
    if (re.test(s)) {
      re.lastIndex = 0;
      const next = s.replace(re, replace);
      return trimmed === raw ? next : raw.replace(trimmed, next);
    }
  }
  return raw;
}

function walkTextNodes(
  root: Node,
  exact: Record<string, string>,
  regexes: Array<{ re: RegExp; replace: string }>,
  dumpMisses: boolean,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tn = n as Text;
    const p = tn.parentElement;
    if (!p) continue;
    const tag = p.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
    const v = tn.nodeValue;
    if (!v || !v.trim()) continue;
    const next = translateText(v, exact, regexes);
    if (next !== v) {
      tn.nodeValue = next;
    } else if (dumpMisses && v.trim().length > 1 && /^[\x20-\x7E]+$/.test(v.trim())) {
      console.debug('[i18n-miss]', v.trim());
    }
  }
}

function translateAttrs(el: Element, exact: Record<string, string>, regexes: Array<{ re: RegExp; replace: string }>): void {
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (!cur?.trim()) continue;
    const next = translateText(cur, exact, regexes);
    if (next !== cur) el.setAttribute(a, next);
  }
}

function walkElements(root: ParentNode, exact: Record<string, string>, regexes: Array<{ re: RegExp; replace: string }>): void {
  const els = root.querySelectorAll('*');
  for (const el of els) translateAttrs(el, exact, regexes);
}

let zhMutationObserver: MutationObserver | null = null;

export function initZhInjector(dict: DictFile): void {
  zhMutationObserver?.disconnect();
  zhMutationObserver = null;

  const exact = dict.exact ?? {};
  const regexes = compileRegex(dict.regex);
  const dumpMisses = typeof window !== 'undefined' && window.location.search.includes('i18n-dump=1');

  const run = () => {
    if (!document.body) {
      // #region agent log
      fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
        body: JSON.stringify({
          sessionId: 'e36b4c',
          hypothesisId: 'H6-no-document-body',
          location: 'electron/preload/zh-injector.ts:run',
          message: 'run skipped — document.body missing',
          data: { readyState: typeof document !== 'undefined' ? document.readyState : 'n/a' },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return;
    }
    walkTextNodes(document.body, exact, regexes, dumpMisses);
    walkElements(document.body, exact, regexes);
    // #region agent log
    const sample = document.body.innerText?.replace(/\s+/g, ' ').trim().slice(0, 100) ?? '';
    fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
      body: JSON.stringify({
        sessionId: 'e36b4c',
        hypothesisId: 'H5-dict-and-dom',
        location: 'electron/preload/zh-injector.ts:run',
        message: 'after first walk',
        data: {
          exactKeys: Object.keys(exact).length,
          hasBody: Boolean(document.body),
          bodyTextLen: document.body.innerText?.length ?? 0,
          bodyTextSample: sample,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  };

  run();

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
        const tn = m.target as Text;
        const v = tn.nodeValue;
        if (v && v.trim()) {
          const next = translateText(v, exact, regexes);
          if (next !== v) tn.nodeValue = next;
        }
      } else if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node as Element, exact, regexes, dumpMisses);
            walkElements(node as Element, exact, regexes);
          } else if (node.nodeType === Node.TEXT_NODE) {
            const tn = node as Text;
            const v = tn.nodeValue;
            if (v?.trim()) {
              const next = translateText(v, exact, regexes);
              if (next !== v) tn.nodeValue = next;
            }
          }
        });
      }
    }
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  zhMutationObserver = obs;
}
