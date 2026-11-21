// Verifies 1B.7 (audit WIN-8, APP-4): the compiled Markdown viewer (ui.markdown,
// src/apps/markdown) renders a hostile .md without running anything: quotes can't leave
// attributes, only http(s)/mailto/#/relative link URLs (http(s)/relative/data:image images),
// raw HTML shows as text, links get rel="noopener noreferrer". Renderer unit cases:
// src/apps/markdown/markdown.test.ts (npx vitest run).
//
// Run: node testing/scripts/security/verify-host-markdown.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const MD = [
  '# Hostile notes',
  '',
  '![x](x" onerror="top.__pwned_md_img=1)',
  '',
  '[click](javascript:top.__pwned_md_js=1)',
  '',
  '[tabbed](java\tscript:top.__pwned_md_tab=1)',
  '',
  '<img src=x onerror="top.__pwned_md_raw=1"><script>top.__pwned_md_script=1</script>',
  '',
  '[safe](https://example.com/page)',
  '',
  '**bold** and `code`',
].join('\n');

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  await page.evaluate((md) => window.fs.writeFileSync('/home/user1/md-verify.md', md), MD);
  // .md opens with the compiled viewer by default (system default handler).
  await page.evaluate(() => platform.host.exec(platform, '/home/user1/md-verify.md'));
  let info = null;
  for (let i = 0; i < 30 && !info?.h1; i++) {
    info = await page.evaluate(() => {
      const doc = document.querySelector('.window[data-name="ui.markdown"] iframe')?.contentDocument;
      const body = doc?.querySelector('.md-body');
      if (!body) return null;
      return {
        h1: body.querySelector('h1')?.textContent,
        imgs: [...body.querySelectorAll('img')].map((i) => [...i.attributes].map((a) => a.name)),
        links: [...body.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel'), text: a.textContent })),
        scripts: body.querySelectorAll('script').length,
        text: body.textContent,
        bold: !!body.querySelector('strong'), code: !!body.querySelector('code'),
      };
    });
    if (!info?.h1) await page.waitForTimeout(300);
  }
  await page.waitForTimeout(800);
  const pwned = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned_md')));
  console.log('   ', JSON.stringify(info));
  check('the default .md viewer renders the file', info?.h1 === 'Hostile notes' && info.bold && info.code);
  check('nothing in the file ran', pwned.length === 0, JSON.stringify(pwned));
  check('no event-handler attributes on images', (info?.imgs || []).every((attrs) => attrs.every((a) => !a.startsWith('on'))), JSON.stringify(info?.imgs));
  check('raw HTML shown as text, no script elements', info?.scripts === 0 && info?.text.includes('<script>'), '');
  check('javascript: links dropped (also tab-split)', (info?.links || []).every((l) => !/script:/i.test(l.href.replace(/\s/g, ''))) && !(info?.links || []).some((l) => l.text === 'click' || l.text === 'tabbed'), JSON.stringify(info?.links));
  check('safe links kept, opened without an opener', (info?.links || []).some((l) => l.href === 'https://example.com/page' && l.rel === 'noopener noreferrer'), JSON.stringify(info?.links));
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
