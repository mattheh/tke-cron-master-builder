'use strict';

// Path to the directory where the Cron Configs
// are located
var cronConfigDir = __dirname + '/jobs';

// The Mongo Collection you want to store your
// Cron Logs in
var collection = 'CRON_LOGS';

var logCleanUpOpts = {
  frequency: '*/20 * * * * *', // run every 20 seconds
  retentionPeriod: '1 second'
};

// This runs the Cron Builder and sets up Logging to Mongo
require('../lib/buildCron')(cronConfigDir, collection, logCleanUpOpts);

// NOTE: In this scenario you should only see a max of 3 logs
// (2 ticks of exampleJob and 1 of the Log Clean Up Job) in
// the CRON_LOGS collection at a time
