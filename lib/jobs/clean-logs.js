'use strict';

var CronMasterJob = require('cron-master').CronMasterJob;

module.exports = new CronMasterJob({
  // Some meta data to assist the job/logging
  meta: {
    name: 'clean-logs'
  },
  // The usual params that you pass to the "cron" module go here
  cronParams: {
    cronTime: '* * 0 * * *',
    onTick: require('../../dao/bunyan-logs').cleanUpLogs
  }
});
