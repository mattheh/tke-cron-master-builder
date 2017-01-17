'use strict';

var log = require('tke-logger').getLogger(__filename);
var CronMasterJob = require('cron-master').CronMasterJob;

// Cron Configuration
module.exports = new CronMasterJob({
  // Some meta data to assist the job/logging
  meta: {
    name: __filename
  },
  // The usual params that you pass to the "cron" module go here
  cronParams: {
    cronTime: '*/10 * * * * *', // run every 10 seconds

    // Dummy cron Job. Will usually
    // be tied to a require('./jobFile.js');
    onTick: function (job, done) {
      log.info('Example Cron Job Run!');
      setTimeout(function() {
        return done(null);
      }, 5000); // Takes 5 seconds to run
    }
  }
});
