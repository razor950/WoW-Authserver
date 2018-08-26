var log = require('./log.js');
var colors = require('colors');
var auth = require('./auth.js');

const AUTH_STAGE = {
    FRESH: 0,
    QUERY_CALLBACK: 1,
    LOGON_PROOF: 2,
    RECONNECT_PROOF: 3,
    REALMLIST: 4,
    FAILED: 5,
};

const AUTH_RESPONSE = {
    BANNED: new Buffer([0, 0, 0x3]),
    SUSPENDED: new Buffer([0, 0, 0xc]),
    LOCKED: new Buffer([0, 0, 0x10]),
    INTERNAL_ERROR: new Buffer([0, 0, 0x8]),
    INVALID_BUILD: new Buffer([0, 0, 0x9]),
    UNKNOWN_ACCOUNT: new Buffer([0, 0, 0x4]),
    WRONG_PASSWORD: new Buffer([1, 4, 3, 0]),
};

const AUTH_ERROR = {
    NOT_IMPLEMENTED: function(msg) {
        return new log.Error('Not implemented', msg, log.LEVEL.ERROR, {
            close: true,
        });
    },
    PKT_OUT_OF_ORDER: function(opcode) {
        return new log.Error('Packet out of order', opcode, log.LEVEL.WARN, {
            close: true,
        });
    },
    PKT_UNHANDLED: function(opcode) {
        return new log.Error('Packet has no handler', opcode, log.LEVEL.WARN, {
            close: true,
        });
    },
    DATA_ERROR: function(msg) {
        return new log.Error('Data error', msg, log.LEVEL.ERROR, {
            close: true,
            response: AUTH_RESPONSE.INTERNAL_ERROR,
        });
    },
    BANNED: function(type) {
        return new log.Error('Banned', type, log.LEVEL.ERROR, {
            close: true,
            response: AUTH_RESPONSE.BANNED,
        });
    },
    SUSPENDED: function(type) {
        return new log.Error('Suspended', type, log.LEVEL.ERROR, {
            close: true,
            response: AUTH_RESPONSE.SUSPENDED,
        });
    },
    LOCKED: function(ip) {
        return new log.Error('Account locked', ip, log.LEVEL.WARN, {
            close: true,
            response: AUTH_RESPONSE.LOCKED,
        });
    },
    UNKNOWN_ACCOUNT: function(acc) {
        return new log.Error('Unknown account', acc, log.LEVEL.WARN, {
            close: true,
            response: AUTH_RESPONSE.UNKNOWN_ACCOUNT,
        });
    },
    WRONG_PASSWORD: function() {
        return new log.Error('Wrong password', '', log.LEVEL.WARN, {
            close: true,
            response: AUTH_RESPONSE.WRONG_PASSWORD,
        });
    },
    INVALID_BUILD: function(build) {
        return new log.Error('Invalid build', build, log.LEVEL.WARN, {
            close: true,
            response: AUTH_RESPONSE.INVALID_BUILD,
        });
    },
};

module.exports = function(server, sock) {
    this.server = server;
    this.sock = sock;
    this.ip = sock.remoteAddress;

    this.builds = server.config.client.builds;
    this.NOIP = server.config.client.ignoreip;

    this.stage = AUTH_STAGE.FRESH;
    this.account = { username: '' };
    this.crypto = {};
};

module.exports.prototype.log_header = function() {
    for (var stage in AUTH_STAGE)
        if (AUTH_STAGE[stage] === this.stage)
            return [this.account.username, this.ip, stage];

    return [this.account.username, this.ip, this.stage.toString()];
};

module.exports.prototype.failed = function() {
    return this.stage === AUTH_STAGE.FAILED;
};

module.exports.prototype.handle_error = function(err) {
    log.Log(err, this.log_header());

    if (err.extra.close) {
        this.stage = AUTH_STAGE.FAILED;

        if (err.extra.response) this.sock.write(err.extra.response);
        else this.sock.end();
    }
};

module.exports.prototype.handle = function(pkt) {
    try {
        switch (pkt.opcode) {
            case 0x00:
                this.logon_challenge(pkt);
                break;
            case 0x01:
                this.logon_proof(pkt);
                break;
            case 0x10:
                this.realmlist(pkt);
                break;
            default:
                throw AUTH_ERROR.PKT_UNHANDLED(pkt.opcode);
        }
    } catch (err) {
        this.handle_error(err);
    }
};

module.exports.prototype.logon_challenge = function(pkt) {
    if (this.stage !== AUTH_STAGE.FRESH)
        throw AUTH_ERROR.PKT_OUT_OF_ORDER(pkt.opcode);

    log.Log(
        new log.Error('logon_challenge', 'entered', log.LEVEL.VERBOSE),
        this.log_header(),
    );

    this.account.username = auth.get_username(pkt);
    this.account.build = auth.get_build(pkt);
    this.account.os = auth.get_os(pkt);
    this.account.locale = auth.get_locale(pkt);

    if (this.builds.indexOf(this.account.build) < 0)
        throw AUTH_ERROR.INVALID_BUILD(this.account.build);

    this.stage = AUTH_STAGE.QUERY_CALLBACK;

    if (this.NOIP)
        this.server.data.getAccountInfoNOIP(
            (function(_this) {
                return function(err, rows) {
                    _this.logon_challenge2(err, rows);
                };
            })(this),
            [this.account.username],
        );
    else
        this.server.data.getAccountInfo(
            (function(_this) {
                return function(err, rows) {
                    _this.logon_challenge2(err, rows);
                };
            })(this),
            [this.ip, this.account.username],
        );
};

module.exports.prototype.logon_challenge2 = function(err, rows) {
    log.Log(
        new log.Error('logon_challenge2', 'entered', log.LEVEL.VERBOSE),
        this.log_header(),
    );

    try {
        if (this.stage !== AUTH_STAGE.QUERY_CALLBACK)
            throw AUTH_ERROR.PKT_OUT_OF_ORDER('query');

        if (err) throw AUTH_ERROR.DATA_ERROR(err);

        var result = rows[0];

        if (result.ipban_bandate) {
            if (result.ipban_bandate === result.ipban_unbandate)
                throw AUTH_ERROR.BANNED('IP');
            else throw AUTH_ERROR.SUSPENDED('IP');
        }

        if (!result.acc_id)
            throw AUTH_ERROR.UNKNOWN_ACCOUNT(this.account.username);

        if (result.accban_bandate) {
            if (result.accban_bandate === result.accban_unbandate)
                throw AUTH_ERROR.BANNED('Account');
            else throw AUTH_ERROR.SUSPENDED('Account');
        }

        if (result.acc_locked && result.acc_last_ip !== this.ip)
            throw AUTH_ERROR.LOCKED(result.acc_last_ip);

        this.account.id = result.acc_id;
        this.account.username = result.acc_username;
        this.account.gmlevel = result._gmlevel;

        this.crypto.s = auth.generate_s();
        this.crypto.v = auth.generate_v(
            result.acc_sha_pass_hash,
            this.crypto.s,
        );
        this.crypto.b = auth.generate_b();
        this.crypto.B = auth.generate_B(this.crypto.v, this.crypto.b);

        this.sock.write(
            auth.logon_challenge_response(this.crypto.B, this.crypto.s),
        );
        this.stage = AUTH_STAGE.LOGON_PROOF;
        log.Log(
            new log.Error('logon_challenge', 'completed', log.LEVEL.DEBUG),
            this.log_header(),
        );
    } catch (err) {
        this.handle_error(err);
    }
};

module.exports.prototype.logon_proof = function(pkt) {
    if (this.stage !== AUTH_STAGE.LOGON_PROOF)
        throw AUTH_ERROR.PKT_OUT_OF_ORDER(pkt.opcode);

    log.Log(
        new log.Error('logon_proof', 'entered', log.LEVEL.VERBOSE),
        this.log_header(),
    );

    var A = auth.get_A(pkt);
    var m1 = auth.get_m1(pkt);

    var K = auth.generate_K(A, this.crypto.B, this.crypto.v, this.crypto.b);
    var M = auth.generate_M(
        this.account.username,
        this.crypto.s,
        A,
        this.crypto.B,
        K,
    );

    if (!auth.equals(M, m1)) throw AUTH_ERROR.WRONG_PASSWORD();

    this.sock.write(auth.logon_proof_response(A, M, K));
    this.stage = AUTH_STAGE.REALMLIST;
    log.Log(new log.Error('Auth', 'passed', log.LEVEL.INFO), this.log_header());
    log.Log(
        new log.Error('logon_proof', 'completed', log.LEVEL.DEBUG),
        this.log_header(),
    );

    if (this.NOIP)
        this.server.data.setLoginInfoNOIP([
            auth.to_hex(this.crypto.v),
            auth.to_hex(this.crypto.s),
            auth.to_hex(K),
            this.account.locale,
            this.account.os,
            this.account.username,
        ]);
    else
        this.server.data.setLoginInfo([
            auth.to_hex(this.crypto.v),
            auth.to_hex(this.crypto.s),
            auth.to_hex(K),
            this.account.locale,
            this.account.os,
            this.ip,
            this.account.username,
        ]);
};

module.exports.prototype.realmlist = function(pkt) {
    if (this.stage !== AUTH_STAGE.REALMLIST)
        throw AUTH_ERROR.PKT_OUT_OF_ORDER(pkt.opcode);

    log.Log(
        new log.Error('realmlist', 'entered', log.LEVEL.VERBOSE),
        this.log_header(),
    );

    var realms = [];
    for (var i = 0; i < this.server.realmlist.realms.length; ++i) {
        var r = this.server.realmlist.realms[i];

        if (r.build !== this.account.build || r.security > this.account.gmlevel)
            continue;

        var buf = new Buffer(r.data.length);
        r.data.copy(buf);
        buf.write(
            r.ports[Math.floor(Math.random() % r.ports.length)],
            r.portOffset,
            r.portLength,
            'utf-8',
        );

        realms.push(buf);
    }

    var realmSize = 0;
    for (var i = 0; i < realms.length; ++i) realmSize += realms[i].length;

    var buf = new Buffer(11 + realmSize);
    var pos = 0;

    buf.writeInt8(16, pos);
    pos += 1;
    buf.writeUInt16LE(8 + realmSize, pos);
    pos += 2;
    buf.writeUInt32LE(0, pos);
    pos += 4;
    buf.writeUInt16LE(realms.length, pos);
    pos += 2;

    for (var i = 0; i < realms.length; ++i) {
        realms[i].copy(buf, pos);
        pos += realms[i].length;
    }

    buf.writeInt8(0x10, pos);
    pos += 1;
    buf.writeInt8(0, pos);

    this.sock.write(buf);
};
