---
name: openstream-release
description: Prepare OpenStream GitHub releases. Use when the user asks to release OpenStream, prepare a release, suggest a release version, aggregate changes since the previous release/tag, draft release notes, or trigger the repo's release.yml GitHub Actions workflow.
---

# OpenStream Release

## Workflow

Use this skill only from the OpenStream repository root.

1. Inspect the repo state:
   - Run `git status --short`.
   - Run `git fetch --tags origin`.
   - Do not trigger a release while uncommitted changes exist unless the user explicitly accepts that risk.

2. Generate a release proposal:
   - Run `python3 .codex/skills/openstream-release/scripts/propose_release.py`.
   - The script reads `package.json`, git tags, and commits since the latest `v*` tag.
   - It suggests a semantic version bump and release-note bullets.
   - Keep `Changes:` focused on user-facing app behavior; omit docs, CI, workflow, skill, and release-process-only changes.

3. Present the proposal for review:
   - Show the suggested version.
   - Show the proposed `Changes:` text exactly as it would be sent.
   - Ask for approval before triggering the workflow.
   - If the user edits the version or changes text, use the edited values.

4. Trigger the workflow only after approval:
   - Write the approved changes text to a temporary file.
   - Run:
     ```sh
     gh workflow run release.yml \
       -f version="$VERSION" \
       -F changes=@/path/to/approved-changes.md
     ```
   - Then report the queued workflow and suggest checking it with:
     ```sh
     gh run list --workflow release.yml --limit 5
     ```

## Version Guidance

Use the script suggestion as the default, then apply judgement:

- Major: breaking API/UX change, incompatible data migration, or commit subject/body contains `BREAKING CHANGE` or `!:` / `!(`.
- Minor: user-visible feature, new destination/provider, new release artifact behavior, or commit subject starts with `feat`.
- Patch: bug fix, docs-only release, internal cleanup, or commit subject starts with `fix`.

Never release the current `package.json` version again. The release workflow bumps package files and fails if the requested version does not change them.

## Release Notes Format

The workflow creates:

```text
Release vX.X.X

Changes:
<approved changes>

Note: macOS DMGs are currently ad-hoc signed and not notarized.
```

Only provide the `changes` input body, not the full template.
