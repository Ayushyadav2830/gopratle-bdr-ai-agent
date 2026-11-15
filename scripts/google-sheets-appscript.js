/**
 * GoPratle BDR Agent - Google Sheets Automation Apps Script
 * 
 * Install in Google Sheets:
 * 1. Open your Google Sheet (GoPratle_BDR_Lead_Database)
 * 2. Click Extensions > Apps Script
 * 3. Replace the code with this file
 * 4. Update N8N_WEBHOOK_URL with your n8n Production/Test Webhook URL
 * 5. Click Save and Add an "On Edit" or "On Form Submit" trigger
 */

const N8N_WEBHOOK_URL = "https://your-n8n-instance.app.n8n.cloud/webhook/gopratle-lead-intake";
const SHEET_NAME = "Leads";

function onEditTrigger(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const row = e.range.getRow();
  if (row <= 1) return; // Skip headers

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rowData = {};
  headers.forEach((header, idx) => {
    rowData[header] = rowValues[idx];
  });

  // Only trigger if Company_Name is provided and Research_Status is blank or Pending
  const company = (rowData["Company_Name"] || "").toString().trim();
  const status = (rowData["Research_Status"] || "").toString().trim();

  if (company && (!status || status.toLowerCase() === "pending")) {
    sheet.getRange(row, headers.indexOf("Research_Status") + 1).setValue("Processing");
    sheet.getRange(row, headers.indexOf("Updated_At") + 1).setValue(new Date().toISOString());

    sendToN8n(rowData, row);
  }
}

function sendToN8n(data, rowNumber) {
  const payload = {
    ...data,
    row_number: rowNumber,
    timestamp: new Date().toISOString()
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(N8N_WEBHOOK_URL, options);
  } catch (err) {
    Logger.log("Failed to send lead to n8n webhook: " + err.message);
  }
}

