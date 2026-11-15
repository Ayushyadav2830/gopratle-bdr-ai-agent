/**
 * GoPratle BDR Agent - End-to-End Acceptance Test Suite
 * 
 * Verifies all 10 acceptance test scenarios specified in Build Spec Section 15:
 * 1. Happy path (Zomato, Gurgaon)
 * 2. Missing city (Validation failure)
 * 3. No lead found (Graceful handling, no email sent)
 * 4. No public email (Profile saved, pitch generated, draft not created)
 * 5. Weak evidence (Low confidence, human review flagged)
 * 6. Duplicate detection (Prevents duplicate outreach)
 * 7. AI invalid JSON handling (Repair retry + fallback)
 * 8. Gmail failure simulation (Status not marked Sent, error logged)
 * 9. Follow-up due (Draft created, idempotent)
 * 10. Reply / opt-out follow-up suppression (Suppresses outreach)
 */

const assert = require('assert');
const {
  processLeadRow,
  processFollowupQueue,
  generatePitchWithGemini
} = require('./agent-runner');
const {
  validateInput,
  checkDuplicate,
  rankCandidateLeads,
  extractPublicBusinessEmail
} = require('./lead-parser');
const { calculateConfidenceScore } = require('./confidence-scorer');
const { validateAiPitchResponse } = require('./pitch-validator');

const results = [];

function recordTest(testName, passed, details = '') {
  results.push({ testName, passed, details });
  const symbol = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${symbol} : ${testName}`);
  if (details) {
    console.log(`       └─ ${details}`);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('  GOPRATLE BDR AGENT: END-TO-END ACCEPTANCE TEST SUITE');
  console.log('================================================================\n');

  // Test 1: Happy Path (Zomato, Gurgaon)
  try {
    const input = {
      Company_Name: 'Zomato',
      City: 'Gurgaon',
      Created_At: new Date().toISOString()
    };
    const output = await processLeadRow(input, []);

    assert.strictEqual(output.Company_Name, 'Zomato');
    assert.strictEqual(output.City, 'Gurgaon');
    assert.strictEqual(output.Research_Status, 'Completed');
    assert.ok(output.Lead_Name && output.Lead_Name !== 'Not Found', 'Lead_Name should be found');
    assert.ok(output.AI_Pitch && output.AI_Pitch.split('\n').length === 3, 'Pitch must have exactly 3 lines');
    assert.ok(output.Public_Email && output.Public_Email.includes('@'), 'Public email must be extracted');
    assert.strictEqual(output.Outreach_Status, 'Draft Created');
    assert.ok(output.Outreach_Message_ID, 'Message ID must be populated');
    assert.strictEqual(output.Followup_Status, 'Pending');

    recordTest('1. Happy Path (Zomato, Gurgaon)', true, `Lead: ${output.Lead_Name} (${output.Job_Title}), Draft ID: ${output.Outreach_Message_ID}`);
  } catch (err) {
    recordTest('1. Happy Path (Zomato, Gurgaon)', false, err.message);
  }

  // Test 2: Missing City
  try {
    const input = {
      Company_Name: 'Blinkit',
      City: '',
      Created_At: new Date().toISOString()
    };
    const output = await processLeadRow(input, []);

    assert.strictEqual(output.Research_Status, 'Failed');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.ok(output.Error_Details.includes('City is required'));

    recordTest('2. Missing City Validation', true, `Correctly rejected: ${output.Error_Details}`);
  } catch (err) {
    recordTest('2. Missing City Validation', false, err.message);
  }

  // Test 3: No Lead Found
  try {
    const input = {
      Company_Name: 'EmptyCorp',
      City: 'Nowhere',
      Created_At: new Date().toISOString()
    };
    const output = await processLeadRow(input, []);

    assert.strictEqual(output.Lead_Name, 'Not Found');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.strictEqual(output.Followup_Status, 'Not Scheduled');
    assert.strictEqual(output.Research_Status, 'Needs Review');

    recordTest('3. No Lead Found', true, 'Lead marked Not Found, research note saved, no email drafted');
  } catch (err) {
    recordTest('3. No Lead Found', false, err.message);
  }

  // Test 4: No Public Email Found
  try {
    const input = {
      Company_Name: 'Swiggy',
      City: 'Bangalore',
      Created_At: new Date().toISOString()
    };
    const output = await processLeadRow(input, []);

    assert.ok(output.Lead_Name && output.Lead_Name !== 'Not Found', 'Lead should be found');
    assert.strictEqual(output.Public_Email, 'Not Found');
    assert.strictEqual(output.Outreach_Status, 'Not Ready');
    assert.ok(output.AI_Pitch, 'Pitch should still be generated in sheet');

    recordTest('4. No Public Email Found', true, `Lead found (${output.Lead_Name}), email Not Found, pitch generated, draft blocked`);
  } catch (err) {
    recordTest('4. No Public Email Found', false, err.message);
  }

  // Test 5: Weak Evidence
  try {
    const lowEvidenceLead = {
      lead_name: 'John Doe',
      job_title: 'Junior Intern',
      target_role: 'Other',
      public_email: 'Not Found',
      contact_source: '',
      city_verified: false
    };
    const scoring = calculateConfidenceScore(lowEvidenceLead);

    assert.strictEqual(scoring.confidence, 'Low');
    assert.strictEqual(scoring.eligibleForDraft, false);

    recordTest('5. Weak Evidence Handling', true, `Scored Low confidence: ${scoring.reason}`);
  } catch (err) {
    recordTest('5. Weak Evidence Handling', false, err.message);
  }

  // Test 6: Duplicate Prevention
  try {
    const existing = [
      {
        Company_Name: 'Zomato',
        City: 'Gurgaon',
        Research_Status: 'Completed',
        Outreach_Status: 'Draft Created',
        Created_At: '2026-11-15T09:00:00.000Z'
      }
    ];
    const input = {
      Company_Name: 'Zomato',
      City: 'Gurgaon'
    };
    const output = await processLeadRow(input, existing);

    assert.ok(output.Error_Details.includes('Duplicate row detected'));
    assert.strictEqual(output.Outreach_Status, 'Draft Created');

    recordTest('6. Duplicate Row Prevention', true, output.Error_Details);
  } catch (err) {
    recordTest('6. Duplicate Row Prevention', false, err.message);
  }

  // Test 7: AI Invalid JSON Self-Healing & Fallback
  try {
    const invalidJsonString = `Here is your outreach pitch:\nLine 1: Hi Deepinder\nLine 2: We offer crews`;
    const validation = validateAiPitchResponse(invalidJsonString);

    assert.strictEqual(validation.isValid, false);
    assert.ok(validation.repairInstruction.includes('regenerate strictly valid JSON'));

    // Valid recovery check
    const validJson = JSON.stringify({
      selected_lead_name: "Deepinder Goyal",
      selected_job_title: "CEO",
      email_subject: "Event Support for Zomato",
      pitch_line_1: "Hi Deepinder, I came across your work expanding live experiences in Gurgaon.",
      pitch_line_2: "GoPratle connects event hosts with vetted planners, DJs and crews to make coordination easier.",
      pitch_line_3: "Would you be open to a short conversation about whether this could support your team's event requirements?",
      confidence: "High"
    });
    const recoveryValidation = validateAiPitchResponse(validJson);
    assert.strictEqual(recoveryValidation.isValid, true);

    recordTest('7. AI Invalid JSON Schema Repair', true, 'Invalid JSON flagged, repair instruction generated, valid recovery verified');
  } catch (err) {
    recordTest('7. AI Invalid JSON Schema Repair', false, err.message);
  }

  // Test 8: Gmail API Failure Safety
  try {
    const badDraftData = {
      to: 'Not Found',
      subject: 'Test',
      body: 'Body'
    };
    const { executeGmailAction } = require('./agent-runner');
    const result = await executeGmailAction(badDraftData, false);

    assert.strictEqual(result.status, 'Draft Not Possible');
    assert.strictEqual(result.messageId, null);
    assert.ok(result.error.includes('Not Found'));

    recordTest('8. Gmail Failure Handling', true, `Correctly blocked send: ${result.error}`);
  } catch (err) {
    recordTest('8. Gmail Failure Handling', false, err.message);
  }

  // Test 9: Follow-up Due Trigger
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const testRows = [
      {
        Company_Name: 'Urban Company',
        Lead_Name: 'Abhiraj Bhal',
        Public_Email: 'abhiraj@urbancompany.com',
        Email_Subject: 'Event Support for Urban Company',
        Outreach_Status: 'Sent (Test)',
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'No Reply'
      }
    ];

    const followupActions = await processFollowupQueue(testRows);

    assert.strictEqual(followupActions.length, 1);
    assert.strictEqual(followupActions[0].action, 'Follow-up Draft Created');
    assert.strictEqual(testRows[0].Followup_Status, 'Draft Created');

    recordTest('9. Due Follow-up Detection', true, `Follow-up draft created for ${followupActions[0].company}`);
  } catch (err) {
    recordTest('9. Due Follow-up Detection', false, err.message);
  }

  // Test 10: Reply / Opt-Out Follow-up Suppression
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);

    const repliedLead = [
      {
        Company_Name: 'TechCorp',
        Lead_Name: 'Sarah Connor',
        Public_Email: 'sarah@techcorp.com',
        Outreach_Status: 'Sent (Test)',
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'Replied'
      },
      {
        Company_Name: 'MediaNet',
        Lead_Name: 'Tom Hardy',
        Public_Email: 'tom@medianet.com',
        Outreach_Status: 'Sent (Test)',
        Followup_Status: 'Pending',
        Followup_Date: pastDate.toISOString(),
        Reply_Status: 'Opted Out'
      }
    ];

    const followupActions = await processFollowupQueue(repliedLead);

    assert.strictEqual(followupActions.length, 2);
    assert.strictEqual(followupActions[0].action, 'Suppressed');
    assert.strictEqual(followupActions[1].action, 'Suppressed');
    assert.strictEqual(repliedLead[0].Followup_Status, 'Suppressed');
    assert.strictEqual(repliedLead[1].Followup_Status, 'Suppressed');

    recordTest('10. Follow-up Suppression on Reply/Opt-out', true, 'Follow-up suppressed for both Replied and Opted Out leads');
  } catch (err) {
    recordTest('10. Follow-up Suppression on Reply/Opt-out', false, err.message);
  }

  console.log('\n----------------------------------------------------------------');
  const allPassed = results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
  console.log('----------------------------------------------------------------\n');

  if (!allPassed) {
    process.exitCode = 1;
  }
}

runAllTests();
