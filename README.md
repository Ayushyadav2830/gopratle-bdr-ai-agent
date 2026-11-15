# GoPratle BDR Lead Enrichment & Outreach Agent 🚀

> An intelligent, lightweight B2B automation agent built for **GoPratle** to discover verified event decision-makers, conduct multi-query web research, generate evidence-backed 3-line pitches with Google Gemini, enforce human approval for Gmail outreach, and automate follow-ups without hallucinations.

[![Tests](https://img.shields.io/badge/Acceptance%20Tests-10%2F10%20Passing-brightgreen.svg)](docs/test-cases.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Orchestration: n8n](https://img.shields.io/badge/Orchestrator-n8n-FF6D5A.svg)](workflows/)
[![Model: Gemini 1.5](https://img.shields.io/badge/AI%20Model-Gemini%201.5%20Flash-4285F4.svg)](prompts/gemini-agent-prompt.md)

---

## 📋 Table of Contents
1. [Business Context & Value Proposition](#-business-context--value-proposition)
2. [Key Capabilities & Safety Controls](#-key-capabilities--safety-controls)
3. [Architecture & Pipeline](#-architecture--pipeline)
4. [Repository Structure](#-repository-structure)
5. [Google Sheets Schema (22 Columns)](#-google-sheets-schema-22-columns)
6. [Quick Start (Local Engine)](#-quick-start-local-engine)
7. [n8n Workflow Setup & Import](#-n8n-workflow-setup--import)
8. [End-to-End Acceptance Tests (10/10)](#-end-to-end-acceptance-tests-1010)
9. [Screen Recording Plan (3–5 Minutes)](#-screen-recording-plan-35-minutes)
10. [Credentials & Environment Setup](#-credentials--environment-setup)

---

## 🏢 Business Context & Value Proposition

**GoPratle** connects corporate and private event hosts with vetted event planners, DJs, and professional event crews.

When provided with a company name and city (e.g., `Company = Zomato; City = Gurgaon`), this agent:
1. Conducts targeted web research on the company's activations, festivals, and event presence.
2. Identifies the most relevant decision-makers strictly prioritizing **Events & Experiential** roles, followed by **Partnerships**, **HR**, and **Founders**.
3. Enforces **strict truthfulness**: No hallucinated names, titles, LinkedIn URLs, or email guesses.
4. Generates an evidence-backed, exactly **three-line personalized pitch** using Google Gemini.
5. Updates Google Sheets in-place and generates a **Gmail draft** requiring human approval.
6. Automates scheduled follow-ups with opt-out suppression.

---

## 🛡️ Key Capabilities & Safety Controls

| Feature | Implementation | Safety / Truthfulness Guarantee |
| :--- | :--- | :--- |
| **Role Hierarchy** | Events > Partnerships > HR > Founders | Prioritizes operational buyers of crew/DJs rather than generic C-suite. |
| **Evidence Validation** | URL retention for all extracted facts | Marked `Not Found` if unsupported by credible sources. |
| **No Email Guessing** | Strict regex + public domain matching | No syntax guessing (`first.last@...`); requires verified public source. |
| **Approval-Gated Outreach** | Gmail Drafts by default | Never blasts cold outreach; routes demo messages to controlled test inbox. |
| **Follow-up Suppression** | State machine checking `Reply_Status` | Instantly suppresses follow-ups if prospect replied or opted out. |
| **Self-Healing AI Prompts** | JSON schema repair loop | Validates 3 non-empty pitch lines; retries once on malformed responses. |

---

## 🏛️ Architecture & Pipeline

```text
[ Google Sheets / Telegram Intake ]
                │
                ▼
      [ Input Validation ] ──(Missing City)──► [ Mark Row Failed ]
                │
                ▼
       [ Duplicate Check ] ──(Duplicate)─────► [ Skip Duplicate Row ]
                │
                ▼
     [ Multi-Query Tavily Search ]
     ├─ 1. Company Context & Activations
     ├─ 2. Decision-Makers (Events, Partnerships, HR)
     └─ 3. Official Public Contact Information
                │
                ▼
  [ Candidate Ranking & Evidence Scoring ]
     └─ Calculate Confidence: High / Medium / Low
                │
                ▼
   [ Google Gemini 1.5 Flash AI Engine ]
     └─ Formulate 3-Line Personalized Pitch + Email Subject
                │
                ▼
     [ Schema & Line Count Validation ] ──(Invalid)──► [ Repair Retry ]
                │
                ▼
    [ Google Sheets In-Place Row Update ]
                │
                ▼
        [ Approval Gate ] ──(Confidence < Medium)──► [ Flag: Needs Review ]
                │
                ▼
  [ Gmail Draft / Controlled Test Send ]
                │
                ▼
    [ Follow-up Scheduler (+2 Days) ]
                │
                ▼
  [ Scheduled Follow-up Agent (Periodic) ]
     ├─ Check Initial Message Sent Status
     ├─ Check Reply_Status (Suppress if Replied/Opted Out)
     └─ Create Follow-up Draft
```

---

## 📂 Repository Structure

```text
gopratle-bdr-ai-agent/
├── workflows/
│   ├── 01-lead-enrichment.json      # Primary enrichment & draft workflow
│   ├── 02-followup-agent.json        # Follow-up scheduler & suppression workflow
│   └── 03-telegram-intake.json       # Optional natural language intake trigger
├── prompts/
│   └── gemini-agent-prompt.md        # System prompt, schema, & repair instructions
├── scripts/
│   ├── lead-parser.js                # Normalization, ranking & email extraction
│   ├── confidence-scorer.js          # Evidence-based confidence scoring
│   ├── pitch-validator.js            # Gemini 3-line validation & draft formatting
│   ├── agent-runner.js               # Full orchestration runner (live & test mode)
│   ├── google-sheets-appscript.js    # Apps Script for automatic sheet webhooks
│   └── run-tests.js                  # Acceptance test suite (10/10 test cases)
├── templates/
│   └── GoPratle_BDR_Lead_Database_Template.csv # 22-column Google Sheet template
├── docs/
│   ├── architecture.md               # Detailed system architecture & Mermaid diagrams
│   ├── setup-guide.md                # n8n & Google Cloud setup guide
│   ├── test-cases.md                 # Acceptance test matrix & execution logs
│   └── screen-recording-script.md    # 3–5 min video walkthrough script
├── .env.example                      # Sanitized environment variable template
├── .gitignore                        # Git exclusion rules
├── package.json                      # Node.js dependencies & test scripts
└── README.md                         # Project documentation
```

---

## 📊 Google Sheets Schema (22 Columns)

The spreadsheet `GoPratle_BDR_Lead_Database` (tab `Leads`) includes these exact 22 columns:

1. `Company_Name` *(Required)*: e.g., Zomato
2. `City` *(Required)*: e.g., Gurgaon
3. `Target_Role`: Events / Partnerships / HR / Founder / Other
4. `Lead_Name`: Verified decision-maker name (or `Not Found`)
5. `Job_Title`: Current role supported by source
6. `LinkedIn_URL`: Public profile URL (no guessing)
7. `Public_Email`: Publicly listed business email (or `Not Found`)
8. `Contact_Source`: Source URL(s) supporting the contact details
9. `Company_Context`: Factual company/event context with source
10. `AI_Pitch`: Exactly three concise, tailored lines
11. `Email_Subject`: Short, relevant subject line
12. `Lead_Confidence`: `High` / `Medium` / `Low`
13. `Research_Status`: `Pending` / `Processing` / `Completed` / `Needs Review` / `Failed`
14. `Outreach_Status`: `Not Ready` / `Draft Created` / `Pending Approval` / `Sent (Test)` / `Sent` / `Failed`
15. `Outreach_Message_ID`: Gmail draft or message ID
16. `Followup_Date`: Scheduled follow-up date/time
17. `Followup_Status`: `Not Scheduled` / `Pending` / `Draft Created` / `Completed` / `Suppressed`
18. `Last_Contacted_At`: Timestamp of actual outreach send
19. `Reply_Status`: `Unknown` / `Replied` / `No Reply` / `Opted Out`
20. `Error_Details`: Diagnostic error message and failure stage
21. `Created_At`: Row creation timestamp
22. `Updated_At`: Last workflow update timestamp

---

## ⚡ Quick Start (Local Engine)

Run the entire system and verify all test cases locally in seconds:

```bash
# 1. Navigate to the repository
cd gopratle-bdr-ai-agent

# 2. Copy the environment template
cp .env.example .env

# 3. Run the automated acceptance test suite
npm test
```

Expected output:
```text
================================================================
  GOPRATLE BDR AGENT: END-TO-END ACCEPTANCE TEST SUITE
================================================================

✅ PASS : 1. Happy Path (Zomato, Gurgaon)
       └─ Lead: Chaitanya Mathur (Global Head of Events & Live IPs), Draft ID: draft_1794751654795_1laxny3
✅ PASS : 2. Missing City Validation
       └─ Correctly rejected: City is required
✅ PASS : 3. No Lead Found
       └─ Lead marked Not Found, research note saved, no email drafted
✅ PASS : 4. No Public Email Found
       └─ Lead found (Rohit Kapoor), email Not Found, pitch generated, draft blocked
✅ PASS : 5. Weak Evidence Handling
       └─ Scored Low confidence: Insufficient evidence: missing person name, title, or supporting source URL
✅ PASS : 6. Duplicate Row Prevention
       └─ Duplicate row detected. Already recorded on 2026-11-15T09:00:00.000Z
✅ PASS : 7. AI Invalid JSON Schema Repair
       └─ Invalid JSON flagged, repair instruction generated, valid recovery verified
✅ PASS : 8. Gmail Failure Handling
       └─ Correctly blocked send: Cannot create draft: Public business email is Not Found
✅ PASS : 9. Due Follow-up Detection
       └─ Follow-up draft created for Urban Company
✅ PASS : 10. Follow-up Suppression on Reply/Opt-out
       └─ Follow-up suppressed for both Replied and Opted Out leads

----------------------------------------------------------------
TOTAL TESTS: 10 | PASSED: 10 | FAILED: 0
----------------------------------------------------------------
```

---

## ⚙️ n8n Workflow Setup & Import

1. **Import Workflows**:
   - In n8n, go to **Workflows > Import from File**.
   - Import `workflows/01-lead-enrichment.json` and `workflows/02-followup-agent.json`.
2. **Connect Credentials**:
   - **Google Sheets OAuth2**: Connect account with read/write access to your `GoPratle_BDR_Lead_Database`.
   - **Gmail OAuth2**: Connect account with compose/draft permissions.
   - **Environment Variables**: Add `GEMINI_API_KEY` and `TAVILY_API_KEY` in n8n Settings > Variables.
3. **Activate**:
   - Enable both workflows. Rows added to the Google Sheet will automatically trigger lead enrichment and draft creation.

---

## 🎥 Screen Recording Plan (3–5 Minutes)

Refer to [docs/screen-recording-script.md](docs/screen-recording-script.md) for a scene-by-scene script:
- **0:00 – 0:25**: System overview & stack introduction
- **0:25 – 0:55**: Adding `Zomato, Gurgaon` to the Google Sheet
- **0:55 – 1:55**: Real-time n8n workflow execution (Tavily search, role ranking, Gemini pitch)
- **1:55 – 2:40**: Google Sheet updated row inspection (sources, 3-line pitch, confidence)
- **2:40 – 3:25**: Gmail draft inspection and approval gate demonstration
- **3:25 – 4:05**: Follow-up automation and opt-out suppression check
- **4:05 – 4:35**: Exported workflow JSONs, GitHub repository, and test suite verification

---

## 🔑 Credentials & Environment Setup

| Service | Environment Variable | Where to Obtain |
| :--- | :--- | :--- |
| **Google Gemini API** | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) |
| **Tavily Search** | `TAVILY_API_KEY` | [Tavily](https://tavily.com/) |
| **Google Sheets** | `GOOGLE_SHEET_ID` | From your Google Sheet URL |
| **Gmail OAuth** | Connected in n8n | Google Cloud Console OAuth 2.0 Client ID |
| **Test Mode Safety** | `TEST_MODE=true` | Keep `true` for safe demo mode |
