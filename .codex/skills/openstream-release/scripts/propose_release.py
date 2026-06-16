#!/usr/bin/env python3
"""Suggest the next OpenStream release version and release-note bullets."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def run_git(args: list[str], cwd: Path) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


def parse_version(version: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", version.strip())
    if not match:
        raise ValueError(f"Unsupported semver version: {version}")
    return tuple(int(part) for part in match.groups())


def bump_version(version: str, bump: str) -> str:
    major, minor, patch = parse_version(version)
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def latest_release_tag(cwd: Path) -> str | None:
    tags = run_git(["tag", "--sort=-v:refname"], cwd).splitlines()
    release_tags = [tag for tag in tags if re.fullmatch(r"v\d+\.\d+\.\d+", tag)]
    return release_tags[0] if release_tags else None


def release_base(cwd: Path, current_version: str) -> tuple[str | None, str]:
    latest_tag = latest_release_tag(cwd)
    if latest_tag:
        return latest_tag, latest_tag

    output = run_git(["log", "--format=%H%x00%s"], cwd)
    version_patterns = [
        re.compile(rf"\brelease v?{re.escape(current_version)}\b", re.IGNORECASE),
        re.compile(rf"\bset release version to v?{re.escape(current_version)}\b", re.IGNORECASE),
    ]
    for line in output.splitlines():
        commit, _, subject = line.partition("\x00")
        if any(pattern.search(subject) for pattern in version_patterns):
            return commit, f"{commit[:7]} ({subject})"

    return None, "(none)"


def commit_subjects(cwd: Path, base_ref: str | None) -> list[str]:
    rev_range = f"{base_ref}..HEAD" if base_ref else "HEAD"
    output = run_git(["log", "--format=%s", rev_range], cwd)
    return [line.strip() for line in output.splitlines() if line.strip()]


def classify_bump(subjects: list[str]) -> str:
    bump = "patch"
    for subject in subjects:
        lowered = subject.lower()
        if "breaking change" in lowered or re.match(r"^[a-z]+(?:\([^)]*\))?!:", lowered):
            return "major"
        if lowered.startswith("feat") or any(
            keyword in lowered
            for keyword in [
                "add ",
                "youtube",
                "destination",
                "persist ",
                "release ",
                "permission",
                "screen capture",
            ]
        ):
            bump = "minor"
    return bump


def clean_subject(subject: str) -> str:
    subject = re.sub(r"^(feat|fix|docs|chore|refactor|test)(\([^)]*\))?:\s*", "", subject)
    subject = subject.strip().rstrip(".")
    if not subject:
        return ""
    return subject[0].upper() + subject[1:]


def release_bullets(subjects: list[str]) -> list[str]:
    lowered_subjects = [subject.lower() for subject in subjects]
    bullets: list[str] = []

    def has_any(*needles: str) -> bool:
        return any(any(needle in subject for needle in needles) for subject in lowered_subjects)

    if has_any("youtube", "oauth", "destination"):
        bullets.append(
            "- Added YouTube Live as a streaming destination with Google sign-in, livestream creation, and shareable watch URLs."
        )
    if has_any("persist launch preferences", "preferences"):
        bullets.append(
            "- Persisted launch preferences across restarts, including selected source, provider, audio, microphone, webcam, and layout settings."
        )
    if has_any("screen capture", "screen recording", "permission", "ad-hoc", "app identifier"):
        bullets.append(
            "- Improved macOS Screen Recording permission setup and ad-hoc signed macOS release DMGs."
        )
    if has_any("hud", "destination provider", "mic", "webcam", "focus ring", "tray"):
        bullets.append("- Refined HUD controls for destination, microphone, webcam, tray restore, and focus behavior.")
    if has_any("readme", ".env", "build env"):
        bullets.append("- Updated local build configuration and documentation for environment-based settings.")

    seen = {bullet.lower() for bullet in bullets}
    for subject in reversed(subjects):
        if subject.lower().startswith("chore: release "):
            continue
        cleaned = clean_subject(subject)
        if not cleaned:
            continue
        fallback = f"- {cleaned}."
        if fallback.lower() not in seen and len(bullets) < 8:
            seen.add(fallback.lower())
            bullets.append(fallback)

    return bullets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--bump", choices=["major", "minor", "patch"], default=None)
    parser.add_argument("--write-changes", type=Path, default=None)
    args = parser.parse_args()

    repo = args.repo.resolve()
    package_json = json.loads((repo / "package.json").read_text())
    current_version = package_json["version"]
    base_ref, base_label = release_base(repo, current_version)
    subjects = commit_subjects(repo, base_ref)
    bump = args.bump or classify_bump(subjects)
    suggested_version = bump_version(current_version, bump)
    bullets = release_bullets(subjects)
    changes = "\n".join(bullets) if bullets else "- Maintenance release."

    print(f"Current package version: {current_version}")
    print(f"Release base: {base_label}")
    print(f"Suggested bump: {bump}")
    print(f"Suggested version: {suggested_version}")
    print()
    print("Changes:")
    print(changes)

    if args.write_changes:
        args.write_changes.write_text(changes + "\n")
        print()
        print(f"Wrote changes to: {args.write_changes}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
