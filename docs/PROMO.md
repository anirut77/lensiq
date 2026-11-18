# Promotion basics (owner order 2026-11-18 C)

Home page and every category 6 (fortune) page: page title and description in TH (markup) with EN / 中文 through the
page dictionaries, a share preview for LINE and Facebook, a not-found page, a sitemap and robots.txt.

## One address for everything

`deploy/site-url.json` `"base"` is the only place that holds the public address (now `https://anirut77.github.io/lensiq/`).
`node tools/promo-meta.mjs` writes from it:

- the share block between `<!--promo-->` and `<!--/promo-->` in the `<head>` of index.html and each category 6 page
  (canonical, og:title / og:description copied from the page's own `<title>` and meta description, og:url, og:image,
  og:image:width / height / alt, twitter:card);
- `sitemap.xml` (every root page except 404.html and pages marked noindex: account, admin, pricing);
- `robots.txt`;
- `404.html`: a normal site page (shared header and footer from nav.js, TH in the markup, EN / 中文 from
  `i18n/*-notfound.js`) with absolute buttons to home, fortune and help.

`node tools/promo-meta.mjs --check` (and tests/unit/promo-basics.test.js) fails when any of them is out of date. Edit a
page title or description in the page itself, then run the tool so the share block follows.

**Hosting move:** change `"base"`, run `node tools/promo-meta.mjs`, commit. Nothing else needs editing.

## Share images

`share/og-home.png` (home page) and `share/og-fortune.png` (category 6), 1200 x 630 PNG, about 60 KB each. Sources:
`tools/share-src/og-*.svg`, rendered with `tools/share-src/render.sh`. Own shapes and brand mark only, no photos and no
people. Text is set in Prompt (SIL Open Font License 1.1, `vendor/fonts/prompt/OFL.txt`), which allows use in images.
Social sites do not run the page's JavaScript, so the preview text is the Thai default. The images are not loaded by the
pages themselves (no effect on page weight); only the head tags add about 1.3 KB per page.

## Known limits

- 404.html loads its styles and scripts relative to the missing address, like every page. At a one-level address
  (`/lensiq/typo.html`) it looks like the rest of the site; at a nested one (`/lensiq/a/b`) it shows unstyled text, but
  the three buttons are absolute and still lead home.

- robots.txt is only read at the root of a host. On `anirut77.github.io/lensiq/` crawlers read
  `anirut77.github.io/robots.txt` instead, so until the custom domain is live submit `sitemap.xml` in Google Search
  Console / Bing Webmaster Tools by hand (owner's account; no change to DNS or repo settings).
- LINE and Facebook cache previews. After a change, refresh with the Facebook Sharing Debugger; LINE refreshes its cache
  on its own after a while.
