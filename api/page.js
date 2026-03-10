const { getPageByUrl, crawlSinglePage } = require('../services/crawler');

module.exports = async (req, res) => {

    const url = req.query.url;

    if (!url) {
        return res.status(400).json({
            error: 'Falta parámetro url'
        });
    }

    let page = getPageByUrl(url);

    // Si no está en memoria, la scrapeamos
    if (!page) {
        page = await crawlSinglePage(url);
    }

    if (!page) {
        return res.status(404).json({
            error: 'No se pudo obtener la página'
        });
    }

    res.json({
        success: true,
        page
    });

};