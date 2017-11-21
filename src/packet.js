var Packet = function(buff, size)
{
    this.buffer = new Buffer(size);
    buff.copy(this.buffer, 0, 0, size);
    this.data = this.buffer.slice(1);

    this.opcode = this.buffer.readUInt8(0);
    this.length = this.buffer.length;
};

Packet.prototype.toString = function()
{
    return "[(opcode: " + this.opcode + ") (size: " + this.length + ")] " + this.data.toString('hex');
};

exports.Build = function(data)
{
    if (!data.length)
        return null;

    var opcode = data.readUInt8(0);
    var payload = data.slice(1);

    var size = -1;

    switch (opcode)
    {
        case 0x00: // logon_challenge
        case 0x02: // reconnect_challenge
            if (payload.length < 3) break;
            size = payload.readUInt16LE(1) + 3;
            break;
        case 0x01: size = 74; break; // logon_proof
        case 0x03: size = 57; break; // reconnect_proof
        case 0x10: size = 4; break; // realmlist
        default:
            throw new Error('Invalid Opcode (' + opcode + ')');
    }

    if (size >= 0 && data.length >= (size + 1))
        return new Packet(data, size + 1); // + opcode

    return null;
};
