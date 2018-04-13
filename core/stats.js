const stats = require('stats-lite');
const lodash = require('lodash');


// simply monkey patch the stats with other stuff we
// need and pass on.

// sharpe ratio
//
// @param returns (array - list of returns)
// @param rfreturn (number - risk free return)
// 
stats.sharpe = (returns) => {
  return stats.mean(returns) / stats.stdev(returns);
}

module.exports = stats;
