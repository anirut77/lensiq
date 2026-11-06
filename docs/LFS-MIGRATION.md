# Moving `vendor/` binaries to Git LFS (forward-only, no history rewrite)

## Why

The repository tracks about 122 MB under `vendor/` (145 files; measured 2026-11, `git ls-files vendor`). The 27 files
that match the LFS rules in `tools/lfs/gitattributes.lfs` (`*.onnx`, `*.task`, `*.tflite`, `*.bin`, weight shards,
`*.wasm`) make up about 115 MB, from 0.2 MB to 25 MB each; the largest is `modnet.onnx` at 25 MB. (A local `du -sh vendor`
shows about 135 MB because it also counts the git-ignored, never-committed `faceparse-*.onnx`, 13 MB.) Every clone downloads all of them in every historical version,
and every model update adds the full file size to history again.

## Decision: forward-only

We **do not** run `git lfs migrate import` over existing history. A rewrite would change every commit SHA, break
existing clones, forks, PR links, tags and the GitHub Pages deploy history, and it would need a force-push to `main`.
Instead, from the migration commit onwards, the files are stored as LFS objects. Old commits keep their blobs, so the
`.git` size stops growing but does not shrink. The history rewrite can be done later as a separate, announced change
(see the appendix) if clone size becomes a real problem.

## Prerequisites

- [ ] Git LFS ≥ 3 installed for everyone who pushes (`git lfs version`). On macOS: `brew install git-lfs`. On
      Debian/Ubuntu: `apt install git-lfs`. GitHub runners already have it.
- [ ] A GitHub LFS quota that fits about 115 MB of storage plus bandwidth per clone/CI run. Check
      *Settings → Billing → Git LFS* for the current plan's quota. CI caches LFS objects (see `ci.yml`), so bandwidth
      is spent only when the files change.
- [ ] A pause on PRs that touch `vendor/` until the migration is merged.

## Steps (one PR, about 15 minutes)

```bash
# 1. clean, up-to-date main, on a branch
git switch main && git pull --ff-only
git switch -c chore/lfs-vendor
git lfs install                      # once per machine: installs the smudge/clean hooks

# 2. confirm nothing is an LFS pointer yet (it should report "no LFS pointers")
node tools/check-lfs.mjs

# 3. add the LFS rules (keeps the existing CRLF fixture rule)
cat tools/lfs/gitattributes.lfs >> .gitattributes
git add .gitattributes

# 4. re-add the matching files so they are stored as LFS objects in the NEXT commit (history untouched)
git add --renormalize vendor/
git status --short | head            # the vendor/ binaries show as modified (content now an LFS pointer)
git lfs ls-files | wc -l             # expect 27 files (onnx, task, tflite, bin, shards, wasm) as of 2026-11

# 5. verify locally before committing
git lfs status
node tools/check-lfs.mjs             # the working tree still has real binaries -> OK
npm run test:unit && npm run test:e2e -- smoke csp
node tools/build-site.mjs && node tools/check-site.mjs   # the exact site the Pages workflow publishes

git commit -m "Store vendor/ model and WASM binaries in Git LFS (forward-only, no history rewrite)"
git push -u origin chore/lfs-vendor  # pushes the LFS objects first, then the commit
```

### 6. Confirm GitHub Pages deploys through Actions (before merging)

"Deploy from a branch" serves the **pointer text files** instead of LFS content, so the models would 404 or fail to
parse. Since round 5, `.github/workflows/pages-lfs.yml` ("Pages") is the production deploy anyway (allowlisted
`_site/`, no server code or tests published), with its `push: branches: [main]` trigger enabled. So:

1. Check *Settings → Pages → Build and deployment*: **Source = GitHub Actions**. If it still says "Deploy from a
   branch", do the switch in [`DEPLOYMENT-CHECKLIST.md` §0](DEPLOYMENT-CHECKLIST.md#0-hosting-the-public-demo-on-github-pages) first.
2. After the merge, open the Actions run "Pages". Its LFS steps now pull the objects (they are no-ops before the
   migration), and its `check-lfs` step refuses to publish pointers.
3. Smoke-test the live site: open `studio.html?cpu` and `store.html?cpu`. The models must load. Also run
   `curl -sI https://<user>.github.io/<repo>/vendor/models/modnet.onnx` and expect `content-length` ≈ 25 MB, not
   about 130 bytes.

### 7. After the merge (tell the team)

```bash
git pull
git lfs install      # if not done before
git lfs pull         # replaces any pointer files with the binaries
node tools/check-lfs.mjs
```

The service worker cache (`sw.js`) does not need a version bump, because the file contents are identical.

## What is already LFS-ready (no action needed)

| Place | How |
|---|---|
| `.github/workflows/ci.yml` | Checks out without LFS, builds a cache key from `git lfs ls-files`, restores `.git/lfs` from the Actions cache, runs `git lfs pull`, then `node tools/check-lfs.mjs`. Before the migration all of these are no-ops. |
| `npm run test:e2e` | `pretest:e2e` runs `tools/check-lfs.mjs`, so a clone without LFS fails in 1 s with instructions instead of an obscure model-load error deep in a test |
| `tools/static-server.mjs`, `server.py` | Serve whatever is in the working tree. With LFS pulled, that is the real binaries. |
| `.github/workflows/pages-lfs.yml` | The production Pages deploy (push to `main`). Pulls LFS objects when any are tracked, runs `check-lfs`, builds `_site/` with `tools/build-site.mjs` and verifies it with `tools/check-site.mjs` |

## Rollback

Revert the migration commit and run `git lfs pull` plus `git add --renormalize vendor/`. Keep Pages on "GitHub
Actions": the workflow works with or without LFS objects, and "Deploy from a branch" would publish the whole repository
again (server code, tests, tools). The LFS objects stay on the server and do no harm.

## Appendix: optional history rewrite (later, announced)

Run this only with agreement from everyone who has a clone, and with forks notified:

```bash
git lfs migrate import --everything --include="vendor/models/**/*.onnx,vendor/models/**/*.task,vendor/models/**/*.tflite,vendor/models/**/*.bin,vendor/models/**/group1-shard*,vendor/**/*.wasm"
git push --force-with-lease --all && git push --force-with-lease --tags
```

Everyone must re-clone afterwards. Open PRs have to be rebased onto the rewritten `main`.
