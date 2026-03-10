const { getCrawlStatus } = require('../services/crawler');

module.exports = (req, res) => {
    const status = getCrawlStatus();

    res.json({
        success: true,
        crawler: status
    });
};