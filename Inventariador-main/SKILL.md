---
name: gbr-release-management
description: Automates changelog generation from git history, version bumping, and GitHub release creation for the GBR Kardek inventory audit project. Follows Conventional Commits standard.
---

# GBR Release Management

Automates the release workflow for this project: changelog generation, version bumping, tag creation, and GitHub release publishing.

## When to Use

Activate this skill when the user asks to:
- "Create a release" or "cut a release"
- "Generate changelog" or "update changelog"
- "Bump version" or "tag a new version"
- "Publish release" or "create GitHub release"
- "Prepare release notes"

## Workflow Steps

### Step 1: Determine Version Bump

Run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD` to see commits since last tag.

Determine the version bump type using **Conventional Commits** analysis:
- **MAJOR** — commits with `BREAKING CHANGE:` or `!` after the type (e.g., `feat!: ...`)
- **MINOR** — commits with `feat:` type
- **PATCH** — all other commits (fix:, chore:, docs:, refactor:, etc.)
- If no commits since last tag, abort with a message.

Read the current version from `package.json` using `cat package.json | grep version`.

Use `semver` logic: `npm version <major|minor|patch>` (dry-run first).

### Step 2: Generate Changelog

Group commits by type in this order:

| Section | Commit Types |
|---|---|
| **⚠️ BREAKING CHANGES** | `BREAKING CHANGE` or `!` suffix |
| **🚀 New Features** | `feat:` |
| **🐛 Bug Fixes** | `fix:` |
| **🛠 Improvements** | `refactor:`, `perf:` |
| **📚 Documentation** | `docs:` |
| **🧹 Chores** | `chore:`, `ci:`, `test:`, `style:` |

For each commit, extract the scope (if any) from `type(scope):` and format as:
- `- **scope:** description (#PR)`
- If no scope: `- description (#PR)`

PR numbers are extracted from squash-merge commit messages where they typically appear as `type(scope): description (#123)`. If a commit doesn't have a PR number, omit the `(#PR)` suffix.

Prepend the new version's entries at the **top** of `CHANGELOG.md`, above the previous release section.

Prepend the new entries to `CHANGELOG.md` under a header like:
```markdown
## [1.2.3] - YYYY-MM-DD
```

### Step 3: Update Version

1. Check if `gh` (GitHub CLI) is installed:
   ```bash
   if ! command -v gh &>/dev/null; then
     echo "⚠️  gh not installed. Will generate release notes for manual publishing."
     GH_AVAILABLE=false
   else
     GH_AVAILABLE=true
   fi
   ```

2. Run `npm version <major|minor|patch> --no-git-tag-version` to update `package.json`
3. Read the new version from `package.json`
4. Commit the changes:
   ```
   git add package.json CHANGELOG.md
   git commit -m "chore(release): v<new-version>"
   ```
5. **Ask the user for confirmation** before pushing to remote:
   ```
   Will push tag v<new-version> to origin. Proceed? (y/N)
   ```
   Only proceed if user confirms.
6. Create the tag:
   ```
   git tag -a v<new-version> -m "Release v<new-version>"
   ```
7. Push tag and commit:
   ```
   git push origin v<new-version>
   git push origin <current-branch>
   ```

### Step 4: Create GitHub Release

Extract the new changelog section into a temp file for robust release notes:
```
# Write new section to temp file
awk '/^## \[/{if (found) exit; found=1} found' CHANGELOG.md | tail -n +2 > /tmp/release-notes.md
```

If `GH_AVAILABLE` is true and authenticated (`gh auth status &>/dev/null`):
```
gh release create v<new-version> \
  --title "v<new-version>" \
  --notes-file /tmp/release-notes.md
```

If `gh` is not available or not authenticated, print the release notes path and instruct:
```
Release notes written to /tmp/release-notes.md
Create the release manually at:
https://github.com/<owner>/<repo>/releases/new?tag=v<new-version>
```

## Error Handling

- **Dirty working tree:** Run `git status --porcelain`. If not empty, abort and instruct user to commit/stash changes first.
- **No previous tag:** If `git describe` fails, start from the beginning of git history.
- **No commits since last tag:** Abort with a message that there's nothing to release.
- **GitHub CLI not available:** Generate release notes and instruct manual release creation.
- **Dry-run mode:** Before executing any mutation, offer a preview:
  ```
  Preview release v<new-version>:
  - Commits: 12 (3 features, 5 fixes, 4 chores)
  - Changelog: CHANGELOG.md updated
  - Tag: v1.2.3 → v1.3.0
  - GitHub release: yes
  Run with --dry-run to preview without changes.
  ```

## Output

After completing, summarize:
- New version number
- Number of commits included
- Sections updated in changelog
- Whether GitHub release was created or manual steps needed

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub CLI release docs](https://cli.github.com/manual/gh_release_create)
