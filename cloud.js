// Import section
var express     	= require('express');
var bodyParser  	= require('body-parser')
var WebSocketServer = require('websocket').server;
var http            = require('http');
var protocol 		= require('./protocol-mks.js')();

function GatewaySession (sock) {
	self = this;
	
	this.Socket = sock;
	
	return this;
}

function WebfaceSession (sock) {
	self = this;
	
	this.Socket 	= sock;
	this.UserKey 	= "";
	
	return this;
}

function MkSCloud (cloudInfo) {
	var self = this;
	this.Protocol 				= new protocol({});
	// Static variables section
	this.ModuleName 			= "[Cloud]#";
	this.GatewayWebsocketPort 	= cloudInfo.GatewayWebSocket;
	this.WebfaceWebsocketPort 	= cloudInfo.WebfaceWebSocket;
	this.RestAPIPort 			= cloudInfo.CloudRestApi;

	this.GatewayNodeList 		= {}; // Map UserKey -> [] (List of nodes registered in gateway's local database)

	this.WSGatewayClients 		= [];
	this.WSWebfaceClients 		= [];

	this.GatewayServer			= null;
	this.WebfaceServer 			= null;

	this.WSGateway				= null;
	this.WSWebface				= null;

	this.RestApi 				= express();
	this.Database 				= null;
	this.GatewayList			= {}; 
	this.WebfaceList			= {}; // For each key this structure have WebfaceSession instance
	this.WebfaceIndexer 		= 0;
	
	// Monitoring
	this.KeepaliveMonitor		= 0;
	
	this.RestApi.use(bodyParser.json());
	this.RestApi.use(bodyParser.urlencoded({ extended: true }));

	this.RestApi.use(function(req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});
	
	this.RestApiServer = this.RestApi.listen(this.RestAPIPort, function () {
		console.log(self.ModuleName, "RESTApi running on port", self.RestApiServer.address().port);
	});
	this.InitRouter(this.RestApi);
	
	// Each 10 minutes send keepalive packet
	this.KeepaliveMonitor = setInterval(this.KeepAliveMonitorHandler.bind(this), 10 * 60 * 1000);

	// Each 10 second print connected sessions
	this.SessionsMonitor = setInterval(this.SessionsMonitorHandler.bind(this), 10 * 1 * 1000);
	
	return this;
}

MkSCloud.prototype.InitRouter = function (server) {
	var self = this;
}

MkSCloud.prototype.KeepAliveMonitorHandler = function () {
	console.log(this.ModuleName, "KeepAliveMonitorHandler");
}

MkSCloud.prototype.SessionsMonitorHandler = function () {
	console.log(this.ModuleName, "Gateway Connected Sessions:");
	for (key in this.GatewayList) {
		var gateways = this.GatewayList[key];
		for (var i = 0; i < gateways.length; i++) {
			gateway = gateways[i];
			console.log(this.ModuleName, "\t", key, gateway.Socket.ws_handler);
		}
	}

	var toDelete = [];
	console.log(this.ModuleName, "Application Connected Sessions:");
	for (key in this.WebfaceList) {
		var app = this.WebfaceList[key];
		if (app.UserKey == "") {
			toDelete.push(key);
		}

		if (app === undefined || app == null) {

		} else {
			console.log(this.ModuleName, "\t", app.UserKey, app.Socket.ws_handler);
		}
	}

	for (key in toDelete) {
		delete this.WebfaceList[key];
	}
}

MkSCloud.prototype.Monitor = function() {
	if (this.GatewayList !== undefined) {
		console.log("Gatwaysession list count", this.GatewayList.length);
	}
	 setTimeout(this.Monitor, 1000);
}

MkSCloud.prototype.GetNodesByKey = function(key) {
	var gatewayNodes 	= this.GatewayNodeList[key];
	var nodes 			= [];

	for (var gateway in gatewayNodes) {
		nodeList = gatewayNodes[gateway];
		if (nodeList === undefined || nodeList == null) {

		} else {
			console.log(nodeList);
			nodes = nodes.concat(nodeList.nodes);
		}
	}

	return nodes;
}

MkSCloud.prototype.WebfaceHandshakeRequestToGatewayByKey = function(key, handler) {
	var gatewaySessions = this.GatewayList[key];
	if (gatewaySessions === undefined) {
		return false;
	}

	var packet = this.Protocol.GenerateRequest({
		message_type: "HANDSHAKE",
		destination: "GATEWAY",
		source: "CLOUD",
		command: "webface_new_connection",
		payload: { },
		key: key,
		additional: { },
		piggybag: {
			cloud: {
				handler: handler
			}
		}
	});

	console.log(this.ModuleName, "Cloud -> Gateway", key, packet);
	for (var idx = 0; idx < gatewaySessions.length; idx++) {
		console.log(this.ModuleName, "Cloud -> Gateway", key, gatewaySessions[idx].Socket.ws_handler);
		gatewaySessions[idx].Socket.send(JSON.stringify(packet));
	}

	return true;
}

MkSCloud.prototype.SendPacketToGatewaysByKey = function(key, command, payload, additional, piggybag) {
	var gatewaySessions = this.GatewayList[key];
	if (gatewaySessions === undefined) {
		return false;
	}

	var packet = this.Protocol.GenerateRequest({
		message_type: "DIRECT",
		destination: "GATEWAY",
		source: "CLOUD",
		command: "command",
		payload: payload,
		key: key,
		additional: additional,
		piggybag: piggybag
	});

	for (var idx = 0; idx < gatewaySessions.length; idx++) {		
		gatewaySessions[idx].Socket.send(JSON.stringify(packet));
	}

	return true;
}

MkSCloud.prototype.ProxyPacketToGateway = function(key, packet) {
	console.log(this.ModuleName, "Proxy message", key);
	var gatewaySessions = this.GatewayList[key];
	for (var idx = 0; idx < gatewaySessions.length; idx++) {
		console.log(this.ModuleName, "Cloud -> Gateway", key, gatewaySessions[idx].Socket.ws_handler);
		gatewaySessions[idx].Socket.send(JSON.stringify(packet));
	}
}

MkSCloud.prototype.ProxyPacketToWebface = function(key, message) {

}

MkSCloud.prototype.Start = function () {
	var self = this;
	
	// Create listener server
	this.GatewayServer = http.createServer(function(request, response) {
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
		response.setHeader('Access-Control-Allow-Headers', 'Content-Type');		
	});
	
	this.WebfaceServer = http.createServer(function(request, response) {
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
		response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	});

	// Set listening port and start listener
	this.GatewayServer.listen(this.GatewayWebsocketPort, function() {
		console.log(self.ModuleName, "Gateway websocket server running on port", self.GatewayServer.address().port);
	});
	
	this.WebfaceServer.listen(this.WebfaceWebsocketPort, function() {
		console.log(self.ModuleName, "Webface websocket server running on port", self.WebfaceServer.address().port);
	});

	// Create new websocket server running on top of created server
	this.WSGateway = new WebSocketServer({
		httpServer: this.GatewayServer
	});
	
	this.WSWebface = new WebSocketServer({
		httpServer: this.WebfaceServer
	});
	
	// Register application websocket.
	this.WSWebface.on('request', function(request) {
		// Accept new connection request
		var connection 		  = request.accept('echo-protocol', request.origin);
		connection.ws_handler = self.WSWebfaceClients.push(connection) - 1;

		console.log("DEBUG [NEW SOCK]", connection.ws_handler);
		self.WebfaceList[connection.ws_handler] = new WebfaceSession(connection);
		connection.on('message', function(message) {
			if (message.type === 'utf8') {
				jsonData = JSON.parse(message.utf8Data);

				console.log("\n", self.ModuleName, "Webface -> Cloud", jsonData, "\n");
				if (jsonData.header === undefined) {
					console.log(self.ModuleName, (new Date()), "Invalid request ...");
					return;
				}

				if (jsonData.header.message_type === undefined) {
					console.log(self.ModuleName, (new Date()), "Invalid request ...");
					return;
				}
				
				if ("HANDSHAKE" == jsonData.header.message_type) {
					// Store userkey of this session. LAter will be used to identify gateawy.
					console.log(self.ModuleName, "Webface -> Cloud [HANDSHAKE]", connection.ws_handler);
					self.WebfaceList[connection.ws_handler].UserKey = jsonData.user.key;
					self.WebfaceHandshakeRequestToGatewayByKey(jsonData.user.key, connection.ws_handler);
				} else {
					jsonData.piggybag.cloud = {
						handler: connection.ws_handler
					};
	
					console.log(self.ModuleName, "Webface -> Cloud [PROXY]");
					jsonData.stamping.push("cloud_t");
					self.ProxyPacketToGateway(self.WebfaceList[connection.ws_handler].UserKey, jsonData);
				}
			}
		});
		
		connection.on('close', function(conn) {
			console.log("DEBUG [REMOVE SOCK]", connection.ws_handler);
			// Remove application session
			console.log (self.ModuleName, (new Date()), "Unregister application session:", 
				self.WebfaceList[connection.ws_handler].UserKey, 
				self.GatewayList.hasOwnProperty(self.WebfaceList[connection.ws_handler].UserKey));
			if (self.GatewayList.hasOwnProperty(self.WebfaceList[connection.ws_handler].UserKey)) {
				var gatewaySessions = self.GatewayList[self.WebfaceList[connection.ws_handler].UserKey];
				if (gatewaySessions !== undefined) {
					for (var idx = 0; idx < gatewaySessions.length; idx++) {
						console.log (self.ModuleName, "Cloud -> Gateway [REMOVE WEBFACE]", connection.ws_handler);
						gatewaySessions[idx].Socket.send(JSON.stringify({
							header: {
								message_type: "DIRECT",
								destination: "GATEWAY",
								source: "CLOUD",
								direction: "request"
							},
							data: {
								header: {
									command: "webface_remove_connection",
									timestamp: 0
								},
								payload: {	}
							},
							user: {
								key: self.WebfaceList[connection.ws_handler].UserKey
							},
							additional: {
								cloud: {
									handler: connection.ws_handler
								}
							},
							piggybag: {
								identifier: 0
							}
						}));
					}
				}
			}

			delete self.WebfaceList[connection.ws_handler];

			if (connection.ws_handler !== undefined) {
				// Removing connection from the list.
				self.WSWebfaceClients.splice(connection.ws_handler, 1); // Consider to remove this list, we have a connections map.
			}
		});
	});

	// Register node websocket to request event
	this.WSGateway.on('request', function(request) {
		// Accept new connection request
		var connection 			= request.accept('echo-protocol', request.origin);
		connection.ws_handler 	= self.WSGatewayClients.push(connection) - 1;

		console.log("\n", self.ModuleName, request.httpRequest.headers, "\n");
		connection.on('message', function(message) {
			if (message.type === 'utf8') {
				connection.LastMessageData = message.utf8Data;
				jsonData = JSON.parse(message.utf8Data);
				
				console.log("\n", self.ModuleName, "Gateway -> Cloud", jsonData, "\n");
				if (jsonData.header === undefined) {
					console.log(self.ModuleName, (new Date()), "Invalid request ...");
					connection.close();
					return;
				}

				if (jsonData.header.message_type === undefined) {
					console.log(self.ModuleName, (new Date()), "Invalid request ...");
					connection.close();
					return;
				}

				if ("HANDSHAKE" == jsonData.header.message_type) {
					if (request.httpRequest.headers.userkey === undefined || jsonData.user.key === undefined) {
						console.log(self.ModuleName, (new Date()), "Invalid HANDSHAKE request ...");
						connection.close();
						return;
					}

					if (request.httpRequest.headers.userkey != jsonData.user.key) {
						console.log(self.ModuleName, (new Date()), "Invalid HANDSHAKE request ...");
						connection.close();
						return;
					}

					console.log(self.ModuleName, (new Date()), "Register new gateway session:", jsonData.user.key);
					// Save user key in this request, will be used to delete user from list
					request.httpRequest.headers.userkey = jsonData.user.key;
					// Get all session for this key
					var sessionList = self.GatewayList[jsonData.user.key];
					// Is this key exist in cloud?
					if (undefined === sessionList) {
						// Allocate list for this new key
						sessionList = []
					}

					// Append new webface session to the list
					sessionList.push(new GatewaySession(connection));
					self.GatewayList[jsonData.user.key] = sessionList;

					var gatewayNodes = self.GatewayNodeList[jsonData.user.key];
					if (undefined === gatewayNodes) {
						gatewayNodes = { };
					}

					jsonData.data.payload.ws_handler = connection.ws_handler;
					gatewayNodes[connection.ws_handler] = jsonData.data.payload;
					self.GatewayNodeList[jsonData.user.key] = gatewayNodes;
					// Save gateway's node to this request.
					request.httpRequest.headers.nodes = jsonData.data.payload;

					// Respond to Gatway with HANDSHAKE message
					var packet = {
						header: {
							message_type: "HANDSHAKE",
							destination: "GATEWAY",
							source: "CLOUD",
							direction: "response"
						},
						data: {
							header: {
								command: "",
								timestamp: 0
							},
							payload: {	}
						},
						user: {
							key: jsonData.user.key
						},
						piggybag: {
							identifier: 0
						}
					}
					connection.send(JSON.stringify(packet));
				} else {
					if (jsonData.header.destination == "CLOUD") {
						switch (jsonData.data.header.command) {
							case "update_node_list": {
								if (self.GatewayNodeList.hasOwnProperty(jsonData.user.key)) {
									var gatewayNodes = self.GatewayNodeList[jsonData.user.key];
									if (gatewayNodes === undefined) {
										console.log (self.ModuleName, (new Date()), "[update_node_list] No data for this handler -", connection.ws_handler);
									} else {
										gatewayNodes[connection.ws_handler] = jsonData.data.payload;
									}
								}
								break;
							}
							default:
								break;
						}
					} else {
						// TODO - Develope gateway to webface
						if (jsonData.piggybag.cloud !== undefined && jsonData.piggybag.cloud != null) {
							var session = self.WebfaceList[jsonData.piggybag.cloud.handler];
							if (session !== undefined && session != null) {
								self.WebfaceList[jsonData.piggybag.cloud.handler].Socket.send(message.utf8Data);
							} else {
								console.log(self.ModuleName, (new Date()), "[ERROR - Proxy to Cloud] - Session is undefined", jsonData);
							}
						} else {
							console.log(self.ModuleName, (new Date()), "[ERROR - Proxy to Cloud] - Cloud data undefined", jsonData);
						}
					}
				}
			}
		});

		connection.on('close', function(conn) {
			// Remove application session
			console.log (self.ModuleName, (new Date()), "Unregister gateway session:", request.httpRequest.headers.userkey);
			if (self.GatewayNodeList.hasOwnProperty(request.httpRequest.headers.userkey)) {
				var gatewayNodes = self.GatewayNodeList[request.httpRequest.headers.userkey];
				if (gatewayNodes === undefined) {
					console.log (self.ModuleName, (new Date()), "Unregister gateway session: No data for this handler -", connection.ws_handler);
				} else {
					delete gatewayNodes[connection.ws_handler];
					self.GatewayNodeList[request.httpRequest.headers.userkey] = gatewayNodes;
				}
			}

			// Remove gateway from list of gateways for this user key
			var sessionList = self.GatewayList[request.httpRequest.headers.userkey];
			var idxToDelete = -1;
			if (sessionList != null && sessionList !== undefined) {
				for (var i = 0; i < sessionList.length; i++) {
					if (sessionList[i].Socket.ws_handler == connection.ws_handler) {
						idxToDelete = i;
						break;
					}
				}
				if (idxToDelete > -1) {
					sessionList.splice(idxToDelete, 1);
					self.GatewayList[jsonData.user.key] = sessionList;
				}
			}

			if (connection.ws_handler !== undefined) {
				// Removing connection from the list.
				self.WSWebfaceClients.splice(connection.ws_handler, 1); // Consider to remove this list, we have a connections map.
			}
		});
	});
}

function CloudFactory () {
    return MkSCloud;
}

module.exports = CloudFactory;
