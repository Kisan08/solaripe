// Each exception must enforce its own signature, capability or scheduler secret.
export const publicApiPaths = new Set([
  '/api/demo-requests', '/api/public-design', '/api/satellite-image',
  '/api/call-webhook', '/api/call-response', '/api/call-twiml', '/api/call-stream-twiml',
  '/api/cron/send-reminders', '/api/cron/pipeline-staleness',
]);
