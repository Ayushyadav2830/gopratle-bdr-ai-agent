# GoPratle BDR Lead Enrichment & Outreach Agent 🚀

> An intelligent, production-ready B2B automation agent built for **GoPratle** to discover verified event decision-makers, conduct multi-query web research, generate evidence-backed 3-line pitches with Google Gemini, enforce human approval for Gmail outreach, and automate follow-ups without hallucinations or fake data.

[![Tests](https://img.shields.io/badge/Acceptance%20Tests-17%2F17%20Passing-brightgreen.svg)](docs/test-cases.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Orchestrator: n8n](https://img.shields.io/badge/Orchestrator-n8n-FF6D5A.svg)](workflows/)
[![Model: Gemini 1.5](https://img.shields.io/badge/AI%20Model-Gemini%201.5%20Flash-4285F4.svg)](prompts/gemini-agent-prompt.md)

---

## 📋 Table of Contents
1. [Business Context & Value Proposition](#-business-context--value-proposition)
2. [System Implementation & Readiness Status](#-system-implementation--readiness-status)
3. [Key Capabilities & Safety Controls](#-key-capabilities--safety-controls)
4. [Architecture & Pipeline](#-architecture--pipeline)
5. [Repository Structure](#-repository-structure)
6. [Google Sheets Schema (22 Columns)](#-google-sheets-schema-22-columns)
7. [Quick Start (Local Automated Test Suite)](#-quick-start-local-automated-test-suite)
8. [n8n Workflow Setup & Import](#-n8n-workflow-setup--import)
9. [Automated Test Matrix (17/17 Pass)](#-automated-test-matrix-1717-pass)
10. [Credentials & Configuration Required](#-credentials--configuration-required)
11. [Screen Recording Plan (3–5 Minutes)](#-screen-recording-plan-35-minutes)

---

## 🏢 Business Context & Value Proposition

**GoPratle** connects corporate and private event hosts with vetted event planners, DJs, and professional event crews.

When provided with a company name and city (e.g., `Company = Zomato; City = Gurgaon`), this agent:
1. Conducts targeted web research on the company's activations, festivals, and event presence using Tavily Search API.
2. Identifies the most relevant decision-makers strictly prioritizing **Events & Experiential** roles, followed by **Partnerships**, **HR**, and **Founders**.
3. Enforces **strict truthfulness**: No hallucinated names, titles, LinkedIn URLs, or email guesses.
4. Generates an evidence-backed, exactly **three-line personalized pitch** using Google Gemini 1.5 Flash.
5. Updates Google Sheets in-place and generates a **Gmail draft** requiring human approval.
6. Automates scheduled follow-ups (+2 days) with state-machine-driven opt-out suppression.

---

## 📊 System Implementation & Readiness Status

| Subsystem | Implementation Details | Status |
| :--- | :--- | :--- |
| **Input Validation** | Whitespace trimming, required company & city validation | **Implemented & Tested (17/17 Pass)** |
| **Duplicate Detection** | Suffix stripping (Ltd, Inc, Pvt), city aliases, cross-sheet matching | **Implemented & Tested (17/17 Pass)** |
| **Web Research (Tavily)** | 3-query search (Company, Decision-makers, Public Contact) | **Implemented & Tested with Mocks** (Requires `TAVILY_API_KEY` for live runs) |
| **Candidate Ranking** | Events (P1) > Partnerships (P2) > HR (P3) > Founder (P4) | **Implemented & Tested (17/17 Pass)** |
| **Evidence Confidence** | Evidence-based scoring (High, Medium, Low) | **Implemented & Tested (17/17 Pass)** |
| **AI Pitch Engine** | Gemini 1.5 Flash prompt, 3-line schema validation & repair loop | **Implemented & Tested with Mocks** (Requires `GEMINI_API_KEY` for live runs) |
| **Google Sheets Read/Write**| REST API v4 read, batch update, in-place row matching | **Implemented & Tested with Mocks** (Requires `GOOGLE_SHEET_ID` & OAuth for live runs) |
| **Gmail Draft Outreach** | RFC 2822 base64url MIME draft creation | **Implemented & Tested with Mocks** (Requires Gmail OAuth for live runs) |
| **Follow-up State Machine** | Gated on actual send; skips draft-only; suppresses on reply/opt-out | **Implemented & Tested (17/17 Pass)** |
| **Telegram Intake** | NLP command parser to append new rows | **Implemented** (Optional: requires `TELEGRAM_BOT_TOKEN`) |

---

## 🛡️ Key Capabilities & Safety Controls

| Feature | Implementation | Safety / Truthfulness Guarantee |
| :--- | :--- | :--- |
| **No Simulated Production Behavior** | Real API calls for Tavily, Gemini, Sheets, and Gmail | Production code throws explicit errors if credentials or APIs fail; zero silent mock fallbacks. |
| **Role Hierarchy** | Events > Partnerships > HR > Founders | Prioritizes operational buyers of crew/DJs rather than generic C-suite. |
| **Evidence Validation** | URL retention for all extracted facts | Marked `Not Found` if unsupported by credible sources. |
| **No Email Guessing** | Strict regex + public domain matching | No syntax guessing (`first.last@...`); requires verified public source. |
| **Approval-Gated Outreach** | Gmail Drafts by default | Never blasts cold outreach; routes demo messages to controlled test inbox. |
| **Follow-up Protection** | State machine checking outreach and reply state | Draft-only leads are SKIPPED without being marked Suppressed; sent leads are followed up; replies/opt-outs are suppressed. |
| **Self-Healing AI Prompts** | JSON schema repair loop | Validates 3 non-empty pitch lines; retries once on malformed responses. |

---

## 🏛️ Architecture & Pipeline

```text
[ Google Sheets / Telegram Intake ]
                │
                ▼
      [ Input Validation ] ──(Missing City)──► [ Mark Row Failed & Stop ]
                │
                ▼
       [ Duplicate Check ] ──(Duplicate)─────► [ Mark Row Duplicate & Stop ]
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
     └─ Outreach_Status: Draft Created | Followup_Status: Not Scheduled
                │
                ▼ (When approved & actually sent)
    [ Outreach_Status: Sent | Followup_Status: Pending (+2 Days) ]
                │
                ▼
  [ Scheduled Follow-up Agent (Periodic) ]
     ├─ Check If Outreach Was Actually Sent (Skip if only drafted)
     ├─ Check Reply_Status (Suppress if Replied/Opted Out)
     └─ Create Follow-up Draft
```

---

## 📂 Repository Structure

```text
gopratle-bdr-ai-agent/
├── workflows/
│   ├── 01-lead-enrichment.json      # Primary enrichment, duplicate branching & draft workflow
│   ├── 02-followup-agent.json        # Follow-up scheduler, skip/suppress/draft routing
│   └── 03-telegram-intake.json       # Optional natural language intake trigger
├── prompts/
│   └── gemini-agent-prompt.md        # System prompt, schema, & repair instructions
├── scripts/
│   ├── lead-parser.js                # Normalization, ranking & email extraction
│   ├── confidence-scorer.js          # Evidence-based confidence scoring
│   ├── pitch-validator.js            # Gemini 3-line validation & draft formatting
│   ├── agent-runner.js               # Production orchestration engine (live APIs + mocks for test)
│   ├── google-sheets-appscript.js    # Apps Script for automatic sheet webhooks
│   └── run-tests.js                  # Automated test suite (all 17 test scenarios)
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
13. `Research_Status`: `Pending` / `Processing` / `Completed` / `Needs Review` / `Failed` / `Duplicate`
14. `Outreach_Status`: `Not Ready` / `Draft Created` / `Pending Approval` / `Sent (Test)` / `Sent` / `Failed`
15. `Outreach_Message_ID`: Gmail draft or message ID
16. `Followup_Date`: Scheduled follow-up date/time
17. `Followup_Status`: `Not Scheduled` / `Pending` / `Draft Created` / `Completed` / `Suppressed`
18. `Last_Contacted_At`: Timestamp of actual outreach send
19. `Reply_Status`: `Unknown` / `Replied` / `No Reply` / `Opted Out` / `Bounced`
20. `Error_Details`: Diagnostic error message and failure stage
21. `Created_At`: Row creation timestamp
22. `Updated_At`: Last workflow update timestamp

---

## ⚡ Quick Start (Local Automated Test Suite)

Run the entire 17-scenario test suite in seconds without requiring live credentials:

```bash
# 1. Navigate to the repository
cd gopratle-bdr-ai-agent

# 2. Run the automated acceptance test suite
npm test
```

Expected output:
```text
================================================================================
  GOPRATLE BDR AGENT: PRODUCTION ACCEPTANCE & VERIFICATION TEST SUITE
================================================================================

✅ PASS [Test 01] Successful lead research using mocked API responses
        └─ Lead: Chaitanya Mathur, Draft: draft_mock_1794752650989
✅ PASS [Test 02] Missing company name validation
        └─ Company_Name is required
✅ PASS [Test 03] Missing city validation
        └─ City is required
✅ PASS [Test 04] No reliable lead found handling
        └─ Correctly marked Not Found and Needs Review without drafting email
✅ PASS [Test 05] No public email found handling
        └─ Lead saved, pitch generated, draft blocked
✅ PASS [Test 06] Weak evidence scoring
        └─ Correctly evaluated to Low: Candidate appears to be a former employee or stale profile
✅ PASS [Test 07] Duplicate company and city detection
        └─ Duplicate: 'zomato' in 'gurgaon' already exists (Status: Completed)
✅ PASS [Test 08] Invalid Gemini JSON validation & repair instruction
        └─ Caught malformed JSON and incomplete 3-line schema
✅ PASS [Test 09] Tavily API failure handling (No silent fallback)
        └─ Web research failed: Tavily API failed with status 401: Unauthorized API Key
✅ PASS [Test 10] Gemini API failure handling (No silent fallback)
        └─ Gemini pitch generation failed: Gemini API call failed with status 503: Service Unavailable
✅ PASS [Test 11] Google Sheets read/write failure handling
        └─ Handled 403 API permission errors cleanly
✅ PASS [Test 12] Gmail draft creation failure handling
        └─ Not marked as Sent, error logged cleanly
✅ PASS [Test 13] Draft-only follow-up handling (Skipped, NOT suppressed)
        └─ Initial outreach was only drafted, not actually sent
✅ PASS [Test 14] Follow-up creation after actual send
        └─ Created draft draft_mock_1794752650993 for Urban Company
✅ PASS [Test 15] Replied lead follow-up suppression
        └─ Suppressed due to Reply_Status: Replied
✅ PASS [Test 16] Opted-out lead follow-up suppression
        └─ Suppressed due to Reply_Status: Opted Out
✅ PASS [Test 17] Duplicate follow-up prevention
        └─ Follow-up already in state: Draft Created

================================================================================
TOTAL TESTS: 17 | PASSED: 17 | FAILED: 0
================================================================================
```

---

## ⚙️ n8n Workflow Setup & Import

1. **Import Workflows**:
   - In n8n, navigate to **Workflows > Import from File**.
   - Import `workflows/01-lead-enrichment.json` and `workflows/02-followup-agent.json`.
2. **Connect Credentials**:
   - **Google Sheets OAuth2**: Connect account with read/write access to your `GoPratle_BDR_Lead_Database`.
   - **Gmail OAuth2**: Connect account with compose/draft permissions.
   - **Environment Variables**: Add `GEMINI_API_KEY` and `TAVILY_API_KEY` in n8n Settings > Variables.
3. **Activate**:
   - Enable both workflows. Rows added to the Google Sheet will automatically trigger lead enrichment and draft creation.

---

## 🔑 Credentials & Configuration Required

To run the system against your live accounts, configure `.env`:

| Service | Environment Variable | Where to Obtain |
| :--- | :--- | :--- |
| **Google Gemini API** | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| **Tavily Search** | `TAVILY_API_KEY` | [Tavily](https://tavily.com/) |
| **Google Sheets** | `GOOGLE_SHEET_ID` | From your Google Sheet URL |
| **Google OAuth** | `GOOGLE_ACCESS_TOKEN` | GCP OAuth 2.0 Playground or Service Account |
| **Gmail OAuth** | Connected in n8n | Google Cloud Console OAuth 2.0 Client ID |
| **Test Mode Safety** | `TEST_MODE=true` | Keep `true` for safe demo mode |
| **Test Inbox** | `TEST_RECIPIENT_EMAIL` | Candidate's test inbox for test sends |

