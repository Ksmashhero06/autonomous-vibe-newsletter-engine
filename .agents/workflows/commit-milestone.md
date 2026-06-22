---
description: Check git status, stage, commit, and push the completed milestone to GitHub.
---

Follow this workflow to commit and push the current milestone:

1. **Check Git Status**:
   ```powershell
   git status
   git log --oneline -5
   ```
   Review which files are modified, staged, or untracked.

2. **Verify Documentation**:
   - Ensure `README.md` documents the milestone (version bump, feature table updated).
   - Ensure `.agent_journal.json` has a new step entry for the work completed.
   - Ensure `.agent_code_map.md` is updated if new files or responsibilities were added.

3. **Stage Changes** (never stage `.env`):
   ```powershell
   git add server.ts src/App.tsx README.md .agent_journal.json .agent_code_map.md
   # Or stage everything except .env:
   git add -A
   git reset HEAD .env
   ```

4. **Commit with Conventional Commit format (Split into 4-5 or more separate commits)**:
   - **CRITICAL**: Do NOT bundle multiple distinct changes into a single large commit. Always split your changes into 1-2 (or more) separate commits based on logical separation (e.g. backend changes, pipeline scripts, config/rules, documentation updates).
   - Use the appropriate prefix for each commit:
     - `feat:` — new feature
     - `fix:` — bug fix
     - `docs:` — documentation only
     - `refactor:` — code restructure without behaviour change
     - `chore:` — maintenance tasks

   ```powershell
   git commit --no-verify -m "feat(ui): redesign cooperation tab as group chat"
   ```

5. **Push to GitHub**:
   ```powershell
   git push origin main
   ```

6. **Verify Sync**:
   ```powershell
   git status
   ```
   Confirm: `Your branch is up to date with 'origin/main'. nothing to commit, working tree clean.`

---

## Current Repository
- **Remote:** `https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine.git`
- **Branch:** `main`
- **Latest tag:** `v6.0.0` (Enterprise-Grade Evidence-Based RAG Platform)