# Duckcy portfolio

A multi-page portfolio for Bui Hai Duc at **https://duckcy.me**, retaining the original animated interface. Astro builds each route as real HTML; navigation uses ordinary links, so pages can be shared, refreshed and opened directly without a client-side router. Static output describes hosting, while the interface keeps its starfield, floating orbs, avatar ring, YAML profile, glass cards, interaction effects and original five themes.

## Original interface restoration

The page structure follows the original `index.html` and `styles.css`: Home contains the original hero and profile card; About retains its Overview, Education and Testimonials tabs; Skills retains independent Core and Also tab groups; Projects retains its code-style showcase cards and stack categories; Experience and Contact retain their original cards and timeline. About → Certificates opens the dedicated `/certificate/` route. Both pages retain the same four-item section navigation; Certificates is marked active on its page, and the other links return to the matching About tab. The theme pill and cycle button retain Outer Space, Daylight, Forest Terminal, Deep Ocean and Sunset Ember. Navigation changes routes instead of scrolling through every section on one long page.

Visual effects are decorative and progressively enhanced. Reduced-motion preferences stop continuous animation and retain readable content. Theme preferences and contact/chat history use guarded storage; denied storage does not block navigation. Mobile menus and dropdowns provide keyboard access, Escape handling and focus restoration. Each standalone page has its own heading and canonical URL.

The mobile Home layout places CV and contact actions immediately below the name and role, followed by the avatar and YAML profile. Desktop retains the original two-column layout. Project list cards show a short summary, the actual role, a factual highlight and four technology tags; the remaining technologies and complete descriptions are available on the detail page. Search still indexes the full description and all technologies.

The pause button beside the theme control stops the animated backdrop and continuous decorative effects. Its preference persists across routes and refresh through guarded local storage (`portfolio-motion`). Animation remains enabled by default; the operating system's reduced-motion preference always takes precedence. Pausing decorations does not pause Cloud Rescue gameplay.

## Develop and verify

Use Node **24** (`nvm use` reads `.nvmrc`) and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
```

The development server prints its local address. Build and check the generated site before reviewing it:

```sh
npm run check
npm test
npm run build
npm run verify
npx playwright install chromium
npm run test:e2e
npm run test:performance
npm run qa
```

Browser acceptance starts `astro preview` at `http://127.0.0.1:4321` against `dist/`. To use an existing local Chrome installation instead of downloading Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e
```

Playwright adds `--ignore-lock` to the preview command so Astro 7 stays in the foreground even when it detects a coding agent. Manual preview can run in the background in that environment; use `npx astro preview status` and `npx astro preview stop` to inspect or stop that worktree's preview.

`npm run preview` also previews the completed build manually. Desktop and mobile browser tests check routes, refresh/Back/Forward, navigation, five themes, project filtering, tabs, contact drafts, chatbot fallbacks and lazy game loading. Axe checks serious and critical WCAG issues on every route in the default Outer Space theme and on Contact across all five themes. This coverage does not imply a complete accessibility audit of every page in every theme. Full-page screenshots, traces and reports are written to ignored `artifacts/`. These checks describe the local build; they do not prove the state of Production or the external AI provider.

`npm run test:performance` starts its own preview on port 4323 and runs three independent cold mobile Lighthouse audits each for Home and Projects, using default simulated throttling. Acceptance requires median performance of at least 90 and accessibility of at least 95 on every run. Scores and FCP/LCP/CLS/TBT are recorded in `artifacts/lighthouse-summary.json`; full JSON/HTML reports are in `artifacts/lighthouse/`. The digest must match the build both before and after auditing. Run this after other browser tests finish to avoid contention. For an existing local Chrome binary, use `CHROME_PATH=/usr/bin/google-chrome npm run test:performance`.

`artifacts/qa-report.json` records the Git commit, dirty source state, a SHA-256 manifest of the build and hashes of static/browser/performance evidence. The browser run records its build digest before testing. The QA report fails if evidence describes a different build, if static verification fails, if browser tests fail or are flaky, if the browser run is filtered, or if the required performance reports are missing or fail. Local Astro/unit command results remain in command output unless `QA_CHECK_STATUS`, `QA_UNIT_STATUS` and `QA_BUILD_STATUS` are supplied; CI records those outcomes and a Vitest JSON report automatically.

## Pages and content

| Route | Content |
| --- | --- |
| `/` | Original hero, YAML profile, animated avatar, CV/contact/game actions |
| `/about/` | Original Overview, Education and Testimonials tab layout |
| `/skills/` | Original Core and Also skill groups with independent accessible tabs |
| `/projects/` | Original project showcase cards, search and stack category filters |
| `/projects/sblt-cup/` | SBLT CUP details |
| `/projects/classes369/` | Classes369 details |
| `/projects/investor-ai/` | Investor AI details |
| `/experience/` | Work, education and community experience |
| `/certificate/` | Published certificate and official credential link |
| `/contact/` | Contact links and an email draft form |
| `/404.html` | Custom missing-page response |

The canonical form includes a trailing slash, for example `https://duckcy.me/certificate/`. The build creates `certificate/index.html`. Hosting normalization should accept `/certificate` too; verify that behavior directly on GitHub Pages after deployment.

Astro's local preview strictly enforces `trailingSlash: 'always'` and returns 404 for `/certificate` without its slash. The local tests use canonical paths and validate the real directory files; GitHub Pages' slash normalization is a separate live hosting check.

Authoritative portfolio facts, project technology lists, social links and certificate details live in `src/data/portfolio.ts`. The chatbot also reads these facts instead of maintaining an independent biography. Page files under `src/pages/` use the shared layout and components. The original design tokens and responsive styles are in `src/styles/`; page behavior and visual effects are in `src/scripts/`. The restored page templates also retain the original skill, education and experience presentation, so keep visible facts consistent with the shared data when editing them.

To add a project:

1. Add its metadata to `projects` in `src/data/portfolio.ts`, with a unique lowercase URL slug, the actual repository link and factual stack.
2. Create `src/content/projects/<slug>.md` with the project's factual description. Home intentionally retains only the original hero so the dedicated project list stays on `/projects/`.
3. Import that Markdown file in `src/pages/projects/[slug].astro` and add the same slug to its `articles` map. Both metadata and this mapping are required: metadata alone generates a route with no article and fails the build.
4. Update route inventories in `scripts/verify-site.mjs`, `tests/e2e/site.spec.ts` and this README for the new page, then run the checks above. Open the generated detail page, confirm its GitHub link, and test its search/filter results before deployment.

Public assets live under `public/assets/`. The existing CV URL remains `/assets/CV_bui_hai_duc.pdf`. Add actual credential URLs and assets when adding certificates; do not create unsupported achievements or testimonials. Certificates uses authentic locally hosted badge artwork and an official Credly verification link. The original image source and retrieval date are recorded beside the PNG in `public/assets/certificates/`. Desktop places the larger badge beside its details; mobile stacks them vertically. No third-party iframe or script is requested by this page. If the local image fails, the page retains readable credential details and its verification link.

Browser checks block Credly requests to verify that the certificate stays useful without that service, and also check local-image failure and JavaScript-disabled rendering. The earlier observation of low contrast inside a Credly iframe describes the previous embed, which is no longer part of this page. The compatibility loader remains available for future optional embeds but is not activated by the current certificate markup.

Project search and technology filters are reflected in the URL (`q` and comma-separated `tech`) so the same result set can be shared. Search combines with any selected technology. The shared theme preference uses local storage; navigation still works when storage is unavailable.

## Contact, chatbot and game

The contact form **opens an email draft in the visitor's email application**. It does not send email from the website and does not report delivery. The draft stays in session storage across navigation and refresh until explicitly cleared. Visitors can copy the draft or use email, phone and social links directly. This static deployment has no mail server.

The chatbot calls the existing `chatbot-proxy.ducbanca1604.workers.dev` proxy and uses local published facts if the proxy errors or exceeds the 15-second deadline. Proxy credentials and provider configuration are external to this repository; no provider key belongs in the static build. History is limited and retained for the same browser tab. Browser acceptance mocks provider responses, errors and timeout, so live proxy/model behavior requires a separate Production check.

A separate Chromium check during this migration made an unmocked POST from the existing `https://duckcy.me` origin: the proxy returned HTTP 200, allowed that origin through CORS, and produced an assistant text reply with the published email. When present, ignored `artifacts/live-proxy.json` records the limited observation and its limitations; the exact request timestamp was not captured. This checks connectivity and the provider contract, not deployment of the new interface or the complete new prompt.

Cloud Rescue retains the existing engine under `game/`. The new page loader imports its JavaScript and stylesheet only after the Play Game button is activated. The 10-second load deadline, retry/cancel behavior, modal focus and scroll restoration remain tested. The legacy Cloud Rescue adapter delegates to the same engine.

## Deploy and roll back

The intended host remains GitHub Pages with the custom domain `duckcy.me`. `astro.config.mjs` uses static directory output, production `site: 'https://duckcy.me'` and no repository-name base path. `public/CNAME` contains `duckcy.me`; DNS and HTTPS do not need to change for this migration.

The workflow `.github/workflows/pages.yml` verifies pull requests and pushes to `main`. It runs Astro checks, unit tests, a static build, link/artifact verification, Chromium acceptance and the cold mobile performance gate. Successful `main` runs upload only `dist/` to the `github-pages` environment and deploy it. Pull requests never deploy. QA evidence is uploaded even when verification fails; a failed job blocks deployment.

For the first migration release:

1. Review the isolated branch, screenshots, test results and generated artifact. Preserve unrelated work and existing evidence changes.
2. Record the current working Production deployment before releasing. Merge the approved migration into `main`.
3. In the repository's **Settings → Pages**, change **Source** from **Deploy from a branch** to **GitHub Actions**, retaining custom domain `duckcy.me` and **Enforce HTTPS**. This live setting change is a release action; local configuration does not perform it.
4. Run the main-branch workflow if a new run is needed. Confirm all checks and the Pages deployment succeed.
5. Check live `/`, `/certificate`, `/certificate/`, every project detail path, refresh, assets/CV, a nonexistent route returning HTTP 404, HTTPS and the `www.duckcy.me` redirect. Check the real chatbot separately.

Keep the repository public if the current GitHub billing plan does not support Pages from a private repository. This repository previously stopped serving the domain when its Pages entitlement was lost; DNS alone cannot fix that condition.

To roll back a migration release, revert its approved commit and deploy the known-good previous artifact using Pages. If returning to the legacy one-page publishing mode, restore **Deploy from a branch → main → /(root)** and confirm domain/HTTPS settings, then verify Production again. Do not remove the custom domain or edit DNS as a routine rollback step.

## Legacy verification

The original root `index.html`, `script.js`, `styles.css` and `chatbot.js` are retained for existing source-coupled regression tests and for reviewing the previous implementation. The new deployable site comes only from `src/` and `public/`; those legacy root files are not copied to `dist/`.

The existing `evidence/` files and `scripts/fc-*` pipeline describe the old one-page/game build, including its source digest and hardware profiles. Treat those reports as historical evidence. They are not acceptance results for the current multi-page artifact, and routine website checks do not overwrite them. Use new `artifacts/` reports for the current build.

The migration audit snapshot recorded **two high findings and zero critical findings** through [`http-cache-semantics` (GHSA-ch52-4w7c-c8xp)](https://github.com/advisories/GHSA-ch52-4w7c-c8xp), with no patched package version available at verification. The affected package belongs to Astro’s local build/server dependency tree; GitHub Pages receives static files without that server runtime. Retain the audit output, review upstream fixes and rerun `npm audit` when upgrading; this observed snapshot is not a promise about future dependency checks. An old Astro downgrade is not an assumed remediation.
