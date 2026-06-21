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
3. The skill uses `text-embedding-004` to compute embeddings and check semantic similarity (threshold: 0.85). If any title has a high semantic match or exact match, reject it and select an alternative topic.
4. After successfully generating a newsletter, record the newly covered topic titles and their embeddings in `past_issues.json`.

## File Location
- Memory file: `past_issues.json` at project root, which stores a JSON array of past issues including their computed embedding vectors.
