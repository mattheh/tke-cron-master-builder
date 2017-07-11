'use strict';

const env = require('env-var');
const raygun = require('raygun');

module.exports = new raygun.Client().init({
  apiKey:  env('RAYGUN_API_KEY', 'key').asString()
});
