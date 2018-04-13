/*

  Lightweight logger, print everything that is send to error, warn
  and messages to stdout (the terminal). If config.debug is set in config
  also print out everything send to debug.

*/

var moment = require('moment');
var fmt = require('util').format;
var _ = require('lodash');
var util = require('./util');
var config = util.getConfig();
var debug = config.debug;
var silent = config.silent;

var sendToParent = function() {
  var send = method => (...args) => {
    process.send({'log': args.join(' ')});
  }

  return {
    error: send('error'),
    warn: send('warn'),
    info: send('info'),
    status: send('status'),
    write: send('write')
  }
}

var Log = function() {
  _.bindAll(this);
  this.env = util.gekkoEnv();

  if(this.env === 'standalone')
    this.output = console;
  else if(this.env === 'child-process')
    this.output = sendToParent();

  this.remoteLoggers = [];
};

Log.prototype = {
  _write: function(method, args, name) {

    var config = util.getConfig();
    var silent = config.silent;

    if(silent)
      return;
      
    if(!name)
      name = method.toUpperCase();

    var message = moment().format('YYYY-MM-DD HH:mm:ss');
    message += ' (' + name + '):\t';
    var rawMessage = fmt.apply(null, args);
    message += rawMessage;

    if (method == 'remote')
    {
      // mirror remote output to info 
      this.output['info'](message);
      _.each(this.remoteLoggers, function(logger) {
        logger.logRemote(rawMessage);
      });
    }
    else
    {
      this.output[method](message);
    }
  },
  error: function() {
    this._write('error', arguments);
  },
  warn: function() {
    this._write('warn', arguments);
  },
  info: function() {
    this._write('info', arguments);
  },
  remote: function() {
    this._write('remote', arguments);
  },
  write: function() {
    var args = _.toArray(arguments);
    var message = fmt.apply(null, args);
    this.output.info(message);
  },
  addRemoteLogger: function(logger) {
    this.remoteLoggers.push(logger);
  }
}

if(debug)
  Log.prototype.debug = function() {
    this._write('info', arguments, 'DEBUG');  
  }
else
  Log.prototype.debug = _.noop;

if(silent) {
  Log.prototype.debug = _.noop;
  Log.prototype.info = _.noop;
  Log.prototype.warn = _.noop;
  Log.prototype.error = _.noop;
  Log.prototype.write = _.noop;
  Log.prototype.remote = _.noop;
}

module.exports = new Log;