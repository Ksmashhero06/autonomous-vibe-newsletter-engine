---
name: memory-skill
description: Provides memory capability to the agent fleet by maintaining a JSON record of previously covered newsletter topics to prevent repetitive content.
---
# Memory Skill

## Goal
To prevent generating duplicate newsletter content by storing and querying a history of covered topics.

## Instructions
1. Query the memory skill using the `check_past_issues` tool / function.
2. Provide a list of candidate topic titles to check.
3. If any title (or a semantic match) is flagged as already covered, reject it and select an alternative topic.
4. After successfully generating a newsletter, record the newly covered topic titles in `past_issues.json`.

## File Location
- Memory file: `past_issues.json` at project root.
