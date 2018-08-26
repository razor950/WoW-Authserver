module.exports = function() {
    this.storage = {};
};

module.exports.prototype.get = function(key) {
    var item = this.storage[key];

    if (typeof item === 'undefined') return null;

    return item;
};

module.exports.prototype.set = function(key, value) {
    this.storage[key] = value;
};

module.exports.prototype.del = function(key) {
    delete this.storage[key];
};
