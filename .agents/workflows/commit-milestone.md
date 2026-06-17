---
description: Check git status, stage, commit, and push the completed Day milestone to GitHub.
---

Follow this workflow to commit and push the active Day's progress:

1. **Check Git Status**:
   - Run `git status` in the repository root to see the list of modified, untracked, and staged files.

2. **Verify Progress/README**:
   - Ensure the `README.md` file is updated to document the completed Day's milestone and the corresponding checkbox is marked as complete (e.g., `- [x] **Day 2: ...**`).

3. **Stage Changes**:
   - Stage the changes by running `git add .` (excluding sensitive local configuration files like `.env`).

4. **Commit with Descriptive Message**:
   - Commit the changes with a meaningful message detailing what was accomplished for that day (e.g., `Day 2: Agent Tools & Interoperability - Live HN RSS Tool + Gemini Function Calling`).

5. **Push to GitHub**:
   - Push the committed changes to the remote repository on GitHub using `git push origin main` (or the active branch).

6. **Verify Sync**:
   - Run `git status` again to verify that the local branch is clean and up to date with `origin/main`.
