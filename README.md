# tke-cron-master-builder
Simple module that initiates all of the 'cron-master' jobs defined in a configurable folder. The module also initiates heartbeat logging to a configurable MongoDB collection for all of the given Cron Jobs, and takes care of cleaning said collection.

NOTE: 'cron-master' library expected and required as a co-dependency

## Running the Module

### Execution

`require('tke-cron-master-builder')(cronConfigDir, collection, logCleanUpOpts);`

Grabs the Cron Job config files in the specified directory, initiates and
starts them.

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
