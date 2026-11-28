const alertService = require('../services/alertService');

// GET /api/alerts -> 200 with the new low-stock alerts (managers only),
// or 503 if the SQS queue cannot be read (for example Floci is not running)
async function listAlerts(req, res) {
  try {
    const alerts = await alertService.readAlerts();
    res.status(200).json(alerts);
  } catch (error) {
    console.warn(`Reading alerts failed: ${error.message}`);
    res.status(503).json({
      error: { code: 'ALERTS_UNAVAILABLE', message: 'The alert queue cannot be read right now.' }
    });
  }
}

module.exports = { listAlerts };
