const { search } = require('../services/searchEngine');

module.exports = async (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({
            error: 'Se requiere parámetro q'
        });
    }

    try {
        const results = await search(query, { limit: 50 });

        res.json({
            success: true,
            ...results
        });

    } catch (err) {
        res.status(500).json({
            error: 'Error en búsqueda'
        });
    }
};