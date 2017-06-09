'use srtict';

const getLogger = require('tke-logger').getLogger;
const pkg = require('../package.json');

module.exports = (name) => {
  return getLogger(name ? `${pkg.name}-${name}` : pkg.name);
};
