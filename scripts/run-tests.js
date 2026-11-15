/**
 * GoPratle BDR Agent - Comprehensive Automated Test Suite (17 Test Scenarios)
 * 
 * Verifies all 17 conditions specified in the production readiness prompt:
 * 1. Successful lead research using mocked API responses.
 * 2. Missing company name (Validation failure).
 * 3. Missing city (Validation failure).
 * 4. No reliable lead found (Graceful handling, marked Not Found).
 * 5. No public email found (Pitch saved, draft creation blocked).
 * 6. Weak evidence (Low confidence, flagged for review).
 * 7. Duplicate company and city (Case insensitivity & whitespace variations).
 * 8. Invalid Gemini JSON (Schema validation & repair retry loop).
 * 9. Tavily API failure (Fails cleanly without silent mock fallback).
 * 10. Gemini API failure (Fails cleanly without silent mock fallback).
 * 11. Google Sheets read/write failure (Captures API failure).
 * 12. Gmail draft creation failure (Status not marked Sent, error logged).
 * 13. Draft-only follow-up suppression (Draft-only leads are SKIPPED, not marked Suppressed).
 * 14. Follow-up after an actual send (Follow-up draft created for sent outreach).
 * 15. Replied lead suppression (Suppressed when Reply_Status = Replied).
 * 16. Opted-out lead suppression (Suppressed when Reply_Status = Opted Out).
 * 17. Duplicate follow-up prevention (Does not re-draft if already Draft Created).
 */

const assert = require('assert');
const {
  processLeadRow,
  processFollowupQueue,
  readGoogleSheetRows,
  updateGoogleSheetRow,
  createGmailDraft
} = require('./agent-runner');
const {
  validateInput,
  checkDuplicate,
  rankCandidateLeads,
  extractPublicBusinessEmail
} = require('./lead-parser');
const { calculateConfidenceScore } = require('./confidence-scorer');
const { validateAiPitchResponse } = require('./pitch-validator');

const testResults = [];

function recordTest(testNumber, testName, passed, details = '') {
  testResults.push({ testNumber, testName, passed, details });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${badge} [Test ${testNumber.toString().padStart(2, '0')}] ${testName}`);
  if (details) {
    console.log(`        └─ ${details}`);
  }
}

async function runSuite() {
  console.log('================================================================================');
  console.log('  GOPRATLE BDR AGENT: PRODUCTION ACCEPTANCE & VERIFICATION TEST SUITE');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // Standard Mock Clients for Testing
  // ---------------------------------------------------------------------------
  const mockTavilyClient = {
    search: async (query) => {
      const q = query.toLowerCase();
      if (q.includes('event') || q.includes('decision')) {
        return [
          {
            title: "Chaitanya Mathur - Global Head of Events & Live IPs - Zomato | LinkedIn",
            url: "https://www.linkedin.com/in/chaitanya-mathur",
            snippet: "Chaitanya Mathur leads Zomato Live, managing grand food carnivals, multi-city activations, festival production, artist booking and stage crew in Gurgaon and across India.",
            content: "Head of Zomato Live."
          }
        ];
      } else if (q.includes('email') || q.includes('contact')) {
        return [
          {
            title: "Contact Zomato - Corporate Partnerships",
            url: "https://www.zomato.com/contact",
            snippet: "For live event partnerships and vendor coordination, contact: live-partnerships@zomato.com",
            content: "live-partnerships@zomato.com"
          }
        ];
      }
      return [
        {
          title: "Zomaland by Zomato - India's Grandest Food & Music Carnival",
          url: "https://www.zomato.com/events/zomaland",
          snippet: "Zomaland food and music festival activations across Gurgaon and NCR.",
          content: "Experiential festivals."
        }
      ];
    }
  };

  const mockGeminiClient = {
    generateContent: async () => ({
      selected_lead_name: "Chaitanya Mathur",
      selected_job_title: "Global Head of Events & Live IPs",
      selection_reason: "Primary decision-maker for Zomato Live and festival production in Gurgaon.",
      email_subject: "Event Vendor & Production Support for Zomato Live in Gurgaon",
      pitch_line_1: "Hi Chaitanya, I came across your work leading festival production and live artist stages for Zomaland in Gurgaon.",
      pitch_line_2: "GoPratle connects event hosts with vetted planners, DJs and professional crews to make event coordination easier.",
      pitch_line_3: "Would you be open to a short conversation about whether our vetted vendor network could support your upcoming event schedule?",
      personalization_reason: "Referenced verified role in Zomato Live and experiential events in Gurgaon.",
      confidence: "High",
      missing_information: [],
      needs_human_review: false
    })
  };

  const mockGmailClient = {
    createDraft: async ({ to, subject, body }) => ({
      status: 'Draft Created',
      messageId: `draft_mock_${Date.now()}`,
      recipient: to,
      subject
    })
  };

  // ---------------------------------------------------------------------------
  // Test 1: Successful lead research using mocked API responses
  // ---------------------------------------------------------------------------
  try {
    const input = { Company_Name: 'Zomato', City: 'Gurgaon', Created_At: '2026-11-15T09:00:00Z' };
    const output = await processLeadRow(input, [], {
      tavilyClient: mockTavilyClient,
      geminiClient: mockGeminiClient,
      gmailClient: mockGmailClient
    });

    assert.strictEqual(output.Research_Status, 'Completed');
    assert.strictEqual(output.Lead_Name, 'Chaitanya Mathur');
    assert.strictEqual(output.Public_Email, 'live-partnerships@zomato.com');
    assert.strictEqual(output.Lead_Confidence, 'High');
    assert.strictEqual(output.Outreach_Status, 'Draft Created');
    assert.strictEqual(output.Followup_Status, 'Not Scheduled', 'Draft Created must not schedule follow-up');
    assert.ok(output.AI_Pitch.split('\n').length === 3, 'Pitch must have 3 lines');

    recordTest(1, 'Successful lead research using mocked API responses', true, `Lead: ${output.Lead_Name}, Draft: ${output.Outreach_Message_ID}`);
  } catch (err) {
    recordTest(1, 'Successful lead research using mocked API responses', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Missing company name
  // ---------------------------------------------------------------------------
  try {
    const input = { Company_Name: '', City: 'Gurgaon' };
    const output = await processLeadRow(input, []);
    assert.strictEqual(output.Research_Status, 'Failed');
    assert.ok(output.Error_Details.includes('Company_Name is required'));
    recordTest(2, 'Missing company name validation', true, output.Error_Details);
  } catch (err) {
    recordTest(2, 'Missing company name validation', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 3: Missing city
  // ---------------------------------------------------------------------------
  try {
    const input = { Company_Name: 'Blinkit', City: '   ' };
    const output = await processLeadRow(input, []);
    assert.strictEqual(output.Research_Status, 'Failed');
    assert.ok(output.Error_Details.includes('City is required'));
    recordTest(3, 'Missing city validation', true, output.Error_Details);
  } catch (err) {
    recordTest(3, 'Missing city validation', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 4: No reliable lead found
  // ---------------------------------------------------------------------------
  try {
    const emptyTavily = { search: async () => [] };
    const emptyGemini = {
      generateContent: async () => ({
        selected_lead_name: "Not Found",
        selected_job_title: "Not Found",
        selection_reason: "No decision maker found.",
        email_subject: "Event Support",
        pitch_line_1: "Hi there, I came across your company in NowhereCity.",
        pitch_line_2: "GoPratle connects event hosts with vetted planners, DJs and crews.",
        pitch_line_3: "Would you be open to a conversation?",
        confidence: "Low"
      })
    };
    const input = { Company_Name: 'EmptyCorp', City: 'NowhereCity' };
    const output = await processLeadRow(input, [], {
      tavilyClient: emptyTavily,
      geminiClient: emptyGemini,
      gmailClient: mockGmailClient
    });

    assert.strictEqual(output.Lead_Name, 'Not Found');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.strictEqual(output.Research_Status, 'Needs Review');
    assert.strictEqual(output.Followup_Status, 'Not Scheduled');
    recordTest(4, 'No reliable lead found handling', true, 'Correctly marked Not Found and Needs Review without drafting email');
  } catch (err) {
    recordTest(4, 'No reliable lead found handling', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 5: No public email found
  // ---------------------------------------------------------------------------
  try {
    const noEmailTavily = {
      search: async (q) => {
        if (q.includes('event')) {
          return [{
            title: "Rohit Kapoor - CEO - Swiggy | LinkedIn",
            url: "https://linkedin.com/in/rohitkapoor",
            snippet: "Rohit Kapoor is CEO at Swiggy in Bangalore."
          }];
        }
        return []; // No email results
      }
    };
    const noEmailGemini = {
      generateContent: async () => ({
        selected_lead_name: "Rohit Kapoor",
        selected_job_title: "CEO",
        selection_reason: "Swiggy executive in Bangalore",
        email_subject: "Event Support for Swiggy",
        pitch_line_1: "Hi Rohit, I saw Swiggy's experiential events in Bangalore.",
        pitch_line_2: "GoPratle connects event hosts with vetted planners, DJs and crews.",
        pitch_line_3: "Would you be open to discussing your upcoming event requirements?",
        confidence: "Medium"
      })
    };
    const input = { Company_Name: 'Swiggy', City: 'Bangalore' };
    const output = await processLeadRow(input, [], {
      tavilyClient: noEmailTavily,
      geminiClient: noEmailGemini,
      gmailClient: mockGmailClient
    });

    assert.strictEqual(output.Lead_Name, 'Rohit Kapoor');
    assert.strictEqual(output.Public_Email, 'Not Found');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.ok(output.AI_Pitch, 'Pitch should still be stored in sheet');
    recordTest(5, 'No public email found handling', true, 'Lead saved, pitch generated, draft blocked');
  } catch (err) {
    recordTest(5, 'No public email found handling', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 6: Weak evidence
  // ---------------------------------------------------------------------------
  try {
    const weakLead = {
      lead_name: 'John Doe',
      job_title: 'Former Intern',
      target_role: 'Other',
      public_email: 'Not Found',
      isFormer: true,
      city_verified: false
    };
    const score = calculateConfidenceScore(weakLead);
    assert.strictEqual(score.confidence, 'Low');
    assert.strictEqual(score.eligibleForDraft, false);
    recordTest(6, 'Weak evidence scoring', true, `Correctly evaluated to Low: ${score.reason}`);
  } catch (err) {
    recordTest(6, 'Weak evidence scoring', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 7: Duplicate company and city (Case insensitivity & whitespace)
  // ---------------------------------------------------------------------------
  try {
    const existingRows = [
      {
        Company_Name: 'Zomato',
        City: 'Gurgaon',
        Research_Status: 'Completed',
        Outreach_Status: 'Draft Created',
        Created_At: '2026-11-15T08:00:00Z'
      }
    ];

    // Input with different casing, whitespace, and punctuation
    const dupCheck1 = checkDuplicate('  zomato   ', 'GURGAON  ', existingRows);
    const dupCheck2 = checkDuplicate('Zomato, Ltd.', 'Gurgaon', existingRows);

    assert.strictEqual(dupCheck1.isDuplicate, true, 'Whitespace/case variation must be duplicate');
    assert.strictEqual(dupCheck2.isDuplicate, true, 'Punctuation variation must be duplicate');

    const output = await processLeadRow({ Company_Name: '  zomato   ', City: 'gurgaon ' }, existingRows);
    assert.strictEqual(output.Research_Status, 'Duplicate');
    assert.ok(output.Error_Details.includes('already exists'));

    recordTest(7, 'Duplicate company and city detection', true, output.Error_Details);
  } catch (err) {
    recordTest(7, 'Duplicate company and city detection', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 8: Invalid Gemini JSON
  // ---------------------------------------------------------------------------
  try {
    const invalidText = 'Here is your pitch:\nLine 1: Hi there\nLine 2: We help with events';
    const validation = validateAiPitchResponse(invalidText);
    assert.strictEqual(validation.isValid, false);
    assert.ok(validation.repairInstruction.includes('regenerate strictly valid JSON'));

    // Test with missing third line
    const twoLinesOnly = JSON.stringify({
      selected_lead_name: "Alex",
      selected_job_title: "Manager",
      email_subject: "Events",
      pitch_line_1: "Line 1",
      pitch_line_2: "Line 2",
      pitch_line_3: "",
      confidence: "High"
    });
    const twoLineValidation = validateAiPitchResponse(twoLinesOnly);
    assert.strictEqual(twoLineValidation.isValid, false);
    assert.ok(twoLineValidation.errors.some(e => e.includes('pitch_line_3')));

    recordTest(8, 'Invalid Gemini JSON validation & repair instruction', true, 'Caught malformed JSON and incomplete 3-line schema');
  } catch (err) {
    recordTest(8, 'Invalid Gemini JSON validation & repair instruction', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 9: Tavily API failure (Fails cleanly without silent mock fallback)
  // ---------------------------------------------------------------------------
  try {
    const failingTavily = {
      search: async () => {
        throw new Error('Tavily API failed with status 401: Unauthorized API Key');
      }
    };
    const input = { Company_Name: 'TestCo', City: 'Delhi' };
    const output = await processLeadRow(input, [], {
      tavilyClient: failingTavily,
      geminiClient: mockGeminiClient,
      gmailClient: mockGmailClient
    });

    assert.strictEqual(output.Research_Status, 'Failed');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.ok(output.Error_Details.includes('Web research failed: Tavily API failed with status 401'));

    recordTest(9, 'Tavily API failure handling (No silent fallback)', true, output.Error_Details);
  } catch (err) {
    recordTest(9, 'Tavily API failure handling (No silent fallback)', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 10: Gemini API failure (Fails cleanly without silent mock fallback)
  // ---------------------------------------------------------------------------
  try {
    const failingGemini = {
      generateContent: async () => {
        throw new Error('Gemini API call failed with status 503: Service Unavailable');
      }
    };
    const input = { Company_Name: 'TestCo', City: 'Delhi' };
    const output = await processLeadRow(input, [], {
      tavilyClient: mockTavilyClient,
      geminiClient: failingGemini,
      gmailClient: mockGmailClient
    });

    assert.strictEqual(output.Research_Status, 'Needs Review');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.ok(output.Error_Details.includes('Gemini pitch generation failed: Gemini API call failed with status 503'));

    recordTest(10, 'Gemini API failure handling (No silent fallback)', true, output.Error_Details);
  } catch (err) {
    recordTest(10, 'Gemini API failure handling (No silent fallback)', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 11: Google Sheets read/write failure
  // ---------------------------------------------------------------------------
  try {
    const failingSheetsClient = {
      getValues: async () => {
        throw new Error('Google Sheets API read failed (403): The caller does not have permission');
      },
      updateRow: async () => {
        throw new Error('Google Sheets API update failed (403): The caller does not have permission');
      }
    };

    let readFailed = false;
    try {
      await readGoogleSheetRows({ sheetId: 'bad_id', accessToken: 'bad_token' }, failingSheetsClient);
    } catch (e) {
      readFailed = e.message.includes('permission');
    }

    let updateFailed = false;
    try {
      await updateGoogleSheetRow({ sheetId: 'bad_id', rowNumber: 2, rowData: [], accessToken: 'bad_token' }, failingSheetsClient);
    } catch (e) {
      updateFailed = e.message.includes('permission');
    }

    assert.ok(readFailed && updateFailed);
    recordTest(11, 'Google Sheets read/write failure handling', true, 'Handled 403 API permission errors cleanly');
  } catch (err) {
    recordTest(11, 'Google Sheets read/write failure handling', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 12: Gmail draft creation failure
  // ---------------------------------------------------------------------------
  try {
    const failingGmailClient = {
      createDraft: async () => {
        throw new Error('Gmail API draft creation failed (401): Invalid OAuth Credentials');
      }
    };
    const input = { Company_Name: 'Zomato', City: 'Gurgaon' };
    const output = await processLeadRow(input, [], {
      tavilyClient: mockTavilyClient,
      geminiClient: mockGeminiClient,
      gmailClient: failingGmailClient
    });

    assert.strictEqual(output.Outreach_Status, 'Failed');
    assert.strictEqual(output.Outreach_Message_ID, '');
    assert.ok(output.Error_Details.includes('Gmail draft creation failed'));

    recordTest(12, 'Gmail draft creation failure handling', true, 'Not marked as Sent, error logged cleanly');
  } catch (err) {
    recordTest(12, 'Gmail draft creation failure handling', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 13: Draft-only follow-up suppression (Never mark as Suppressed)
  // ---------------------------------------------------------------------------
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const draftOnlyRows = [
      {
        Company_Name: 'Zomato',
        Lead_Name: 'Chaitanya Mathur',
        Public_Email: 'chaitanya@zomato.com',
        Outreach_Status: 'Draft Created', // ONLY DRAFTED, NOT SENT!
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'Unknown'
      }
    ];

    const results = await processFollowupQueue(draftOnlyRows, { gmailClient: mockGmailClient });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].action, 'Skipped');
    assert.strictEqual(draftOnlyRows[0].Followup_Status, 'Pending', 'Must not be changed to Suppressed');

    recordTest(13, 'Draft-only follow-up handling (Skipped, NOT suppressed)', true, results[0].reason);
  } catch (err) {
    recordTest(13, 'Draft-only follow-up handling (Skipped, NOT suppressed)', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 14: Follow-up after an actual send
  // ---------------------------------------------------------------------------
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const sentRows = [
      {
        Company_Name: 'Urban Company',
        Lead_Name: 'Abhiraj Bhal',
        Public_Email: 'abhiraj@urbancompany.com',
        Email_Subject: 'Event Vendor Network for Urban Company',
        Outreach_Status: 'Sent (Test)', // ACTUALLY SENT
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'No Reply'
      }
    ];

    const results = await processFollowupQueue(sentRows, { gmailClient: mockGmailClient });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].action, 'Draft Created');
    assert.strictEqual(sentRows[0].Followup_Status, 'Draft Created');
    assert.ok(results[0].messageId);

    recordTest(14, 'Follow-up creation after actual send', true, `Created draft ${results[0].messageId} for ${sentRows[0].Company_Name}`);
  } catch (err) {
    recordTest(14, 'Follow-up creation after actual send', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 15: Replied lead suppression
  // ---------------------------------------------------------------------------
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const repliedRows = [
      {
        Company_Name: 'EventCo',
        Lead_Name: 'Samantha Ray',
        Public_Email: 'samantha@eventco.com',
        Outreach_Status: 'Sent',
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'Replied' // Prospect replied
      }
    ];

    const results = await processFollowupQueue(repliedRows, { gmailClient: mockGmailClient });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].action, 'Suppressed');
    assert.strictEqual(repliedRows[0].Followup_Status, 'Suppressed');

    recordTest(15, 'Replied lead follow-up suppression', true, results[0].reason);
  } catch (err) {
    recordTest(15, 'Replied lead follow-up suppression', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 16: Opted-out lead suppression
  // ---------------------------------------------------------------------------
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const optedOutRows = [
      {
        Company_Name: 'FestivalX',
        Lead_Name: 'Marcus Vance',
        Public_Email: 'marcus@festivalx.com',
        Outreach_Status: 'Sent',
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'Opted Out' // Prospect opted out
      }
    ];

    const results = await processFollowupQueue(optedOutRows, { gmailClient: mockGmailClient });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].action, 'Suppressed');
    assert.strictEqual(optedOutRows[0].Followup_Status, 'Suppressed');

    recordTest(16, 'Opted-out lead follow-up suppression', true, results[0].reason);
  } catch (err) {
    recordTest(16, 'Opted-out lead follow-up suppression', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 17: Duplicate follow-up prevention
  // ---------------------------------------------------------------------------
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const alreadyDraftedRows = [
      {
        Company_Name: 'Urban Company',
        Lead_Name: 'Abhiraj Bhal',
        Public_Email: 'abhiraj@urbancompany.com',
        Outreach_Status: 'Sent (Test)',
        Followup_Status: 'Draft Created', // Follow-up ALREADY drafted
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'No Reply'
      }
    ];

    const results = await processFollowupQueue(alreadyDraftedRows, { gmailClient: mockGmailClient });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].action, 'Skipped');
    assert.ok(results[0].reason.includes('already in state: Draft Created'));

    recordTest(17, 'Duplicate follow-up prevention', true, results[0].reason);
  } catch (err) {
    recordTest(17, 'Duplicate follow-up prevention', false, err.message);
  }

  console.log('\n================================================================================');
  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = total - passed;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runSuite();
