var log = require('../core/log');
var moment = require('moment');
var _ = require('lodash');
var util = require('../core/util');
var config = util.getConfig();
var utc = moment.utc;

var telegramfancy = require("tgfancy");

var Actor = function () {
  _.bindAll(this);

  this.chatId = null;
  this.bot = new telegramfancy(config.telegrambot.token, { polling: true });
  this.bot.onText(/(.+)/, this.verifyQuestion);

  log.addRemoteLogger(this);
}

util.makeEventEmitter(Actor);

Actor.prototype.processAdvice = function (advice) {
  this.advice = advice.recommendation;
  if (this.chatId) {
    var message;
    if (this.advice == 'long') {
      message = "BUY order received, sending to exchange";
    }
    else {
      message = "SELL order received, sending to exchange";
    }
    
    this.bot.sendMessage(this.chatId, message);
  }
}

Actor.prototype.processTrade = function (trade) {
  //{
  //  action: [either "buy" or "sell"],
  //  price: [number, price that was sold at],
  //  date: [moment object, exchange time trade completed at],
  //  portfolio: [object containing amount in currency and asset],
  //  balance: [number, total worth of portfolio]
  //}

  if (this.chatId) {
    this.bot.sendMessage(this.chatId, "Trade completed!");
    this.bot.sendMessage(this.chatId, trade.date.toDate() + ": " + trade.action + " at " + trade.price.toFixed(2));
    // emit portfolio command to get results of trade
    this.emit('command', {
      command: 'portfolio',
      arguments: [null],
      handled: false,
      response: null
    });
  }
}

Actor.prototype.verifyQuestion = function (msg, text) {
  this.chatId = msg.chat.id;

  // simple parsing that supports a command and single argument
  var tokens = text[1].split(" ");

  if (tokens.length == 1 || tokens.length == 2) {
    var command = tokens[0].toLowerCase();
    var arg = tokens.length == 2 ? tokens[1].toLowerCase() : null;
    this.emitCommand(command, arg);
  }
  else {
    this.bot.sendMessage(this.chatId, "'" + text[1] + "' - syntax error");
  }
}

Actor.prototype.emitCommand = function(command, arg) {
  var cmd = {
    command: command.replace('/',''),
    arguments: [arg],
    handled: false,
    response: null
  };

  this.emit('command', cmd);
  if (cmd.handled) {
    if (cmd.response) {
      this.bot.sendMessage(this.chatId, cmd.response);
    }
  }
  else {
    this.bot.sendMessage(this.chatId, "'" + cmd.command + "' - unrecognised command");
  }
}

Actor.prototype.logError = function (message) {
  log.error('Telegram ERROR:', message);
};

Actor.prototype.logRemote = function (message) {
  if (this.chatId) {
    this.bot.sendMessage(this.chatId, message);
  }
}

module.exports = Actor;
