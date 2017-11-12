'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = new(require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var MicrosoftGraph = require('@microsoft/microsoft-graph-client');
var https = require('https');
var request = require('request');

const authInfo = {
	clientId: "ac1d2a92-fdc1-4d41-ba64-58ff0037a5b2",
	scope: "openid offline_access https://graph.microsoft.com/files.read",
	accessToken: null,
	refreshToken: null,
	redirectUri: "https://login.live.com/oauth20_desktop.srf",
	accessExpires: 0
}


module.exports = onedriveMusicLibrary;

function onedriveMusicLibrary(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;

}

onedriveMusicLibrary.prototype.onVolumioStart = function () {
	var self = this;
	var configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
	this.config = new(require('v-conf'))();
	this.config.loadFile(configFile);

	return libQ.resolve();
}

onedriveMusicLibrary.prototype.onStart = function () {
	var self = this;
	var defer = libQ.defer();
	authInfo.refreshToken = self.config.get("refreshToken");

	this.addToBrowseSources();
	this.graphClient = this.connectMSGraph();

	// Once the Plugin has successfull started resolve the promise
	defer.resolve();

	return defer.promise;
};

onedriveMusicLibrary.prototype.onStop = function () {
	var self = this;
	var defer = libQ.defer();

	// Once the Plugin has successfull stopped resolve the promise
	defer.resolve();

	return libQ.resolve();
};

onedriveMusicLibrary.prototype.onRestart = function () {
	var self = this;
	// Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

onedriveMusicLibrary.prototype.getUIConfig = function () {
	var defer = libQ.defer();
	var self = this;

	var lang_code = this.commandRouter.sharedVars.get('language_code');

	self.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
			__dirname + '/i18n/strings_en.json',
			__dirname + '/UIConfig.json')
		.then(function (uiconf) {


			defer.resolve(uiconf);
		})
		.fail(function () {
			defer.reject(new Error());
		});

	return defer.promise;
};


onedriveMusicLibrary.prototype.setUIConfig = function (data) {
	var self = this;
	//Perform your installation tasks here
};

onedriveMusicLibrary.prototype.getConf = function (varName) {
	var self = this;
	//Perform your installation tasks here
};

onedriveMusicLibrary.prototype.setConf = function (varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};

onedriveMusicLibrary.prototype.updateCredentials = function (data) {
	var self = this;

	self.logger.info("[ elmar-onedrive ] Authenticating now with this code: " + data["AuthCode"]);
	self.getNewAccessToken(data['AuthCode']).then(() => {
		// todo: check whether authentication actually succeeded, we're just assuming here...
		self.commandRouter.pushToastMessage('success', "Saved settings", "Successfully authenticated Onedrive.");
	});
};



// Playback Controls ---------------------------------------------------------------------------------------
// If your plugin is not a music_sevice don't use this part and delete it


onedriveMusicLibrary.prototype.addToBrowseSources = function () {
	var self = this;

	// self.logger.info("[ elmar-onedrive ] start adding browse-sources");

	// Use this function to add your music service plugin to music sources
	var data = {
		name: 'Onedrive',
		uri: 'onedrive',
		plugin_type: 'music_service',
		plugin_name: 'onedrive_music_library',
		icon: "fa fa-cloud"
	};
	this.commandRouter.volumioAddToBrowseSources(data);

	// self.logger.info("[ elmar-onedrive ] done adding browse-sources");
};

onedriveMusicLibrary.prototype.handleBrowseUri = function (curUri) {
	var self = this;

	self.commandRouter.logger.info(curUri);

	if (curUri.startsWith('onedrive')) {
		var promise = libQ.defer();

		var graphPath = "";
		var parentUri = "";
		if (curUri == 'onedrive') {
			graphPath = "/me/drive/root/children";
			parentUri = "/"
		} else {
			graphPath = "/me/drive/root:" + curUri.replace("onedrive", "") + ":/children";
			parentUri = curUri.split('/').slice(0, -1).join('/');
		}


		self.logger.info("[ elmar-onedrive ] looking at path: " + graphPath);

		this.graphClient.api(graphPath).get().then(
			(rootFolderItems) => {
				// self.logger.info("[ elmar-onedrive ] got the root folder!");
				// self.logger.info(JSON.stringify(rootFolderItems));

				var folderItems = [];
				var audioItems = [];
				var fileItems = [];

				for (var item of rootFolderItems["value"]) {
					// self.logger.info("[ elmar-onedrive ] " + item.name);
					if (item.folder) {
						folderItems.push({
							"type": "folder",
							"title": item.name,
							"icon": "fa fa-folder-open-o",
							"uri": curUri + "/" + item.name
						});
					} else if (item.audio) {
						audioItems.push({
							"service": "webradio",
							"type": "song",
							"title": item.name,
							"icon": "fa fa-music",
							"uri": item["@microsoft.graph.downloadUrl"],
							"artist": item.audio.artist,
							"album": item.audio.album
						});
					} else if (item.file) {
						fileItems.push({
							"service": "webradio",
							"type": "song",
							"title": item.name,
							"icon": "fa fa-music",
							"uri": item["@microsoft.graph.downloadUrl"],
						});
					}
				}

				var contents = {
					"navigation": {
						"lists": [{
								"title": "Folders",
								"icon": "fa fa-folder",
								"availableListViews": [
									"list",
									"grid"
								],
								"items": folderItems
							},
							{
								"title": "Audio Files",
								"icon": "fa fa-file-audio-o",
								"availableListViews": [
									"list",
									"grid"
								],
								"items": audioItems
							},
							{
								"title": "Other Files",
								"icon": "fa fa-files-o",
								"availableListViews": [
									"list",
									"grid"
								],
								"items": fileItems
							}
						],
						"prev": {
							"uri": parentUri
						}
					}
				}
				promise.resolve(contents);
			});
	}
	return promise;
};



// Define a method to clear, add, and play an array of tracks
onedriveMusicLibrary.prototype.clearAddPlayTrack = function (track) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::clearAddPlayTrack');

	self.commandRouter.logger.info(JSON.stringify(track));

	return self.sendSpopCommand('uplay', [track.uri]);
};

onedriveMusicLibrary.prototype.seek = function (timepos) {
	this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::seek to ' + timepos);

	return this.sendSpopCommand('seek ' + timepos, []);
};

// Stop
onedriveMusicLibrary.prototype.stop = function () {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::stop');


};

// Spop pause
onedriveMusicLibrary.prototype.pause = function () {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::pause');


};

// Get state
onedriveMusicLibrary.prototype.getState = function () {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::getState');


};

//Parse state
onedriveMusicLibrary.prototype.parseState = function (sState) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::parseState');

	//Use this method to parse the state and eventually send it with the following function
};

// Announce updated State
onedriveMusicLibrary.prototype.pushState = function (state) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'onedriveMusicLibrary::pushState');

	return self.commandRouter.servicePushState(state, self.servicename);
};


onedriveMusicLibrary.prototype.explodeUri = function (uri) {
	var self = this;
	var defer = libQ.defer();

	// Mandatory: retrieve all info for a given URI

	return defer.promise;
};

onedriveMusicLibrary.prototype.getAlbumArt = function (data, path) {

	var artist, album;

	if (data != undefined && data.path != undefined) {
		path = data.path;
	}

	var web;

	if (data != undefined && data.artist != undefined) {
		artist = data.artist;
		if (data.album != undefined)
			album = data.album;
		else album = data.artist;

		web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
	}

	var url = '/albumart';

	if (web != undefined)
		url = url + web;

	if (web != undefined && path != undefined)
		url = url + '&';
	else if (path != undefined)
		url = url + '?';

	if (path != undefined)
		url = url + 'path=' + nodetools.urlEncode(path);

	return url;
};

onedriveMusicLibrary.prototype.search = function (query) {
	var self = this;
	var defer = libQ.defer();

	// Mandatory, search. You can divide the search in sections using following functions

	return defer.promise;
};

onedriveMusicLibrary.prototype._searchArtists = function (results) {

};

onedriveMusicLibrary.prototype._searchAlbums = function (results) {

};

onedriveMusicLibrary.prototype._searchPlaylists = function (results) {


};

onedriveMusicLibrary.prototype._searchTracks = function (results) {

};

onedriveMusicLibrary.prototype.connectMSGraph = function () {
	var self = this;

	return MicrosoftGraph.Client.init({
		authProvider: (done) => {
			self.updateAccessToken().then(token => done(null, token));
		}
	});
}

/**
 * 
 * @param {string} code 
 * @param {string} grantType 
 */
onedriveMusicLibrary.prototype.getNewAccessToken = function (authorizationCode) {
	var self = this;
	var tokenUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

	var promise = libQ.defer();

	var postBody = "client_id=" + encodeURIComponent(authInfo.clientId) +
		"&scope=" + encodeURIComponent(authInfo.scope) +
		"&code=" + encodeURIComponent(authorizationCode) +
		"&redirect_uri=" + encodeURIComponent(authInfo.redirectUri) +
		"&grant_type=" + encodeURIComponent("authorization_code");

	// self.logger.info("[ elmar-onedrive ] post: " + postBody);

	request.post(tokenUrl, {
			body: postBody,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		},
		(error, response, responseBody) => {
			// self.logger.info("[ elmar-onedrive ] response-body is: " + responseBody);
			// self.logger.info("[ elmar-onedrive ] response is: " + response);
			// self.logger.info("[ elmar-onedrive ] error is: " + error);
			var tokenResponse = JSON.parse(responseBody);
			authInfo.accessToken = tokenResponse.access_token;
			authInfo.refreshToken = tokenResponse.refresh_token;
			authInfo.accessExpires = Date.now() + (tokenResponse.expires_in * 1000);
			self.config.set("refreshToken", tokenResponse.refresh_token);
			promise.resolve(tokenResponse.access_token);
		});

	return promise;
}

onedriveMusicLibrary.prototype.refreshAccessToken = function () {
	var self = this;
	var tokenUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

	var promise = libQ.defer();

	var postBody = "client_id=" + encodeURIComponent(authInfo.clientId) +
		"&scope=" + encodeURIComponent(authInfo.scope) +
		"&refresh_token=" + encodeURIComponent(authInfo.refreshToken) +
		"&redirect_uri=" + encodeURIComponent(authInfo.redirectUri) +
		"&grant_type=" + encodeURIComponent("refresh_token");

	// self.logger.info("[ elmar-onedrive ] post: " + postBody);

	request.post(tokenUrl, {
			body: postBody,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		},
		(error, response, responseBody) => {
			// self.logger.info("[ elmar-onedrive ] response-body is: " + responseBody);
			// self.logger.info("[ elmar-onedrive ] response is: " + response);
			// self.logger.info("[ elmar-onedrive ] error is: " + error);
			var tokenResponse = JSON.parse(responseBody);
			authInfo.accessToken = tokenResponse.access_token;
			authInfo.refreshToken = tokenResponse.refresh_token;
			authInfo.accessExpires = Date.now() + (tokenResponse.expires_in * 1000);
			self.config.set("refreshToken", tokenResponse.refresh_token);
			promise.resolve(tokenResponse.access_token);
		});
	return promise;
}

onedriveMusicLibrary.prototype.updateAccessToken = function () {
	var self = this;

	// self.logger.info("[ elmar-onedrive ] update access token (Current time: " + Date.now().toString() + ", expiration time: " + authInfo.accessExpires.toString() + ")");

	if (authInfo.refreshToken) {
		if (Date.now() < authInfo.accessExpires) {
			// We still have a valid access token
			return libQ.resolve(authInfo.accessToken);
		}

		self.logger.info("[ elmar-onedrive ] refreshing access token");
		return self.refreshAccessToken();
	} else {
		self.commandRouter.pushToastMessage('error', "Need new authorization", "Onedrive is no longer signed in. Go to settings page to get new authorization token.");
	}
}