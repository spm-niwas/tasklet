/**
 * NIWAS Tasklet — Free Email Relay via Google Apps Script
 *
 * Setup:
 * 1. Go to https://script.google.com and create a new project.
 * 2. Paste this code into Code.gs and save.
 * 3. In Project Settings -> Script Properties, add:
 *      Property: APPS_SCRIPT_SECRET   Value: <any strong random secret>
 * 4. Click Deploy -> New deployment -> Web app:
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the Web App URL (ending in /exec) and add APPS_SCRIPT_URL and
 *    APPS_SCRIPT_SECRET in AI Studio Settings -> Secrets.
 */

function constantTimeEquals(a, b) {
  var strA = String(a || '');
  var strB = String(b || '');
  if (strA.length !== strB.length) return false;
  var diff = 0;
  for (var i = 0; i < strA.length; i++) {
    diff |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'Missing request body.' });
    }

    var data = JSON.parse(e.postData.contents);
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET') || '';

    if (!expectedSecret || !constantTimeEquals(data.secret, expectedSecret)) {
      return jsonResponse({ ok: false, error: 'Unauthorized request.' });
    }

    var to = String(data.to || '').trim();
    var subject = String(data.subject || '').trim();
    var htmlBody = String(data.htmlBody || '');
    var textBody = String(data.textBody || '');
    var senderName = String(data.senderName || 'NIWAS Tasklet').trim();

    if (!to || !subject || (!htmlBody && !textBody)) {
      return jsonResponse({ ok: false, error: 'Missing required email fields.' });
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: htmlBody || undefined,
      body: textBody || 'Please view this message in an HTML-capable email client.',
      name: senderName,
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
