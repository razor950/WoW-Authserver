var colors = require('colors');
require('date-utils');

colors.setTheme({
    LOG_: 'white',
    LOG_ERROR: 'red',
    LOG_WARN: 'magenta',
    LOG_INFO: 'green',
    LOG_DEBUG: 'grey',
    LOG_VERBOSE: 'grey',
    LOG_NOLOG: 'white',
});

exports.LEVEL = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    VERBOSE: 4,
    NOLOG: 5,
};

var LOG_TARGETS = [];
var LOG_COLORS = false; // keep track if any target needs colors

exports.Error = function(err, msg, log, extra) {
    this.error = err;
    this.message = msg;
    this.logLevel = log;
    this.extra = typeof extra === 'undefined' ? {} : extra;
    this._isATLogError = true;
};

var logLevelName = function(logLevel) {
    for (var lvl in exports.LEVEL)
        if (exports.LEVEL[lvl] === logLevel) return lvl;

    return '';
};

exports.Log = function(err, header) {
    if (!LOG_TARGETS.length) return;

    header = header || '';
    if (!Array.isArray(header)) header = [header];

    if (!err._isATLogError)
        err = new exports.Error('Custom Error', err, exports.LEVEL.ERROR);

    var lvlName = logLevelName(err.logLevel);
    var date = new Date().toFormat('DD-MM-YYYY HH24:MI:SS');

    var msg =
        date +
        ' ' +
        lvlName +
        ' [' +
        header.join('@') +
        '] (' +
        err.error +
        ') ' +
        err.message;
    var msg_c = '';
    if (LOG_COLORS) {
        for (var i = 0; i < header.length; ++i) header[i] = header[i].cyan;

        msg_c =
            date.cyan +
            ' ' +
            lvlName['LOG_' + lvlName] +
            ' [' +
            header.join('@') +
            '] (' +
            err.error.yellow +
            ') ' +
            err.message;
        hc = header.join('@');
    }

    for (var i = 0; i < LOG_TARGETS.length; ++i) {
        var t = LOG_TARGETS[i];

        if (t.levels & (1 << err.logLevel)) t.target(t.colors ? msg_c : msg);
    }
};

exports.addTarget = function(_target, _levels, _colors) {
    var lvls = 0;
    for (var i = 0; i < _levels.length; ++i) lvls = lvls | (1 << _levels[i]);

    LOG_TARGETS.push({ target: _target, levels: lvls, colors: _colors });
    if (_colors) LOG_COLORS = true;
};
