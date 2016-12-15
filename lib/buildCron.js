'use strict';

var cmaster = require('cron-master');
var later = require('later');
var log = require('tke-logger').getLogger(__filename);
var VError = require('verror');
var timestring = require('timestring');
var moment = require('moment');


/**
 * intialize cron job events such as start, complete, time warning and overlapping, etc
 * @param {object} job - cron-master CronMasterJob instance
 * @param {object} db - Promisified Mongo Connection Generator
 */
function initialiseJob(job, db) {
  log.info('Initialise Job: %s', job.meta.name);

  job.on(cmaster.EVENTS.TICK_STARTED, function (err, result, time) {
    if (err) {
      log.error(err, 'Error running the cronJob on TICK_STARTED:', job.meta.name, time);
    }

    log.info('Job tick starting!');
    // get the next run time
    var nextSchedule = later.parse.cron(job._opts.cronParams.cronTime);
    nextSchedule = later.schedule(nextSchedule).next(2);
    nextSchedule = nextSchedule[nextSchedule.length - 1];


    var data = {
      name: job.meta.name,
      startTime: new Date(),
      finishTime: null,
      executionDuration: null,
      lastStatus: 'In Process',
      error: err,
      nextSchedule: nextSchedule
    };

    return db.then(function(coll) {
      return coll.insert(data);
    })
    .then(function(res) {
      // Storing the mongo in job's meta data
      // for doc update on complete
      job.meta.id = res.ops[0]._id;
      log.info('job meta', job.meta);
      return;
    });
  });

  job.on(cmaster.EVENTS.TICK_COMPLETE, function (err, result, time) {
    if (err) {
      log.error(err, 'Error running the cronJob on TICK_COMPLETE:', job.meta.name, time);
    }

    log.info('%s completed a tick in %dms', job.meta.name, time);

    var finishTime = new Date();

    var data = {
      finishTime: finishTime,
      lastStatus: err ? 'Failed' : 'Success',
      executionDuration: time,
      error: err
    };

    return db.then(function(coll) {
      return coll.update({_id: job.meta.id}, {$set: data});
    });
  });

  job.on(cmaster.EVENTS.TIME_WARNING, function () {
    log.warn('%s is taking longer than expected', job.meta.name);
  });

  job.on(cmaster.EVENTS.OVERLAPPING_CALL, function () {
    log.warn('%s received a tick/call before the previous tick completed' +
    ' this tick has been ignored and will not run until the first tick ' +
    'has finished.', job.meta.name);
  });
}

/**
 * Grabs the Cron Job config files in the specified directory (cronConfigsDir), initiates and
 * starts them
 * @param {String} cronConfigsDir - complete path to config files for cron-master Cron Jobs
 * @param {String} collection - Name of Collection to store Cron Logs in
 * @param {object} logCleanUpOpts - Options for Cleaning Up Cron Job Logs
 */
module.exports = function(cronConfigsDir, collection, logCleanUpOpts) {

  if (!cronConfigsDir || !collection) {
    throw new VError('Error: \'cronConfigsDir\' and \'collection\' are required params.');
  }

  var db = require('rhmap-mongodb').collection(collection);

  // Loads up jobs in the jobs folder
  cmaster.loadJobs(cronConfigsDir, function (err, jobs) {
    if (err) {
      // Something went wrong when loading jobs
      throw new VError(err, 'Failed to Load Cron Jobs');
    } else if (jobs.length === 0) {
      // If no files were found
      throw new VError('Error: No jobs found in directoy: %s', cronConfigsDir);
    } else {
      log.info('Initialising Cron jobs in directory: %s', cronConfigsDir);

      var logCleanUpJob = createLogCleanUpJob(logCleanUpOpts, db);

      jobs.push(logCleanUpJob);

      // Bind job events etc.
      jobs.forEach(function(job) {
        initialiseJob(job, db);
      });

      // Start the cron timers
      cmaster.startJobs();
    }
  });

};


/**
 * Config for Cron Job that Cleans Up the other Cron Job Logs
 * @param {object} db - Promisified Mongo Connection Generator
 * @param {object} logCleanUpOpts - Options for Cleaning Up Cron Job Logs
 * @param {String} logCleanUpOpts.frequency - Frequency of clean up Cron
 * @param {String} logCleanUpOpts.retentionPeriod - Human readable retention period for Logs
 */
function createLogCleanUpJob(logCleanUpOpts, db) {

  // Validate logCleanUpOpts is set
  if (!logCleanUpOpts) {
    // If not, set to default
    logCleanUpOpts = {
      frequency: '* * 0 * * *', // Runs every night at midnight
      retentionPeriod: '7 days'
    };
  } else {
    // Also check each needed opt
    logCleanUpOpts.frequency = logCleanUpOpts.frequency || '* * 0 * * *';
    logCleanUpOpts.retentionPeriod = logCleanUpOpts.retentionPeriod || '7 days';
  }

  var logRetentionPeriod = timestring(logCleanUpOpts.retentionPeriod);

  var CronMasterJob = cmaster.CronMasterJob;

  // Cron Configuration
  return new CronMasterJob({
    // Some meta data to assist the job/logging
    meta: {
      name: __filename
    },
    // The usual params that you pass to the "cron" module go here
    cronParams: {
      cronTime: logCleanUpOpts.frequency,

      onTick: function (job, done) {
          var logRetentionDate = moment().subtract(logRetentionPeriod, 's').toDate();
          return db.then(function(coll) {
            return coll.remove({'finishTime': {$lt: logRetentionDate}});
          })
          .asCallback(done);
      }
    }
  });
}
