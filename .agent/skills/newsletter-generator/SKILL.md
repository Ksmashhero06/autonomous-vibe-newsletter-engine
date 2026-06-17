---
name: newsletter-generator
description: Executes the autonomous tech newsletter generation pipeline, compiling trending HackerNews RSS stories for a given technical niche, drafting newsletter copy, and checking quality compliance.
---
# Newsletter Generator Skill

## Goal
To autonomously research tech trends, write copy, evaluate compliance, and output a structured Markdown newsletter for any technical niche.

## Instructions
1. Identify the user's target technical niche (e.g. "Rust Systems & WebAssembly", "Edge AI & Distributed Compute"). If not specified, default to "AI & Agentic Frameworks".
2. Ensure the standard Python environment has `google-generativeai` installed.
3. Ensure the environment variable `GEMINI_API_KEY` is set.
4. Execute the pipeline script from the skill's scripts directory:
   ```bash
   python scripts/agent_pipeline.py --niche "<niche>"
   ```
5. Check the output logs and the resulting timestamped markdown file (e.g., `newsletter_*.md`) created by the script.
6. Display a preview or summary of the generated newsletter to the user.

## Constraints
- Ensure `GEMINI_API_KEY` is loaded before launching the pipeline.
- Keep execution bounded to standard Python environments.
