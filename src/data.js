var mysql = require('mysql');
var log = require('./log.js');
var Cache = require('./cache.js');

const ACCOUNT_CACHE_LIMIT = 10000;

const QUERIES = {
    GET_REALMS:
        'SELECT name, address, port, portrange, icon, color, timezone, allowedsecuritylevel, population, gamebuild FROM realmlist',
    GET_ACCOUNT_INFO:
        "select acc.id, acc.username, acc.sha_pass_hash, acc.locked, acc.last_ip, max(aca.gmlevel) as 'gmlevel', " +
        'accban.bandate, accban.unbandate, ipban.bandate, ipban.unbandate ' +
        'from account acc left join account_access aca on acc.id=aca.id and aca.RealmID=-1 ' +
        'left join account_banned accban on accban.id=acc.id and accban.active=1 ' +
        'left join ip_banned ipban on ipban.ip=? where acc.username=?',
    GET_ACCOUNT_INFO_NOIP:
        "select acc.id, acc.username, acc.sha_pass_hash, max(aca.gmlevel) as 'gmlevel', " +
        'accban.bandate, accban.unbandate ' +
        'from account acc left join account_access aca on acc.id=aca.id and aca.RealmID=-1 ' +
        'left join account_banned accban on accban.id=acc.id and accban.active=1 ' +
        ' where acc.username=?',
    SET_LOGIN_INFO:
        'update account set last_login=NOW(), v=?, s=?, sessionkey=?, locale=?, operatingSystem=?, last_ip=? where username=?',
    SET_LOGIN_INFO_NOIP:
        'update account set last_login=NOW(), v=?, s=?, sessionkey=?, locale=?, operatingSystem=? where username=?',
    GET_ACCOUNT_CACHE:
        'select id, username from account where id>? order by id asc limit ?',
};

const default_execute_callback = function(err, rows) {
    if (err) log.Log(new log.Error('MYSQL', err, log.LEVEL.ERROR), 'SERVER');
};

module.exports = function(cfg) {
    this.db = mysql.createPool(cfg);
    this.accounts = new Cache();
    this.max_account = -1;
    this.cnt_account = 0;
};

module.exports.prototype.query = function(query, params, callback) {
    this.db.getConnection(function(err, conn) {
        if (err) callback(err, null);
        else {
            conn.query({ sql: query, nestTables: '_' }, params, function(
                err,
                rows,
            ) {
                conn.end();

                if (err) callback(err, null);
                else callback(null, rows);
            });
        }
    });
};

module.exports.prototype.getRealmlist = function(callback) {
    this.query(QUERIES.GET_REALMS, [], callback);
};

module.exports.prototype.getAccountInfo = function(callback, params) {
    if (this.accounts.get(params[1]) === null) callback(null, [{}]);
    else this.query(QUERIES.GET_ACCOUNT_INFO, params, callback);
};

module.exports.prototype.getAccountInfoNOIP = function(callback, params) {
    if (this.accounts.get(params[0]) === null) callback(null, [{}]);
    else this.query(QUERIES.GET_ACCOUNT_INFO_NOIP, params, callback);
};

module.exports.prototype.setLoginInfo = function(params) {
    this.query(QUERIES.SET_LOGIN_INFO, params, default_execute_callback);
};

module.exports.prototype.setLoginInfoNOIP = function(params) {
    this.query(QUERIES.SET_LOGIN_INFO_NOIP, params, default_execute_callback);
};

module.exports.prototype.start = function(interval, callback) {
    log.Log(
        new log.Error('DATA', 'Starting cache..', log.LEVEL.INFO),
        'SERVER',
    );
    this.interval = interval * 1000;

    this.start_time = Date.now();
    this.updateCache(callback);
};

module.exports.prototype.updateCache = function(callback) {
    return this.query(
        QUERIES.GET_ACCOUNT_CACHE,
        [this.max_account, ACCOUNT_CACHE_LIMIT],
        ((_this, interval, callback) => (err, rows) => {
            if (err)
                return log.Log(
                    new log.Error('MYSQL', err, log.LEVEL.ERROR),
                    'SERVER',
                );

            for (var i = 0; i < rows.length; ++i) {
                _this.accounts.set(rows[i].account_username, true);
                if (rows[i].account_id > _this.max_account)
                    _this.max_account = rows[i].account_id;
            }

            _this.cnt_account += i;
            if (!callback && i)
                // scheduled update (not fresh get) and we got new accounts
                log.Log(
                    new log.Error(
                        'DATA',
                        'Added ' + i + ' accounts to cache',
                        log.LEVEL.INFO,
                    ),
                    'SERVER',
                );

            if (i === ACCOUNT_CACHE_LIMIT) {
                // got max possible new accounts, repeat query
                setTimeout(
                    ((_this2, cb) => () => _this2.updateCache(cb))(
                        _this,
                        callback,
                    ),
                    0,
                );
            } // last batch of new accounts, reschedule update and call callback if needed
            else {
                setTimeout(
                    (_this2 => () => _this2.updateCache())(_this),
                    _this.interval,
                );

                if (typeof callback === 'function') {
                    log.Log(
                        new log.Error(
                            'DATA',
                            'Added ' +
                                _this.cnt_account +
                                ' accounts to cache (' +
                                (Date.now() - _this.start_time) +
                                'ms)',
                            log.LEVEL.INFO,
                        ),
                        'SERVER',
                    );
                    callback();
                }
            }
        })(this, this.interval, callback),
    );
};
