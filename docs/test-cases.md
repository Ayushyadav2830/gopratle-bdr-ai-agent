# GoPratle BDR Agent - Acceptance Test Cases & Results

This document verifies the 10 end-to-end acceptance test conditions specified in Section 15 of the GoPratle BDR Build Specification.

---

## Acceptance Test Matrix

| # | Test Scenario | Input / Precondition | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Happy Path** | `Company_Name`: Zomato<br>`City`: Gurgaon | Web research discovers company context & relevant lead; Gemini generates 3-line pitch; Gmail draft created; follow-up scheduled +2 days. | Lead found (Chaitanya Mathur, Global Head of Events), valid 3-line pitch generated, public email found, draft created with ID, follow-up pending. | **PASS** |
| **2** | **Missing City** | `Company_Name`: Blinkit<br>`City`: *(blank)* | Input validation fails; research and outreach halted; row marked Failed with `Error_Details: City is required`. | Validation failed immediately; no API calls wasted; row marked `Research_Status = Failed`. | **PASS** |
| **3** | **No Lead Found** | `Company_Name`: EmptyCorp<br>`City`: Nowhere | Web research yields no decision-makers; `Lead_Name = Not Found`; pitch reflects generic company context; draft blocked; marked `Needs Review`. | Correctly set `Lead_Name = Not Found`; no email drafted; marked `Needs Review`. | **PASS** |
| **4** | **No Public Email** | `Company_Name`: Swiggy<br>`City`: Bangalore | Decision-maker found (Rohit Kapoor); public email unverified (`Not Found`); pitch stored in sheet; draft creation blocked. | Profile and pitch saved; `Public_Email = Not Found`; `Outreach_Status = Not Ready`; no draft sent. | **PASS** |
| **5** | **Weak Evidence** | Candidate with ambiguous title, no verified source URL or city tie. | Confidence scored `Low`; human review required; outreach blocked. | `calculateConfidenceScore` evaluated to `Low`; flagged for human review. | **PASS** |
| **6** | **Duplicate Check** | Same `Company_Name` + `City` already in database with status `Completed`. | Duplicate detected; existing record preserved; duplicate processing and duplicate outreach skipped. | Skipped with message `Duplicate row detected. Already recorded on ...`. | **PASS** |
| **7** | **AI Invalid JSON** | Model returns malformed JSON or invalid pitch line count. | Schema validator detects issue; automated repair prompt generated; recovers valid schema or flags `Needs Review`. | Validator caught syntax error, formulated repair payload, and verified recovery. | **PASS** |
| **8** | **Gmail Failure** | Attempting to create draft with invalid recipient or API error. | System handles error safely; status remains `Not Ready`/`Draft Not Possible`; never incorrectly marked `Sent`. | Safely captured error; status returned `Draft Not Possible`; zero false `Sent` statuses. | **PASS** |
| **9** | **Due Follow-up** | Row has `Followup_Status = Pending`, `Followup_Date <= now`, and initial outreach was `Sent (Test)`. | Follow-up workflow detects due date; creates follow-up draft; updates `Followup_Status = Draft Created`. | Follow-up draft created for Urban Company; status updated to `Draft Created`. | **PASS** |
| **10** | **Reply / Opt-Out** | Row has `Reply_Status = Replied` or `Opted Out`. | Follow-up suppressed; no follow-up draft created; row marked `Followup_Status = Suppressed`. | Follow-up suppressed for both replied and opted-out leads. | **PASS** |

---

## Test Execution Output

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
