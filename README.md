# tke-cron-master-builder
Simple module that initiates all of the 'cron-master' jobs defined in a configurable folder. The module also initiates heartbeat logging to a configurable MongoDB collection for all of the given Cron Jobs, and takes care of cleaning said collection.

NOTE: 'cron-master' library expected and required as a co-dependency. Also, the environment variable `RAYGUN_API_KEY` *must* be set

## Running the Module

### loadJobs
Grabs the Cron Job config files in the specified directory, initiates and
starts them:

```js
const path = require('path');

const cleanUpOpts = {
  frequency: '* * 0 * * *', // midnight
  retentionPeriod: '5 days' // items more than five days old are removed
};

const jobsDir = path.join(process.cwd(), './cron-jobs');

const cronBuilder = require('tke-cron-master-builder')(
  jobsDir,
  'cron-logs', // a mongodb collection name
  cleanUpOpts
);

// load all jobs in cronConfigDir
cronBuilder.loadJobs();
```

### getHandlers
Perhaps you want to attach handlers to a job without loading it via `loadJobs`,
this will allow you:

```js
const CM = require('cron-master');
const cronBuilder = require('tke-cron-master-builder')(
  jobsDir,
  'cron-logs',
  cleanUpOpts
);

const job = new CM.CronMasterJob({
  // will trigger the TIME_WARNING event if job runs more than 2 minutes
  timeThreshold: 2 * 60 * 1000,

  meta: {
    name: 'my-cron-job'
  },

  // these are passed to the node-cron module used internally by CronMasterJob
  cronParams: {
    cronTime: '* * * * *',
    onTick: (job, done) => {
      console.log(new Date(), 'tick happened for our cron job!');
      done();
    }
  }
});

const handlers = cronBuilder.getHandlers(job);

// Bind event handlers as needed
job.on(CM.TICK_COMPLETE, handlers.onTickComplete);
job.on(CM.TICK_STARTED, handlers.onTickStarted);
job.on(CM.OVERLAPPING_CALL, handlers.onOverlappingCall);
job.on(CM.TIME_WARNING, handlers.onTimeWarning);
```

### attachEventHandlers
Similar to `getHandlers`, but this attaches event handlers to the passed job for
you:

```js
const CM = require('cron-master');
const cronBuilder = require('tke-cron-master-builder')(
  jobsDir,
  'cron-logs',
  cleanUpOpts
);

const job = new CM.CronMasterJob({
  // will trigger the TIME_WARNING event if job runs more than 2 minutes
  timeThreshold: 2 * 60 * 1000,

  meta: {
    name: 'my-cron-job'
  },

  // these are passed to the node-cron module used internally by CronMasterJob
  cronParams: {
    cronTime: '* * * * *',
    onTick: (job, done) => {
      console.log(new Date(), 'tick happened for our cron job!');
      done();
    }
  }
});

// attach all our handlers
cronBuilder.attachEventHandlers(job)
```

### Parameters
`cronConfigsDir` {String} (required): Complete path to config files for cron-master Cron Jobs

`collection` {String} (required):  Name of Collection to store Cron Logs in

`logCleanUpOpts` {object} (optional): Options for Cleaning Up Cron Job Logs (i.e. removing the logs from MongoDB)

`logCleanUpOpts.frequency` {String} (optional): Frequency of clean up Cron. Defaulted to '* * 0 * * *', or
every night at midnight, when omitted.

`logCleanUpOpts.retentionPeriod` {String} (optional): Human readable retention period for Logs. Defaulted
to '7 days' when omitted.
NOTE: 'timestring' library is used for parsing retentionPeriod


## MongoDB Logs
The 'tke-logger' library is used for console logging. Therefore, Logs of type warn and error are also
written to MongoDB. These are in the general 'bunyan' JSON log format.

The Cron Job heartbeat logs that are written to MongoDB are on the following format:

```
    "error": Error Object,
    "finishTime": Date Object,
    "lastStatus": "Success" || "Failed" || "In Process",
    "name": String Path to Cron Config File,
    "nextSchedule": Date Object,
    "startTime": Date Object
```

Logs are inserted at the start of each cron iteration and updated on job complete or failure. There are
also console warnings for a job overlapping itself and for taking too long to complete.
