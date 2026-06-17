---
description: Run the multi-agent pipeline (Trend Scout, Copywriter, and Compliance Critic) to generate a newsletter.
---

Follow this workflow to run the multi-agent pipeline and generate a tech newsletter:

1. **Verify Environment**:
   - Ensure the virtual environment is active (`venv\Scripts\activate` on Windows).
   - Verify that the `GEMINI_API_KEY` is loaded in the terminal environment or stored in the `.env` file.

2. **Execute the Python Pipeline**:
   - Run the standalone multi-agent script:
     ```powershell
     python agent_pipeline.py
     ```
   - *Optional:* To run for a specific niche, use the `--niche` parameter:
     ```powershell
     python agent_pipeline.py --niche "Rust Systems & WebAssembly"
     ```
   - *Optional:* To customize the model, use the `--model` parameter:
     ```powershell
     python agent_pipeline.py --niche "Edge AI & Distributed Compute" --model "gemini-1.5-pro"
     ```

3. **Verify Output**:
   - Confirm that the pipeline completes execution successfully.
   - Verify that a stamped Markdown newsletter file has been created locally with a timestamp (e.g., `newsletter_*.md`).
