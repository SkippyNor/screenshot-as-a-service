var utils = require('../lib/utils');
var join = require('path').join;
var fs = require('fs');
var request = require('request');
var spawn = require('child_process').spawn;

module.exports = function(app) {
  app.get('/', function(req, res, next) {
    if (!req.param('url', false)) {
      return res.redirect('/usage.html');
    }
    var url = utils.url(req.param('url'));
    var rasterizerService = app.settings.rasterizerService;
    var useCaching = rasterizerService.getCache();

    // required options
    var options = {
      uri: 'http://localhost:' + rasterizerService.getPort() + '/',
      headers: { url: url }
    };
    ['width', 'height', 'clipRect', 'javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password'].forEach(function(name) {
      if (req.param(name, false)) options.headers[name] = req.param(name);
    });

    var id = utils.md5(url) + "_" + utils.md5(JSON.stringify(options));
    var filename = id + '.png';
    var path = join(rasterizerService.getPath(), filename);

    options.headers.filename = filename;


    if (useCaching) {
      try {
        if (fs.lstatSync(path).isFile()) {
            res.sendfile(path);
            return;
        }
      }
      catch(e) {

      }
    }

    console.log('screenshot - rasterizing %s', url);

    if (req.param('callback', false)) {
      // asynchronous
      var callback = utils.url(req.param('callback'));
      res.send('Will post screenshot of ' + url + ' to ' + callback + ' when processed');
      request.get(options, function(err) {
        // FIXME: call the callback with an error
        if (err) {
          console.log(err.message);
          rasterizerService.restartService();
          return;
        }
        console.log('screenshot - streaming to %s', callback);
        var fileStream = fs.createReadStream(path);
        fileStream.on('end', function() {
          if (!useCaching) {
            fs.unlink(path);
          }
        });
        fileStream.on('error', function(err){
          console.log('Error handled in file reader: %s', err.message);
        });
        fileStream.pipe(request.post(callback, function(err) {
          if (err) console.log('Error while streaming screenshot: %s', err);
        }));
      });
    } else {
      // synchronous
      request.get(options, function(error, response, body) {
        if (error || response.statusCode != 200) {
          return next(new Error(body));
        }

        console.log('screenshot - sending response ', path);

        res.sendfile(path, function(err) {
          if (!useCaching) {
            fs.unlink(path);
          }
        });
      });
    }
  });

  app.get('*', function(req, res, next) {
    // for backwards compatibility, try redirecting to the main route if the request looks like /www.google.com
    res.redirect('/?url=' + req.url.substring(1));
  });
};