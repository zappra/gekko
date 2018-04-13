// example strategy that responds to commands send from remote agent

var log = require('../core/log');

// Let's create our own strat
var strat = {};

// Prepare everything our method needs
strat.init = function() {

}

// What happens on every new candle?
strat.update = function(candle) {

}

// For debugging purposes.
strat.log = function() {

}

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function() {

}

// command handling
strat.onCommand = function(cmd) {
  var command = cmd.command;
  if (command == 'help') {
    cmd.handled = true;
    cmd.response = "Supported commands are 'buy' and 'sell";
  }
  else if (command == 'buy') {
    cmd.handled = true;
    this.advice('long');
  }
  else if (command == 'sell') {
    cmd.handled = true;
    this.advice('short');
  }
}

module.exports = strat;
