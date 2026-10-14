const { getDefaultConfig } = require('expo/metro-config');
module.exports = require('./scripts/metro-agent.cjs')(
  getDefaultConfig(__dirname),
);
