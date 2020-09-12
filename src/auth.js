var BNT = require('./bignum_tools.js');
var BN = BNT.Number;
var crypto = require('crypto');
var buffertools = require('buffertools');

const N = new BN(
    '894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7',
    16,
);

const g = new BN(7);

exports.generate_s = function() {
    return BNT.random(32);
};

exports.generate_v = function(pw, s) {
    var p = new BN(pw, 16);

    var sha = crypto.createHash('sha1');
    sha.update(BNT.toBuffer(s).reverse());
    sha.update(BNT.toBuffer(p));

    return BNT.modexp(g, BNT.fromBuffer(sha.digest().reverse()), N);
};

exports.generate_b = function() {
    return BNT.random(19);
};

exports.generate_B = function(v, b) {
    return BNT.add(BNT.mul(v, 3), BNT.modexp(g, b, N)).mod(N);
};

exports.logon_challenge_response = function(B, s, unk) {
    var unk = unk || BNT.random(16);
    var buf = new Buffer(119);
    var pos = 0;

    buf.writeInt8(0, pos, true);
    pos += 1;
    buf.writeInt16LE(0, pos, true);
    pos += 2;
    BNT.toBuffer(B, 32)
        .reverse()
        .copy(buf, pos);
    pos += 32;
    buf.writeInt8(1, pos, true);
    pos += 1;
    BNT.toBuffer(g, 1).copy(buf, pos);
    pos += 1;
    buf.writeInt8(32, pos, true);
    pos += 1;
    BNT.toBuffer(N, 32)
        .reverse()
        .copy(buf, pos);
    pos += 32;
    BNT.toBuffer(s, 32)
        .reverse()
        .copy(buf, pos);
    pos += 32;
    BNT.toBuffer(unk, 16).copy(buf, pos);
    pos += 16;
    buf.writeInt8(0, pos, true);

    return buf;
};

exports.generate_K = function(A, B, v, b) {
    var sha = crypto.createHash('sha1');
    sha.update(BNT.toBuffer(A, 32).reverse());
    sha.update(BNT.toBuffer(B).reverse());
    var u = BNT.fromBuffer(sha.digest().reverse());
    var S = BNT.modexp(BNT.mul(A, BNT.modexp(v, u, N)), b, N);
    var Sb = BNT.toBuffer(S, 32).reverse();
    var t1 = new Buffer(16);
    var t2 = new Buffer(16);
    var t1h = new Buffer(20);
    var t2h = new Buffer(20);

    for (var i = 0; i < 16; ++i) {
        t1[i] = Sb[i * 2];
        t2[i] = Sb[i * 2 + 1];
    }

    sha = crypto.createHash('sha1');
    sha.update(t1);
    sha.digest().copy(t1h);

    sha = crypto.createHash('sha1');
    sha.update(t2);
    sha.digest().copy(t2h);

    var Kb = new Buffer(40);
    for (var i = 0; i < 20; ++i) {
        Kb[i * 2] = t1h[i];
        Kb[i * 2 + 1] = t2h[i];
    }

    return BNT.fromBuffer(Kb.reverse());
};

exports.generate_M = function(username, s, A, B, K) {
    var sha = crypto.createHash('sha1');
    sha.update(BNT.toBuffer(N).reverse());
    var Nh = new Buffer(20);
    sha.digest()
        .reverse()
        .copy(Nh);

    sha = crypto.createHash('sha1');
    sha.update(BNT.toBuffer(g));
    var gh = new Buffer(20);
    sha.digest()
        .reverse()
        .copy(gh);

    var t = new Buffer(20);
    for (var i = 0; i < 20; ++i) t[i] = Nh[i] ^ gh[i];

    var sha = crypto.createHash('sha1');
    sha.update(username);
    var uh = new Buffer(20);
    sha.digest()
        .reverse()
        .copy(uh);

    var sha = crypto.createHash('sha1');
    sha.update(t.reverse());
    sha.update(uh.reverse());
    sha.update(BNT.toBuffer(s).reverse());
    sha.update(BNT.toBuffer(A).reverse());
    sha.update(BNT.toBuffer(B).reverse());
    sha.update(BNT.toBuffer(K).reverse());

    return BNT.fromBuffer(sha.digest().reverse());
};

exports.logon_proof_response = function(A, M, K) {
    var sha = crypto.createHash('sha1');
    sha.update(BNT.toBuffer(A).reverse());
    sha.update(BNT.toBuffer(M).reverse());
    sha.update(BNT.toBuffer(K).reverse());

    var res = new Buffer(32);
    var pos = 0;

    res.writeInt8(1, pos, true);
    pos += 1;
    res.writeInt8(0, pos, true);
    pos += 1;
    sha.digest().copy(res, pos);
    pos += 20;
    res.writeUInt32LE(0x800000, pos, true);
    pos += 4;
    res.writeUInt32LE(0, pos, true);
    pos += 4;
    res.writeUInt16LE(0, pos, true);

    return res;
};

exports.from_buffer = function(buf) {
    return BNT.fromBuffer(buf);
};

exports.equals = function(a, b) {
    return a.eq(b);
};

exports.to_hex = function(a) {
    return a.toString(16);
};

exports.get_username = function(a) {
    return a.data.toString('utf-8', 33, 33 + a.data.readUInt8(32));
};

exports.get_build = function(a) {
    return a.data.readUInt16LE(10);
};

exports.get_os = function(a) {
    return a.data.readUInt32LE(16);
};

exports.get_locale = function(a) {
    return a.data.readUInt32LE(20);
};

exports.get_A = function(a) {
    return BNT.fromBuffer(a.data.slice(0, 32).reverse());
};

exports.get_m1 = function(a) {
    return BNT.fromBuffer(a.data.slice(32, 52).reverse());
};
