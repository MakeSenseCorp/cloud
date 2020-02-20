const Cloud 	= require('./cloud.js')();
const Webface 	= require('./webface.js')();

// Params for webface instance
var WebfaceInfo = {
	"RestAPIPort": 80
};
// Params for gateway instance
var CloudInfo = {
	"GatewayWebSocket": 443,
	"WebfaceWebSocket": 8080,
	"CloudRestApi":	85
};

// Create cloud instance
var cloud = new Cloud(CloudInfo);
// Create webface instance
var webface = new Webface(WebfaceInfo);

// Set webface with cloud instance
webface.SetCloudInstance(cloud);
// Start cloud
cloud.Start();
