# Day 4: Vibe Coding Agent Security and Evaluation 🔒🧪

This directory acts as the entrypoint for the Day 4 hands-on labs and sandboxed agent projects. In alignment with security best practices, the source codes for these projects are maintained in separate, specialized git repositories.

Below are the details and repository links for the two core projects completed during Day 4.

---

## 1. Secure Agent Lab: Shopping Assistant
A secure LLM agent sandbox designed using the **Google Agent Development Kit (ADK)**. It implements role validation, custom input boundaries, STRIDE threat modeling, and local commit-stage gating.

*   **Repository Link:** [Ksmashhero06/secure-agent-lab](https://github.com/Ksmashhero06/secure-agent-lab)
*   **Key Deliverables:**
    *   **Agent Logic (`app/agent.py`):** Integrates tools for redeeming discount codes, processing cart checkouts, awarding loyalty points, and updating coupon activation states.
    *   **STRIDE Threat Model (`threat_model.md`):** Comprehensive analysis of assets, entrypoints, trust zones, and threat mitigations.
    *   **Security Tests (`tests/test_agent.py`):** High-coverage outcome-based unit tests verifying parameter checks, access boundaries, and discount state validation.
    *   **Commit Gating & Semgrep Hooks:** Integrated Git pre-commit hooks that use Semgrep static analysis rules to automatically intercept and block commits containing hardcoded Google API credentials.

---

## 2. Ambient Expense-Approval Agent
An automated expense-routing agent designed using a 5-node ADK Workflow graph. It features a local evaluation loop and web hook integration.

*   **Repository Link:** [Ksmashhero06/ambient-expense-agent](https://github.com/Ksmashhero06/ambient-expense-agent)
*   **Key Deliverables:**
    *   **Orchestration Graph:** Implements routing logic (`START ➔ parse ➔ route ➔ (auto_approve | risk_reviewer ➔ HITL ➔ record)`).
    *   **Security Checkpoint Node:** Programmatically filters out PII (SSNs and credit cards) and inspects inputs for malicious prompt injections.
    *   **Pub/Sub Webhook Server:** A FastAPI webhook server that handles incoming Pub/Sub push messages, dynamically triggers the workflow, and executes sessions asynchronously in the background.
    *   **Local Evaluation Pipeline:** Contains synthetic test scenarios (`tests/eval/datasets/basic-dataset.json`), an execution trace generator (`generate_traces.py`), and a custom local LLM-as-judge grading script (`run_grade.py`).
