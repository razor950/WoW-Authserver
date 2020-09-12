var Server = require('./src/server.js');
var fs = require('fs');
var ini = require('ini');

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

config.server.port = parseInt(config.server.port);

config.client.ignoreip = parseInt(config.client.ignoreip);

for (var i = 0; i < config.client.builds.length; ++i)
    config.client.builds[i] = parseInt(config.client.builds[i]);

config.realmlist.interval = parseInt(config.realmlist.interval);

config.database.connectionLimit = parseInt(config.database.connectionLimit);

var server = new Server(config);
server.start();
