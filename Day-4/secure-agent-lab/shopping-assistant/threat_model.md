# STRIDE Threat Modeling Assessment: Shopping Assistant Agent

This document presents a systematic security threat assessment for the `shopping-assistant` agent application following the **STRIDE** methodology.

---

## 🔍 System Boundaries & Architecture Map

* **Trust Boundaries**:
  * **User Interface / API Client ──> FastAPI Server**: Unauthenticated input boundary.
  * **FastAPI Server ──> ADK Workflow**: Normalizes incoming messages and passes them to the agent graph.
  * **ADK Workflow ──> Gemini Model**: Outgoing API requests utilizing the configured API Key.
  * **LlmAgent ──> Local Tools**: Execution boundary for the `redeem_discount` function.
* **Data Stores**:
  * **`DISCOUNT_STORE`**: In-memory Python dictionary tracking discount codes and their redemption status.

---

## 🛡️ STRIDE Pillar Evaluation

### 1. Spoofing (Identity Spoofing)
* **Threat**: A user can impersonate a registered user to redeem discount codes.
* **Analysis**: The `redeem_discount` tool requires a `user_id` parameter to proceed. However, the system relies on the LLM to identify the user's identity from the raw conversation or accepts whatever ID is supplied. There is no cryptographic signature, token verification (JWT), or session state binding to confirm that the user who sent the message is the true owner of that `user_id`.
* **Severity**: **HIGH**

### 2. Tampering (Data Tampering)
* **Threat**: Malicious parameters or injection payloads could manipulate execution state.
* **Analysis**: The `redeem_discount` tool validates that the discount code matches a key in the `DISCOUNT_STORE` and checks its Boolean value. This mitigates simple database tampering. However, since the state is in-memory, restarting the server resets the store, effectively tampering with the persistence boundary.
* **Severity**: **MEDIUM**

### 3. Repudiation
* **Threat**: Redeeming users can deny performing actions because transaction logs are insufficient or missing.
* **Analysis**: Currently, the system lacks structured audit logs. Successful and failed redemptions are returned as text to the user but are not written to a secure, write-only database or audit trail log.
* **Severity**: **HIGH**

### 4. Information Disclosure
* **Threat**: Leakage of API credentials or system internals.
* **Analysis**:
  * **Mock Credentials**: The model is initialized with a hardcoded mock key prefix (`api_key="AIzaSyD-mock-key-value-12345"`). While a mock key, storing secrets directly in code leads to credential leaks if pushed to VCS.
  * **Error Handling**: The application does not catch and redact system exception traces. If the tool fails unexpectedly, internal file structures or Python stacks could be printed directly back to the client.
* **Severity**: **HIGH**

### 5. Denial of Service (DoS)
* **Threat**: Exhausting LLM quotas or memory capacity.
* **Analysis**: The API endpoints lack rate-limiting middleware. A malicious user could submit recursive or massive inputs to consume memory, or flood the API with requests to exhaust the Gemini API quota.
* **Severity**: **MEDIUM**

### 6. Elevation of Privilege
* **Threat**: Unauthorized users (guests) bypassing redemption checks.
* **Analysis**: The tool blocks guest users (`user_id.startswith("guest_")`). However, because there is no cryptographic check on the `user_id`, a guest user can elevate their privileges to a registered user simply by finding or guessing a valid registered ID (like `user-123`).
* **Severity**: **HIGH**

---

## 🛠️ Mitigation Roadmap

| Pillar | Threat Description | Recommended Mitigation | Status |
|---|---|---|---|
| **S** | Spoofing `user_id` | Bind session authentication tokens (JWT) to the FastAPI request context; resolve identity at the server level, never via the user's raw prompt text. | ⏳ Planned |
| **T** | In-memory reset | Migrate state from the in-memory dictionary to a persistent database (e.g. SQLite, PostgreSQL) with transactional integrity. | ⏳ Planned |
| **R** | Lack of audit trail | Implement structured logging for all tool calls, capturing the timestamp, verified user ID, code, and outcome. | ⏳ Planned |
| **I** | Hardcoded API Key | Extract the API key to environment variables (`GOOGLE_API_KEY`) and configure a pre-commit scanner (Semgrep) to block future commits containing hardcoded keys. | ⏳ Planned |
| **D** | Quota exhaustion | Implement rate-limiting middleware on the FastAPI gateway endpoint. | ⏳ Planned |
| **E** | Privilege elevation | Implement role-based access checks against the authenticated user session. | ⏳ Planned |
