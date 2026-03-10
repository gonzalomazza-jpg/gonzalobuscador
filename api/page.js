const { getPageByUrl } = require('../services/crawler');

module.exports = (req, res) => {

    const url = req.query.url;

    if (!url) {
        return res.status(400).json({
            error: 'Falta parámetro url'
        });
    }

    const page = getPageByUrl(url);

    if (!page) {
        return res.status(404).json({
            error: 'Página no encontrada'
        });
    }

    res.json({
        success: true,
        page
    });

};