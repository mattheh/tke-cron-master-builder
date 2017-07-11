'use strict';

const env = require('env-var');

module.exports = require('rhmap-raygun-nodejs')({
  apiKey:  env('RAYGUN_API_KEY', 'key').asString()
});
