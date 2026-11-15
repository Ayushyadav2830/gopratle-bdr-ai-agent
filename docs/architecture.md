# GoPratle BDR Agent - Architecture Specification

## 1. System Overview

The GoPratle BDR Lead Enrichment & Outreach Agent is a lightweight, event-driven B2B automation system designed to find relevant business contacts, research company context, generate personalized outreach pitches using Google Gemini, create approval-gated Gmail drafts, and automate follow-ups.

```mermaid
flowchart TD
    subgraph TriggerLayer["1. Trigger & Intake Layer"]
        A1["Google Sheets (Row Added)"] --> B1["Validate Input"]
        A2["Telegram Bot (/connect command)"] --> B2["Parse Natural Command"]
        B2 --> A1
    end

    subgraph ValidationLayer["2. Validation & Safety"]
        B1 --> C1{"Company & City Valid?"}
        C1 -- No --> C2["Mark Failed: Invalid Input"]
        C1 -- Yes --> C3{"Duplicate Check"}
        C3 -- Duplicate Found --> C4["Log Duplicate Skip"]
        C3 -- Unique --> D1["Initiate Web Research"]
    end

    subgraph ResearchLayer["3. Multi-Query Web Research"]
        D1 --> E1["Tavily Search: Company Context"]
        D1 --> E2["Tavily Search: Decision Makers"]
        D1 --> E3["Tavily Search: Public Business Contact"]
        E1 & E2 & E3 --> F1["Extract & Rank Candidates"]
    end

    subgraph DecisionLayer["4. Candidate Ranking & Evidence Scoring"]
        F1 --> G1{"Role Hierarchy:\n1. Events\n2. Partnerships\n3. HR\n4. Founder"}
        G1 --> G2["Calculate Evidence Confidence\n(High / Medium / Low)"]
    end

    subgraph PitchLayer["5. Gemini AI Pitch Generation"]
        G2 --> H1["Gemini 1.5 Flash Prompt"]
        H1 --> H2{"Validate 3-Line JSON"}
        H2 -- Invalid --> H3["Self-Healing Repair Attempt"]
        H3 --> H2
        H2 -- Valid --> I1["Update Google Sheet Row"]
    end

    subgraph OutreachLayer["6. Gated Outreach & Follow-up"]
        I1 --> J1{"Approval Gate\nConfidence >= Medium &\nPublic Email Found?"}
        J1 -- No / Low --> J2["Needs Review (No Draft)"]
        J1 -- Yes --> J3["Create Gmail Draft / Controlled Test Send"]
        J3 --> J4["Schedule Follow-up (+2 Days)"]
        J4 --> K1["Follow-up Sub-workflow\n(15-min Schedule Trigger)"]
        K1 --> K2{"Check Reply & Opt-out"}
        K2 -- Replied / Opted Out --> K3["Suppress Follow-up"]
        K2 -- No Reply & Due --> K4["Create Follow-up Draft"]
    end
```

---

## 2. Component Responsibilities

| Component | Technology | Responsibility |
| :--- | :--- | :--- |
| **Workflow Orchestration** | n8n / Node.js Runner | Triggers, data flow, branching, retries, idempotency, and status updates. |
| **Lead Database** | Google Sheets | 22-column relational lead store, review flags, message tracking IDs, and timestamps. |
| **Web Research** | Tavily Search API | Multi-query targeted searches for company context, decision-makers, and public business emails. |
| **AI Reasoning & Pitch** | Google Gemini 1.5 Flash | Candidate relevance evaluation, JSON output structuring, and 3-line personalized pitch writing. |
| **Outreach Delivery** | Gmail API | Draft generation by default; controlled test sending to candidate inbox in demo mode. |
| **Follow-up Engine** | n8n Scheduled Workflow | Periodic due-date scanning, reply/opt-out suppression check, and follow-up draft creation. |
| **Optional Command Intake** | Telegram Bot API | Natural-language command parser to add new prospect rows directly from mobile. |

---

## 3. Data Integrity & Anti-Hallucination Controls

1. **Strict Role Hierarchy**:
   - `Events Manager / Head of Events / Event Operations` (Priority 1)
   - `Partnerships Manager / Brand Partnerships` (Priority 2)
   - `HR Head / People Operations` (Priority 3)
   - `Founder / Co-founder / CEO` (Priority 4)
2. **No Data Fabrication**:
   - If a person or email is not present in verifiable search results, the field is explicitly marked `Not Found`.
   - Never guess email patterns (e.g., `first.last@company.com`).
3. **Evidence-Based Confidence**:
   - **High**: Target role, company, city, and verified public email/profile present.
   - **Medium**: Relevant decision-maker identified, but public email or city is unconfirmed. Draft created only for human review.
   - **Low**: Ambiguous title, stale result, or no evidence. Outreach strictly prohibited.

---

## 4. Error Handling & Recovery

- **Invalid Input**: Missing Company or City causes immediate short-circuit; marked `Failed` in Sheet without wasting API credits.
- **Duplicate Prevention**: Normalized company and city matching prevents duplicate enrichment and duplicate outreach.
- **AI Self-Healing**: Invalid JSON or pitch line count triggers an automated repair retry; if still invalid, flagged as `Needs Review`.
- **Gmail Failure**: Network or credential issues leave outreach status as `Not Ready` or `Failed`; never incorrectly marked `Sent`.
- **Follow-up Suppression**: Leads that have replied or opted out are automatically marked `Suppressed`.
