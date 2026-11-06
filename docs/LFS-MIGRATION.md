# Moving `vendor/` binaries to Git LFS (forward-only, no history rewrite)

## Why

The repository holds about 132 MB of models and WASM runtimes under `vendor/`. They come in about 50 files of
0.4–25 MB, the largest being `modnet.onnx` at 25 MB. Every clone downloads all of them in every historical version,
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
- [ ] A GitHub LFS quota that fits about 135 MB of storage plus bandwidth per clone/CI run. Check
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
git lfs ls-files | wc -l             # expect ≈ 30–40 files (onnx, task, tflite, bin, shards, wasm)

# 5. verify locally before committing
git lfs status
node tools/check-lfs.mjs             # the working tree still has real binaries -> OK
npm run test:unit && npm run test:e2e -- smoke csp

git commit -m "Store vendor/ model and WASM binaries in Git LFS (forward-only, no history rewrite)"
git push -u origin chore/lfs-vendor  # pushes the LFS objects first, then the commit
```

### 6. Switch GitHub Pages to the Actions deployment (same PR, before merging)

"Deploy from a branch" serves the **pointer text files** instead of LFS content, so the models would 404 or fail to
parse.

1. In `.github/workflows/pages-lfs.yml`, uncomment the `push: branches: [main]` trigger.
2. In *Settings → Pages → Build and deployment*, set **Source = GitHub Actions**.
3. After the merge, open the Actions run "Pages (with LFS)". Its `check-lfs` step refuses to publish pointers.
4. Smoke-test the live site: open `studio.html?cpu` and `store.html?cpu`. The models must load. Also run
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
| `.github/workflows/pages-lfs.yml` | Ready, manual trigger only until step 6 |

## Rollback

Revert the migration commit and run `git lfs pull` plus `git add --renormalize vendor/`. Then switch Pages back to
"Deploy from a branch". The LFS objects stay on the server and do no harm.

## Appendix: optional history rewrite (later, announced)

Run this only with agreement from everyone who has a clone, and with forks notified:

```bash
git lfs migrate import --everything --include="vendor/models/**/*.onnx,vendor/models/**/*.task,vendor/models/**/*.tflite,vendor/models/**/*.bin,vendor/models/**/group1-shard*,vendor/**/*.wasm"
git push --force-with-lease --all && git push --force-with-lease --tags
```

Everyone must re-clone afterwards. Open PRs have to be rebased onto the rewritten `main`.
