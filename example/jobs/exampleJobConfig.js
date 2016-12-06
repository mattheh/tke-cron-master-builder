'use strict';

var log = require('tke-logger').getLogger(__filename);

// Dummy cron Job. Will usually
// be tied to a require('./jobFile.js');
var exampleJob = {
  run: function(done) {
    log.info('Example Cron Job Run!');
    return done(null);
  }
};

var CronMasterJob = require('cron-master').CronMasterJob;

// Cron Configuration
module.exports = new CronMasterJob({
  // Some meta data to assist the job/logging
  meta: {
    name: __filename
  },
  // The usual params that you pass to the "cron" module go here
  cronParams: {
    cronTime: '*/5 * * * * *', // run every 5 seconds

    onTick: function (job, done) {
      exampleJob.run(done);
    }
  }
});
