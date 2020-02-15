function MkSProtocol (cloudInfo) {
	var self = this;
	// Static variables section
    this.ModuleName     = "Protocol-MKS#";
    this.Template       = {
        header: {
            message_type: "",
            destination: "",
            source: "",
            direction: ""
        },
        data: {
            header: {
                command: "",
                timestamp: 0
            },
            payload: { }
        },
        user: {
            key: ""
        },
        additional: { },
        piggybag: { }
    }
	
	return this;
}

MkSProtocol.prototype.GenerateRequest = function(info) {
    var packet = JSON.parse(JSON.stringify(this.Template));;
    packet.header.message_type      = info.message_type;
    packet.header.destination       = info.destination;
    packet.header.source            = info.source;
    packet.header.direction         = "request";

    packet.data.header.command      = info.command;
    packet.data.header.timestamp    = 0;

    packet.data.payload             = info.payload;

    packet.user.key                 = info.key;
    packet.additional               = info.additional;
    packet.piggybag                 = info.piggybag;

    return packet;
}

function ProtocolMKSFactory () {
    return MkSProtocol;
}

module.exports = ProtocolMKSFactory;