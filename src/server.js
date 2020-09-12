var net = require('net');
var fs = require('fs');
var Data = require('./data.js');
var Packet = require('./packet.js');
var Client = require('./client.js');
var Realmlist = require('./realmlist.js');
var log = require('./log.js');

var setupServer = function(createClient) {
    return net.createServer(function(sock) {
        sock.bufferIn = new Buffer(0);
        sock.client = createClient(sock);

        sock.on('data', function(data) {
            if (this.client.failed()) return;

            try {
                this.bufferIn = Buffer.concat(
                    [this.bufferIn, data],
                    this.bufferIn.length + data.length,
                );

                var pkt = null;
                while ((pkt = Packet.Build(this.bufferIn))) {
                    this.client.handle(pkt);
                    if (this.client.failed()) break;

                    var tmp = new Buffer(this.bufferIn.length - pkt.length);
                    this.bufferIn.copy(tmp, 0, pkt.length);
                    this.bufferIn = tmp;
                }
            } catch (err) {
                this.client.handle_error(
                    new log.Error('packet build', err, log.LEVEL.WARN, {
                        close: true,
                    }),
                );
            }
        });

        sock.on('close', function(error) {
            this.client.handle_error(
                new log.Error(
                    'socket',
                    'closed ' + (error ? 'with' : 'without') + ' error',
                    log.LEVEL.DEBUG,
                    { close: true },
                ),
            );
        });

        sock.on('error', function(error) {
            this.client.handle_error(
                new log.Error('socket', error, log.LEVEL.WARN, { close: true }),
            );
        });
    });
};

module.exports = function(cfg) {
    this.config = cfg;
    this.data = null;
    this.realmlist = null;
    this.server = null;
};

module.exports.prototype.start = function() {
    for (i in this.config.log) {
        var target = null;

        switch (this.config.log[i].type) {
            case 'console':
                target = console.log;
                break;
            case 'file':
                var f = fs.createWriteStream(this.config.log[i].target, {
                    flags: 'a',
                });
                target = (function(s) {
                    return function(msg) {
                        s.write(msg);
                        s.write('\n');
                    };
                })(f);
                break;
            default:
                console.log(
                    'Unknown log target type: ' + this.config.log[i].type,
                );
                continue;
        }

        log.addTarget(
            target,
            this.config.log[i].levels,
            parseInt(this.config.log[i].colors),
        );
    }

    log.Log(new log.Error('SERVER', 'Starting..', log.LEVEL.INFO), 'SERVER');

    this.data = new Data(this.config.database);

    this.realmlist = new Realmlist(this.data, this.config.realmlist.interval);
    this.realmlist.start();

    this.server = setupServer(
        (function(_this) {
            return function(sock) {
                return new Client(_this, sock);
            };
        })(this),
    );

    this.data.start(
        this.config.cache.interval,
        (function(_this) {
            return function() {
                _this.server.listen(_this.config.server.port, function(err) {
                    if (err) throw err;

                    log.Log(
                        new log.Error('SERVER', 'Listening..', log.LEVEL.INFO),
                        'SERVER',
                    );
                });
            };
        })(this),
    );
};
