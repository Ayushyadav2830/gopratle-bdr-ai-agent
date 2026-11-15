/**
 * GoPratle BDR Agent - Pitch Validator & Email Formatter
 * 
 * Validates Gemini AI JSON schema, guarantees exactly three non-empty lines,
 * generates repair payloads, and formats the outreach draft.
 */

function validateAiPitchResponse(rawResponse) {
  let parsed = null;
  const errors = [];

  // 1. Check JSON parseability
  try {
    if (typeof rawResponse === 'object' && rawResponse !== null) {
      parsed = rawResponse;
    } else if (typeof rawResponse === 'string') {
      // Strip markdown code fences if present
      let clean = rawResponse.trim();
      if (clean.startsWith('```json')) {
        clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (clean.startsWith('```')) {
        clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(clean);
    } else {
      errors.push('Response is neither a JSON object nor a valid string');
    }
  } catch (err) {
    errors.push(`JSON parsing error: ${err.message}`);
    return {
      isValid: false,
      parsed: null,
      errors,
      repairInstruction: getRepairInstruction(errors)
    };
  }

  // 2. Validate required schema fields
  const requiredFields = [
    'selected_lead_name',
    'selected_job_title',
    'email_subject',
    'pitch_line_1',
    'pitch_line_2',
    'pitch_line_3',
    'confidence'
  ];

  for (const field of requiredFields) {
    if (!parsed || parsed[field] === undefined || parsed[field] === null) {
      errors.push(`Missing required field: '${field}'`);
    }
  }

  // 3. Validate exactly three non-empty pitch lines
  if (parsed) {
    const l1 = (parsed.pitch_line_1 || '').trim();
    const l2 = (parsed.pitch_line_2 || '').trim();
    const l3 = (parsed.pitch_line_3 || '').trim();

    if (!l1) errors.push('pitch_line_1 must be a non-empty string');
    if (!l2) errors.push('pitch_line_2 must be a non-empty string');
    if (!l3) errors.push('pitch_line_3 must be a non-empty string');

    // 4. Validate confidence value
    const allowedConfidence = ['High', 'Medium', 'Low'];
    if (!allowedConfidence.includes(parsed.confidence)) {
      errors.push(`confidence must be one of: ${allowedConfidence.join(', ')} (got '${parsed.confidence}')`);
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    parsed,
    errors,
    repairInstruction: isValid ? null : getRepairInstruction(errors)
  };
}

function getRepairInstruction(errors) {
  return `The previous response was invalid due to: ${errors.join(', ')}. ` +
    `Please regenerate strictly valid JSON without Markdown formatting, ensuring ` +
    `'pitch_line_1', 'pitch_line_2', and 'pitch_line_3' are all non-empty strings, and ` +
    `'confidence' is strictly 'High', 'Medium', or 'Low'.`;
}

/**
 * Combines three pitch lines into the required database format
 */
function formatPitchForDatabase(parsed) {
  if (!parsed) return '';
  return `${parsed.pitch_line_1}\n${parsed.pitch_line_2}\n${parsed.pitch_line_3}`;
}

/**
 * Formats full email text according to Build Spec Section 10
 */
function formatEmailDraft(leadName, emailSubject, pitchLines) {
  const name = leadName && leadName !== 'Not Found' ? leadName : 'there';
  let lines = '';

  if (Array.isArray(pitchLines)) {
    lines = pitchLines.filter(Boolean).join('\n');
  } else if (typeof pitchLines === 'object' && pitchLines !== null) {
    lines = `${pitchLines.pitch_line_1}\n${pitchLines.pitch_line_2}\n${pitchLines.pitch_line_3}`;
  } else if (typeof pitchLines === 'string') {
    lines = pitchLines;
  }

  return {
    subject: emailSubject,
    body: `Hi ${name},\n\n${lines}\n\nBest,\nGoPratle Team`
  };
}

module.exports = {
  validateAiPitchResponse,
  getRepairInstruction,
  formatPitchForDatabase,
  formatEmailDraft
};

