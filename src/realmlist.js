var log = require('./log.js');

const MS_TO_SEC = 1000;

module.exports = function(data, interval) {
    this.data = data;
    this.interval = interval * MS_TO_SEC;
    this.realms = [];
};

module.exports.prototype.start = function() {
    this.update();
};

module.exports.prototype.update = function() {
    this.data.getRealmlist(
        (function(_this) {
            return function(err, rows) {
                return _this.onData(err, rows);
            };
        })(this),
    );
};

module.exports.prototype.onData = function(err, rows) {
    setTimeout(
        (function(_this) {
            return function() {
                _this.update();
            };
        })(this),
        this.interval,
    );
    this.realms = [];

    if (err) log.Log(new log.Error('Realmlist error', err, log.LEVEL.ERROR));
    else {
        for (var i = 0; i < rows.length; ++i) {
            var res = rows[i];

            var allPorts = [];
            var portLen = res.realmlist_port.toString().length;
            for (
                var p = res.realmlist_port - res.realmlist_portrange;
                p <= res.realmlist_port + res.realmlist_portrange;
                ++p
            ) {
                var port = p.toString();
                if (portLen !== port.length) {
                    portLen = -1;
                    break;
                }

                allPorts.push(port);
            }

            if (portLen === -1) {
                log.Log(
                    new Error(
                        'Realmlist',
                        "Realm '" +
                            res.realmlist_name +
                            "' has multiple length ports. skipping",
                        log.LEVEL.ERROR,
                    ),
                );
                continue;
            }

            var buf = new Buffer(
                13 +
                    res.realmlist_name.length +
                    res.realmlist_address.length +
                    portLen,
            );
            var pos = 0;
            buf.writeInt8(res.realmlist_icon, pos);
            pos += 1;
            buf.writeInt8(0, pos);
            pos += 1;
            buf.writeInt8(res.realmlist_color, pos);
            pos += 1;
            buf.write(
                res.realmlist_name,
                pos,
                res.realmlist_name.length,
                'utf-8',
            );
            pos += res.realmlist_name.length;
            buf.writeInt8(0, pos);
            pos += 1;
            buf.write(
                res.realmlist_address,
                pos,
                res.realmlist_address.length,
                'utf-8',
            );
            pos += res.realmlist_address.length;
            buf.writeInt8(0x3a, pos);
            pos += 1;

            var portOffset = pos;
            pos += port.length;

            buf.writeInt8(0, pos);
            pos += 1;
            buf.writeFloatLE(res.realmlist_population, pos);
            pos += 4;
            buf.writeInt8(0, pos);
            pos += 1;
            buf.writeInt8(res.realmlist_timezone, pos);
            pos += 1;
            buf.writeInt8(0x2c, pos);

            this.realms.push({
                build: res.realmlist_gamebuild,
                security: res.realmlist_allowedsecuritylevel,
                ports: allPorts,
                portLength: portLen,
                portOffset: portOffset,
                data: buf,
            });
        }
    }
};
