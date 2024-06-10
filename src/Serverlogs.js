const pm2 = require('pm2');

pm2.connect(function(err) {
    console.log("err2", err)
  if (err) {
    console.error(err);
    process.exit(2);
  }
  // Set the log file path
  console.log("Starting service ..........")
  pm2.start({
    script    : 'src/Server.js',
    exec_mode : 'cluster',
    log_file  : '/app/logs/pm2.log', // Specify the log file path
  }
  , function(err) {
    console.log("err1", err)
    //pm2.disconnect();  // Disconnect from PM2
    if (err) throw err;
  });
  pm2.launchBus(function(err, bus) {
    console.log('PM2: Log streaming started');

    bus.on('log:out', function(log) {
      console.log('PM2: [OUT] ', log.data);
    });

    bus.on('log:err', function(log) {
      console.error('PM2: [ERR] ', log.data);
    });
  });
});
