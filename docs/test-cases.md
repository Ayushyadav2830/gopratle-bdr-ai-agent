# GoPratle BDR Agent - Acceptance Test Matrix & Verification Report

This document details the complete 17-scenario automated acceptance test suite for the GoPratle BDR Lead Enrichment & Outreach Agent.

---

## 1. Test Execution Summary

- **Total Test Cases**: 17
- **Passed**: 17
- **Failed**: 0
- **Test Mode**: Automated Unit & Integration Test Suite (`scripts/run-tests.js`)
- **Status Distinction**:
  - **Tested with mocks**: Verified in automated test suite with controlled mock API adapters (Tavily, Gemini, Google Sheets, Gmail).
  - **Tested with live credentials**: Ready for execution against live endpoints when user configures API keys in `.env`.
  - **Production Code Isolation**: Production methods (`searchTavily`, `generateGeminiPitch`, `createGmailDraft`, `readGoogleSheetRows`) contain zero hard-coded responses and throw explicit errors if credentials or live APIs fail.

---

## 2. Comprehensive Acceptance Matrix (17 Scenarios)

| # | Test Scenario | Input / Precondition | Expected Behavior | Actual Verified Result | Status |
| :-: | :--- | :--- | :--- | :--- | :-: |
| **01** | **Successful Lead Research (Mocked APIs)** | `Company_Name`: Zomato<br>`City`: Gurgaon | Targeted search runs; lead identified (Chaitanya Mathur, Events Head); verified email extracted; 3-line pitch generated; Gmail draft created; follow-up NOT scheduled yet. | Lead parsed, High confidence assigned, 3-line pitch validated, draft created (`draft_mock_...`), `Followup_Status = 'Not Scheduled'`. | **PASS** |
| **02** | **Missing Company Name** | `Company_Name`: `""`<br>`City`: Gurgaon | Immediate validation failure; no web research or outreach; row marked Failed with diagnostic error. | Input validator caught missing company; marked `Research_Status = 'Failed'`; `Error_Details = 'Company_Name is required'`. | **PASS** |
| **03** | **Missing City** | `Company_Name`: Blinkit<br>`City`: `"   "` | Immediate validation failure; no web research or outreach; row marked Failed. | Input validator caught blank city; marked `Research_Status = 'Failed'`; `Error_Details = 'City is required'`. | **PASS** |
| **04** | **No Reliable Lead Found** | `Company_Name`: EmptyCorp<br>`City`: NowhereCity | Search returns zero decision-makers; lead marked `Not Found`; draft creation blocked; marked `Needs Review`. | `Lead_Name = 'Not Found'`; `Outreach_Status = 'Not Ready'`; `Research_Status = 'Needs Review'`; no draft created. | **PASS** |
| **05** | **No Public Email Found** | `Company_Name`: Swiggy<br>`City`: Bangalore | Decision-maker found (Rohit Kapoor); public email unverified (`Not Found`); pitch generated and saved in Sheet; draft creation blocked. | Profile saved; pitch stored in Sheet; `Public_Email = 'Not Found'`; `Outreach_Status = 'Not Ready'`; draft blocked. | **PASS** |
| **06** | **Weak Evidence / Stale Lead** | Candidate profile contains stale indicators (e.g. "former", "ex-") or missing source. | Confidence scored `Low`; human review required; outreach blocked. | Evaluated to `Low` confidence; `eligibleForDraft = false`; flagged for human review. | **PASS** |
| **07** | **Duplicate Company & City Detection** | Input: `"  zomato   "`, `"GURGAON  "`, `"Zomato, Ltd."`<br>Existing: `"Zomato"`, `"Gurgaon"` | Robust normalization strips whitespace, case variations, punctuation, and legal suffixes (e.g. Ltd/Inc); skips duplicate processing. | Detected duplicate; preserved existing record; set `Research_Status = 'Duplicate'`; prevented duplicate outreach. | **PASS** |
| **08** | **Invalid Gemini JSON & Line Count** | Model outputs malformed text or fewer than 3 lines. | Schema validator detects defect; generates explicit repair payload; recovers valid schema or flags `Needs Review`. | Caught invalid JSON and incomplete 3-line response; generated repair instructions; verified valid schema recovery. | **PASS** |
| **09** | **Tavily API Failure (No Silent Mock Fallback)** | Tavily API returns 401 Unauthorized or network timeout. | System captures failure explicitly; does NOT silently fall back to fake leads; marks row `Failed` with diagnostic message. | Caught 401 error; row marked `Research_Status = 'Failed'`; `Error_Details` contains exact Tavily error; zero mock data leakage. | **PASS** |
| **10** | **Gemini API Failure (No Silent Mock Fallback)** | Gemini API returns 503 Service Unavailable or quota error. | System captures failure explicitly; does NOT silently generate fake pitches; marks row `Needs Review` with error details. | Caught 503 error; row marked `Research_Status = 'Needs Review'`; `Error_Details` records failure cleanly. | **PASS** |
| **11** | **Google Sheets Read/Write Failure** | Google Sheets API returns 403 Forbidden or invalid token. | System captures HTTP error; throws descriptive exception; does not report false success. | Successfully caught 403 API permission errors for both reading and updating operations. | **PASS** |
| **12** | **Gmail Draft Creation Failure** | Gmail API returns 401 Unauthorized or network error. | Status is NOT marked as Sent or Draft Created; failure is logged cleanly. | `Outreach_Status = 'Failed'`; `Outreach_Message_ID = ''`; error logged in `Error_Details`. | **PASS** |
| **13** | **Draft-Only Follow-up Suppression** | Row has `Outreach_Status = 'Draft Created'` and passed due date. | Draft Created must NEVER trigger follow-up; must be SKIPPED and NEVER marked Suppressed. | `action = 'Skipped'`; `Followup_Status` left unchanged (NOT marked Suppressed). | **PASS** |
| **14** | **Follow-up Creation After Actual Send** | Row has `Outreach_Status = 'Sent (Test)'` and passed due date. | Follow-up engine detects due outreach; creates follow-up draft; updates `Followup_Status = 'Draft Created'`. | Created follow-up draft (`draft_mock_...`); updated `Followup_Status = 'Draft Created'`. | **PASS** |
| **15** | **Replied Lead Follow-up Suppression** | Row has `Reply_Status = 'Replied'`. | Follow-up is suppressed; no draft created; `Followup_Status = 'Suppressed'`. | Follow-up suppressed; status updated to `Suppressed`. | **PASS** |
| **16** | **Opted-Out Lead Follow-up Suppression** | Row has `Reply_Status = 'Opted Out'`. | Follow-up is suppressed; no draft created; `Followup_Status = 'Suppressed'`. | Follow-up suppressed; status updated to `Suppressed`. | **PASS** |
| **17** | **Duplicate Follow-up Prevention** | Row already has `Followup_Status = 'Draft Created'`. | Engine skips row to prevent generating duplicate follow-up drafts. | `action = 'Skipped'`; reason: `Follow-up already created: Draft Created`. | **PASS** |

---

## 3. Automated Test Runner Log

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
