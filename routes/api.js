var mongoose = require('mongoose');
var https    = require('https');
var Users    = mongoose.model('Users');
var core     = require('../core.js');


// Get user info stored in db
exports.user = function(req, res) {
  Users.findOne({'user_name': req.params.user }, function(err, user) {
      if (user)
        return res.json(user);
      else
        return res.json({
          err: true,
          msg: "User not found."
        })
    })
};


// Update number of followers, notify user and return changes.
exports.followers = function(req, res) {

  // Use access token if profided
  var url = "/users/" + req.params.user + "/followers"
  // if (accessToken) url += "?access_token=" + accessToken

  var options = {
    host: "api.github.com",
    path: url,
    method: "GET",
    headers: { "User-Agent": "github-balance" }
  };

  var request = https.request(options, function(response){
    var body = '';
    response.on("data", function(chunk){ body+=chunk.toString("utf8"); });
    response.on("end", function(){
      var json = JSON.parse(body);

      // Provide response
      res.json({no: json.length});

      // Compare with old value and notify if changes occur
      Users.findOne({'user_name': req.params.user}, function(err, user) {
        var msg, diff = user.followers_no - json.length;
        if (diff > 0) msg = "lost " + diff;
        else if (diff < 0) msg = -(diff) + " new";

        // Notify user only if we have some action going on
        if (diff != 0) {
          new Notifications({
            src:    "",
            dest:   user.user_name,
            type:   "followers_no",
            link:   msg
          }).save(function(err, todo, count ) {
            if (err) console.log("[ERR] Notification not sent.");
          });

          var conditions = {'user_name': user.user_name};
          var update = {$set: {'unread': true}};
          Users.update(conditions, update).exec();
        }
      });

      // Update user info
      var conditions = {'user_name': req.params.user};
      var update = {$set: {'followers_no': json.length}};
      Users.update(conditions, update).exec();
    });
  });
  request.end();
};


// Update number of following users, notify user and return changes.
exports.following = function (req, res) {

  // Use access token if profided
  var url = "/users/" + req.params.user + "/following"
  // if (accessToken) url += "?access_token=" + accessToken

  var options = {
    host: "api.github.com",
    path: url,
    method: "GET",
    headers: { "User-Agent": "github-balance" }
  };

  var request = https.request(options, function(response){
    var body = '';
    response.on("data", function(chunk){ body+=chunk.toString("utf8"); });
    response.on("end", function(){
      var json = JSON.parse(body);

      // Provide response
      res.json({no: json.length});

      Users.findOne({'user_name': req.params.user}, function(err, user) {
        var msg, diff = user.following_no - json.length;
        if (diff > 0) msg = "lost " + diff;
        else if (diff < 0) msg = -(diff) + " new";

        // Notify user only if we have some action going on
        if (diff != 0) {
          new Notifications({
            src:    "",
            dest:   user.user_name,
            type:   "following_no",
            link:   msg
          }).save(function(err, todo, count ) {
            if (err) console.log("[ERR] Notification not sent.");
          });

          var conditions = {'user_name': user.user_name};
          var update = {$set: {'unread': true}};
          Users.update(conditions, update).exec();
        }
      });

      // Update user info
      var conditions = {'user_name': req.params.user};
      var update = {$set: {'following_no': json.length}};
      Users.update(conditions, update).exec();
    });
  });
  request.end();
}