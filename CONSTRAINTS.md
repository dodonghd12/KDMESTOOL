# Constraints

Last reviewed: 2026-11-19

## Floor (always enforced, no setup required)

- No new suppression comments (`# noqa`, `# type: ignore`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `gitleaks:allow`, `nosemgrep`).
- No unimplemented stubs (`raise NotImplementedError`, `throw new Error("Not implemented")`, `pass # stub`, empty `catch {}` / `catch (e) {}` without comment).
- No skipped or deleted tests, and no stripped assertions in test files without a reason in the commit message.
- No secrets, API tokens, or database passwords committed in tracked source (GitLab tokens and DB credentials remain in server `.env` / untracked config; never print raw secret values in logs or tool output).
- Production database (`198.1.10.85` `kvmes.*`) is read-only by default; any `UPDATE`, `DELETE`, `DROP`, or `TRUNCATE` requires explicit user instruction and confirmation.
- `CONSTRAINTS.md` must never be weakened to make a change pass.

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at | Why this threshold |
|-----------|------|-----------|---------|--------------------|
| Python syntax | 0 syntax errors on modified `.py` files | `python .agents/hooks/check_fast.py` (`python -m py_compile`) | `Stop` hook, pre-`publish.ps1`, pre-`git commit` | Prevents publishing Flask backend syntax breakage to IIS production |
| JavaScript syntax | 0 syntax errors on modified `.js` / `.mjs` files | `python .agents/hooks/check_fast.py` (`node --check`) | `Stop` hook, pre-`publish.ps1`, pre-`git commit` | Catches browser script syntax errors before deployment |
| Floor & Secret Guard | 0 floor or secret violations in working-tree diff | `python .agents/hooks/check_fast.py` | `Stop` hook, pre-`publish.ps1`, pre-`git commit` | Blocks check suppressions, unfinished stubs, weakened tests, and credential leaks |
| Live E2E & Runtime Health (External) | 0 console errors, 0 uncaught page errors, live `.logo-badge` == `APP_VERSION` (`wait_until='domcontentloaded'`) | Playwright Chromium against `http://198.1.9.245:8386` | After every UI/API publish | Verifies live DOM, static asset cache busting, and runtime API behavior externally |
| Release Hygiene | `APP_VERSION` bumped in `app.py` (patch `.99` -> next minor `.1`) and `git status --short` clean | `.\publish.ps1` | On every release | Keeps live IIS badge, Graphify graph, and GitHub `origin/main` synchronized |

## Measured, not yet enforced (Ratchets)

| Metric | Current Baseline | Direction | Notes |
|--------|------------------|-----------|-------|
| Diff minimality | Minimal surgical diffs per `.agents/rules/ponytail.md` | Must stay minimal | Avoid unrequested abstractions, duplicate logic, or speculative wrappers |
| Static linters / secret CLI (`ruff`, `pytest`, `gitleaks`) | Not installed on workstation | Adopt incrementally | Must be installed and passing cleanly before promoting to `Enforced` |

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|

*(Maximum exception lifetime: 90 days.)*
