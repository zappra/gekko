const _ = require('lodash');
const moment = require('moment');

const stats = require('../../core/stats');
const util = require('../../core/util');
const ENV = util.gekkoEnv();

const config = util.getConfig();
const perfConfig = config.performanceAnalyzer;
const watchConfig = config.watch;
var log = require('../../core/log');

// Load the proper module that handles the results
var Handler;
if(ENV === 'child-process')
  Handler = require('./cpRelay');
else
  Handler = require('./logger');

const PerformanceAnalyzer = function() {
  _.bindAll(this);

  this.dates = {
    start: false,
    end: false
  }

  this.startPrice = 0;
  this.endPrice = 0;

  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  this.handler = new Handler(watchConfig);

  this.trades = 0;
  this.totalTrips = 0;
  this.profitableTrips = 0;
  this.totalProfit = 0;
  this.maxProfit = 0;
  this.totalLoss = 0;
  this.maxLoss = 0;
  this.peak = 0;
  this.maxDrawdown = 0;

  this.sharpe = 0;

  this.roundTrips = [];
  this.roundTrip = {
    id: 0,
    entry: false,
    exit: false
  }
}

PerformanceAnalyzer.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.dates.end = candle.start;

  if(!this.dates.start) {
    this.dates.start = candle.start;
    this.startPrice = candle.close;
  }

  this.endPrice = candle.close;

  done();
}

PerformanceAnalyzer.prototype.processPortfolioUpdate = function(portfolio) {
  this.start = portfolio;
  this.current = _.clone(portfolio);
}

PerformanceAnalyzer.prototype.processTrade = function(trade) {
  this.trades++;
  this.current = trade.portfolio;

  const report = this.calculateReportStatistics();
  this.handler.handleTrade(trade, report);

  this.logRoundtripPart(trade);
}

PerformanceAnalyzer.prototype.logRoundtripPart = function(trade) {
  // this is not part of a valid roundtrip
  if(!this.roundTrip.entry && trade.action === 'sell') {
    return;
  }

  if(trade.action === 'buy') {
    if (this.roundTrip.exit) {
      this.roundTrip.id++;
      this.roundTrip.exit = false
    }

    this.roundTrip.entry = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.balance,
    }
  } else if(trade.action === 'sell') {
    this.roundTrip.exit = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
    }

    this.handleRoundtrip();
  }
}

PerformanceAnalyzer.prototype.round = function(amount) {
  return amount.toFixed(8);
}

PerformanceAnalyzer.prototype.handleRoundtrip = function() {
  var roundtrip = {
    id: this.roundTrip.id,

    entryAt: this.roundTrip.entry.date,
    entryPrice: this.roundTrip.entry.price,
    entryBalance: this.roundTrip.entry.total,

    exitAt: this.roundTrip.exit.date,
    exitPrice: this.roundTrip.exit.price,
    exitBalance: this.roundTrip.exit.total,

    duration: this.roundTrip.exit.date.diff(this.roundTrip.entry.date)
  }

  roundtrip.pnl = roundtrip.exitBalance - roundtrip.entryBalance;
  roundtrip.profit = (100 * roundtrip.exitBalance / roundtrip.entryBalance) - 100;

  // calculate max and avg profit/loss
  this.totalTrips++;
  if (roundtrip.profit > 0) {
    this.profitableTrips++;
    this.totalProfit += roundtrip.profit;
    if (roundtrip.profit > this.maxProfit)
      this.maxProfit = roundtrip.profit;
  }
  else {
    this.totalLoss += roundtrip.profit;
    if (roundtrip.profit < this.maxLoss)
       this.maxLoss = roundtrip.profit;
  }

  // initial peak value is portfolio start balance
  if (this.peak == 0) {
    this.peak = roundtrip.entryBalance;
  }

  this.roundTrips[this.roundTrip.id] = roundtrip;

  // this will keep resending roundtrips, that is not ideal.. what do we do about it?
  this.handler.handleRoundtrip(roundtrip);

  // we need a cache for sharpe

  // every time we have a new roundtrip
  // update the cached sharpe ratio
  this.sharpe = stats.sharpe(
    this.roundTrips.map(r => {
      var duration = moment.duration(r.exitAt.diff(r.entryAt)).asHours();
      var period = duration/(365*24);
      var rfr = perfConfig.riskFreeReturn / 100.0;
      rfr = Math.pow(1.0 + rfr, period) - 1.0;
      rfr *= 100.0; 
      return r.profit - rfr;
    })
  );
}

PerformanceAnalyzer.prototype.calculateReportStatistics = function(final) {
  // the portfolio's balance is measured in {currency}
  var balance;
  if (final) {
    var trip = _.last(this.roundTrips);
    if (trip)
      balance = trip.exitBalance;
    else
      balance = this.start.balance;
  }
  else {
    balance = this.current.currency + this.price * this.current.asset;
  }

  let profit = balance - this.start.balance;

  let timespan = moment.duration(
    this.dates.end.diff(this.dates.start)
  );
  let relativeProfit = balance / this.start.balance * 100 - 100;

  if (final) {
    var peak = this.start.balance;
    _.each(this.roundTrips, r => {
      // calculate max drawdown
      if (r.exitBalance > peak) {
        peak = r.exitBalance;
      }
      else {
        var dd = ((r.exitBalance - peak) / peak) * 100.0;
          if (dd < this.maxDrawdown)
            this.maxDrawdown = dd;
      }
    });
  }

  let report = {
    currency: this.currency,
    asset: this.asset,

    startTime: this.dates.start.utc().format('YYYY-MM-DD HH:mm:ss'),
    endTime: this.dates.end.utc().format('YYYY-MM-DD HH:mm:ss'),
    timespan: timespan.humanize(),
    market: this.endPrice * 100 / this.startPrice - 100,

    balance: balance,
    profit: profit,
    relativeProfit: relativeProfit,
    maxDrawdown: this.maxDrawdown.toFixed(1),

    yearlyProfit: this.round(profit / timespan.asYears()),
    relativeYearlyProfit: this.round(relativeProfit / timespan.asYears()),

    startPrice: this.startPrice,
    endPrice: this.endPrice,
    trades: this.trades,
    startBalance: this.start.balance,
    sharpe: this.sharpe,
    profitableTrips: this.totalTrips ? ((this.profitableTrips * 100.0) / this.totalTrips).toFixed(1) : 0,
    averageProfit: this.profitableTrips ? (this.totalProfit / this.profitableTrips).toFixed(1) : 0,
    maxProfit: this.maxProfit.toFixed(1),
    averageLoss: (this.totalTrips - this.profitableTrips) ? (this.totalLoss / (this.totalTrips - this.profitableTrips)).toFixed(1) : 0,
    maxLoss: this.maxLoss.toFixed(1),
  }

  report.alpha = report.profit - report.market;

  return report;
}

PerformanceAnalyzer.prototype.finalize = function(done) {
  const report = this.calculateReportStatistics(true);
  this.handler.finalize(report);
  done();
}


module.exports = PerformanceAnalyzer;
