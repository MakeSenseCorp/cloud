// Import section
var express     	= require('express');
var bodyParser  	= require('body-parser')
var http            = require('http');
var path        	= require('path');
var os        		= require('os');

function MkSWebface (webfaceInfo) {
	var self = this;
	// Static variables section
	this.ModuleName 		= "[Webface]#";
	this.RestAPIPort 		= webfaceInfo.RestAPIPort;
	this.RestApi 			= express();
	this.Database 			= null;
	this.Cloud 				= null;
	
	this.RestApi.use(bodyParser.json());
	this.RestApi.use(bodyParser.urlencoded({ extended: true }));

	this.RestApi.use(function(req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});

	console.log(self.ModuleName, "Network List\n", os.networkInterfaces());
	
	this.RestApi.use(express.static(path.join(__dirname, 'public')));
	this.RestApiServer = this.RestApi.listen(this.RestAPIPort, function () {
		console.log(self.ModuleName, "RESTApi running on port", self.RestApiServer.address().port);
	});
	this.InitRouter(this.RestApi);
}

MkSWebface.prototype.SetCloudInstance = function (cloud) {
	this.Cloud = cloud;
}

MkSWebface.prototype.IsUserCacheExist = function (key) {
	// TODO - Websocket request to Gateway
	return false;
}

MkSWebface.prototype.InitRouter = function (server) {
	var self = this;
	
	server.post('/api/get/nodes', function(req, res) {
		console.log(self.ModuleName, "/api/get/nodes");
		if (req.body.data != undefined) {
			var user_id  = req.body.data.user_id;
			var user_key = req.body.data.key;
			nodes = self.Cloud.GetNodesByKey(user_key);
			res.json({error:"none", nodes: {
				status: "OK",
				data: nodes
			}});
		} else {
			res.json({error:"no post params"});
		}
	});
	
	server.get('/api/get/cache/users', function(req, res) {
		console.log(self.ModuleName, "/api/get/cache/users");
		// TODO - Websocket request to Gateway
	});
	
	server.post('/api/login', function(req, res) {
		console.log(self.ModuleName, "/api/login");
		
		if (req.body.data != undefined) {
			var user = req.body.data.user;
			var pwd  = req.body.data.pwd;
			
			// TODO - Websocket request to Gateway
		}
	});
	
	server.post('/api/signup/', function(req, res) {
		console.log(self.ModuleName, "/api/signup");
		
		if (req.body.data != undefined) {
			var user = req.body.data.user;
			var pwd  = req.body.data.pwd;
			
			// TODO - Websocket request to Gateway
		}
	});
}

function WebfaceFactory () {
    return MkSWebface;
}

module.exports = WebfaceFactory;
