// Import section
var express     	= require('express');
var bodyParser  	= require('body-parser')
var WebSocketServer = require('websocket').server;
var http            = require('http');

function GatewaySession (sock) {
	self = this;
	
	this.Socket = sock;
	
	return this;
}

function WebfaceSession (sock) {
	self = this;
	
	this.Socket = sock;
	
	return this;
}

function MkSCloud (cloudInfo) {
	var self = this;
	// Static variables section
	this.ModuleName 			= "[Cloud]#";
	this.GatewayWebsocketPort 	= cloudInfo.GatewayWebSocket;
	this.WebfaceWebsocketPort 	= cloudInfo.WebfaceWebSocket;
	this.RestAPIPort 			= cloudInfo.CloudRestApi;

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
	
	return this;
}

MkSCloud.prototype.InitRouter = function (server) {
	var self = this;
}

MkSCloud.prototype.FindSessionBySocket = function (socket) {
	for (var key in this.WebfaceList) {
		var sessions = this.WebfaceList[key];
		if (undefined !== sessions) {
			for (idx = 0; idx < sessions.length; idx++) {
				session = sessions[idx];
				if (socket == session.Socket)
					return session;
			}
		}
	}
	
	return null;
}

MkSCloud.prototype.KeepAliveMonitorHandler = function () {
	console.log(this.ModuleName, "KeepAliveMonitorHandler");
	
}

MkSCloud.prototype.RouteMessageToGateway = function (packet) {

}

MkSCloud.prototype.RouteMessageToWebface = function (packet) {
	
}

MkSCloud.prototype.Monitor = function() {
	if (this.GatewayList !== undefined) {
		console.log("Gatwaysession list count", this.GatewayList.length);
	}
	 setTimeout(this.Monitor, 1000);
}

MkSCloud.prototype.Start = function () {
	var self = this;
	//this.Monitor();
	
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
		var connection = request.accept('echo-protocol', request.origin);
		var wsHandle   = self.WSWebfaceClients.push(connection) - 1;

		self.WebfaceIndexer += 1;
		connection.WebfaceIndexer = self.WebfaceIndexer;
		
		connection.on('message', function(message) {
			if (message.type === 'utf8') {
				connection.LastMessageData = message.utf8Data;
				jsonData = JSON.parse(message.utf8Data);
				
				console.log("\n", self.ModuleName, "Webface -> Cloud", jsonData, "\n");
				if ("HANDSHAKE" == jsonData.header.message_type) {
					console.log(self.ModuleName, (new Date()), "Register new application session:", jsonData.key);
					// Save user key in this request, will be used to delete user from list
					request.httpRequest.headers.UserKey = jsonData.key;
					// Get all session for this key
					var sessionList = self.WebfaceList[jsonData.key];
					// Is this key exist in cloud?
					if (undefined === sessionList) {
						// Allocate list for this new key
						sessionList = []
					}

					// Append new webface session to the list
					sessionList.push(new WebfaceSession(connection));
					self.WebfaceList[jsonData.key] = sessionList;
				} else {

				}
			}
		});
		
		connection.on('close', function(conn) {
			// Remove application session
			console.log (self.ModuleName, (new Date()), "Unregister application session:", request.httpRequest.headers.UserKey);
			// Get all sessions for this key
			var sessions = self.WebfaceList[request.httpRequest.headers.UserKey];
			if (undefined !== sessions) {
				for (idx = 0; idx < sessions.length; idx++) {
					session = sessions[idx];
					// Is this session we looking for?
					if (session.Socket == connection) {
						// Send messages to gateway about webface session disconnection
						for (var key in self.NodeList) {
							var item = self.NodeList[key];
							var packet = {
								header: {
									message_type: "DIRECT",
									destination: "GATEWAY",
									source: "CLOUD",
									direction: "request"
								},
								data: {
									header: {
										command: "unregister_on_node_change",
										timestamp: 0
									},
									payload: {
										"webface_indexer": connection.WebfaceIndexer,
										"user_key": key
									}
								},
								user: {
									key: { }
								},
								additional: { },
								piggybag: {
									identifier: 0
								}
							}
							item.Socket.send(JSON.stringify(packet));
						}
						sessions.splice(idx, 1);
						self.WebfaceList[request.httpRequest.headers.UserKey] = sessions;
						continue;
					}
				}
			}
			// Removing connection from the list.
			self.WSWebfaceClients.splice(wsHandle, 1); // Consider to remove this list, we have a connections map.
		});
	});

	// Register node websocket to request event
	this.WSGateway.on('request', function(request) {
		// Accept new connection request
		var connection = request.accept('echo-protocol', request.origin);
		var wsHandle   = self.WSGatewayClients.push(connection) - 1;

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
				}
			}
		});

		connection.on('close', function(conn) {
			// Remove application session
			console.log (self.ModuleName, (new Date()), "Unregister gateway session:", request.httpRequest.headers.userkey);
			// Get all sessions for this key
			var sessions = self.WebfaceList[request.httpRequest.headers.UserKey];
			if (undefined !== sessions) {
				for (idx = 0; idx < sessions.length; idx++) {
					session = sessions[idx];
					// Is this session we looking for?
					if (session.Socket == connection) {
						// Do something with disconnected session
						sessions.splice(idx, 1);
						self.WebfaceList[request.httpRequest.headers.UserKey] = sessions;
						continue;
					}
				}
			}
			// Removing connection from the list.
			self.WSWebfaceClients.splice(wsHandle, 1); // Consider to remove this list, we have a connections map.
		});
	});
}

function CloudFactory () {
    return MkSCloud;
}

module.exports = CloudFactory;
