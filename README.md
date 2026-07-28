# subnetctl — IPv4 Subnet Calculator

A small web tool created with the help of Claude Code that takes an IPv4 address and a CIDR prefix length and
returns the subnet breakdown: network address, broadcast address,
subnet/wildcard masks, and usable host range.

Built as the bonus stage of a DevOps technical assessment, to demonstrate
a working CI/CD pipeline end-to-end — not just a sample workflow file.

**Live site:** _add your deployed URL here after enabling GitHub Pages_
**Repo:** _add your GitHub repository URL here_

## Why this project

Subnetting is core to the networking side of IT/cybersecurity work, so
This doubles as a useful reference tool and a real (if small) app to
wire a pipeline around — plain JS logic that's easy to unit test, a
build step, and a deploy step, same shape as a much bigger project.

## Stack

- Vanilla JavaScript + [Vite](https://vitejs.dev/) (no framework needed
  for something this small)
- [Vitest](https://vitest.dev/) for unit tests on the subnet math
- [ESLint](https://eslint.org/) for linting
- GitHub Actions for CI/CD
- GitHub Pages for hosting

## Running locally

```bash
npm install
npm run dev       # local dev server
npm run lint       # lint
npm test           # run the unit tests
npm run build      # production build to dist/
npm run preview    # preview the production build locally
```

## CI/CD pipeline

`.github/workflows/deploy.yml` runs on every push and pull request
against `main`:

1. **Checkout** — pulls the repository onto the runner.
2. **Install dependencies** — `npm ci` for a clean, reproducible install.
3. **Lint** — `npm run lint` (ESLint).
4. **Test** — `npm test` (Vitest) against the subnet calculation logic.
5. **Build** — `npm run build` produces the static `dist/` folder.
6. **Deploy** — on a push to `main` only, the built `dist/` folder is
   uploaded and published to **GitHub Pages** automatically via
   `actions/deploy-pages`.

Pull requests run steps 1–5 (build validation) but skip deployment, so
broken code never reaches the live site.

## Enabling GitHub Pages for this repo

After pushing this project to a public repository:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or re-run the workflow) — the site publishes
   automatically at `https://<username>.github.io/<repo-name>/`.

## Project structure

```
├── src/
│   ├── subnet.js           # pure subnet math (parseIp, calculateSubnet, ...)
│   ├── main.js             # DOM wiring / UI
│   ├── style.css
│   └── __tests__/
│       └── subnet.test.js  # unit tests for subnet.js
├── index.html
├── vite.config.js
├── eslint.config.js
└── .github/workflows/deploy.yml
```
