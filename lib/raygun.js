'use strict';

const env = require('env-var');
const raygun = require('raygun');
const raygunClient = new raygun.Client().init({
  apiKey:  env('RAYGUN_API_KEY', 'key').asString()
});

module.exports = () => {
  return raygunClient;
};
