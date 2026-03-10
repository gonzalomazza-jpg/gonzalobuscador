/**
 * Vercel Serverless Entry Point
 * Re-exports the Express app for Vercel's serverless runtime.
 */

const app = require('../server');

module.exports = app;
