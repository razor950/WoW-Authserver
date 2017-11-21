var BN = require('bignum');
var crypto = require('crypto');

var toBuffer = function(a, b)
{
    if (b)
        return a.toBuffer({size: b});
    else
        return a.toBuffer();
};

var fromBuffer = function(a)
{
    return BN.fromBuffer(a);
};

var random = function(a)
{
    return BN.fromBuffer(crypto.pseudoRandomBytes(a));
};

var modexp = function(t, u, n)
{
    return t.powm(u, n);
};

exports.toBuffer = toBuffer; // toBuffer(a, b) - return Buffer of length b that contains a
exports.fromBuffer = fromBuffer; // fromBuffer(a) - return BN with value a
exports.random = random; // random(a) - return new BN with length of a bytes
exports.modexp = modexp; // modexp(t, u, n) - return t.modexp(u, n)
exports.add = BN.add; // add(a, b) - return BN that is sum of a and b
exports.mul = BN.mul; // mul(a, b) - return BN that is a multiplied by b
exports.Number = BN; // number implementation
