const { app } = require('@azure/functions');

require('./functions/data');
require('./functions/health');

module.exports = app;
