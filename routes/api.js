var mongoose = require('mongoose');
var https    = require('https');
var Repo     = mongoose.model('Repo');
var Users    = mongoose.model('Users');
var core     = require('../core.js');
var MACRO    = require('../model/macro.js');
var Notifications = mongoose.model('Notifications');


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


// Get logs for repo
exports.logs = function(req, res) {
  Users.findOne({'user_name': req.params.user }, function(err, user) {
    if (!user) return res.json({err: true, msg: "User not found."})

    for (r in user.repos) {
      if (user.repos[r].name == req.params.repo) {
        // Some bug makes zero points for some repos.
        // We have to recompute score here.
        if (user.repos[r].closed_pulls != 0) {
          pullrq_value = MACRO.USER.PULL + MACRO.USER.STAR * user.repos[r].stars
          total_points = user.repos[r].closed_pulls * pullrq_value
        } else {
          total_points = user.repos[r].points
        }

        return res.json({
          'name':   req.params.repo,
          'pulls':  user.repos[r].closed_pulls,
          'points': total_points
        })
      }
    }

    // Repo not ready yet
    return res.json({'name': null})
  })
}


// Get repos info
exports.repos = function(req, res) {

  // Use access token if user is logged in
  var url = "/users/" + req.params.user + "/repos"
  if (req.session.auth)
    url += "?access_token=" + req.session.auth.github.accessToken

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

      // API calls limit exceded
      if (response.statusCode == 403) return

      var json = JSON.parse(body);
      var json_back = JSON.parse(body);
      var repos_back = [];
      var sum = 0; // sum of all new watcher, forks points

      // Provide quick response
      res.json(json)

      // get current info if available
      Users.findOne({'user_name': req.params.user}, function(err, user) {
        if (user) repos_back = user.repos.slice(0);
        else return

        for (var k in json) {
          var points = 0; // total points          

          if ({}.hasOwnProperty.call(json, k) && !json[k].private) {

            for (var y in user.repos) {
              repos_back[y] = {}

              if (json[k].name == user.repos[y].name) {
                // remove processed repos from backup
                json_back[k].name = '';
                repos_back[y].name = null;

                // check fork_count
                var msg, diff = json[k].forks_count - user.repos[y].forks_count;
                if (diff > 0) msg = "got " + diff + " new";
                else if (diff < 0) msg = "lost " + -(diff);
                sum += diff * MACRO.USER.FORK;
                if (diff != 0) {
                  new Notifications({
                    src:    json[k].name,
                    dest:   user.user_name,
                    type:   "fork_count",
                    seen:   false,
                    date:   Date.now(),
                    link:   msg
                  }).save(function(err, todo, count) {
                    if (err) console.log("[ERR] Notification not sent.");
                  });
                }

                // check watchers_count
                diff = json[k].watchers_count - user.repos[y].watchers_count;
                if (diff > 0) msg = "got " + diff + " new";
                else if (diff < 0) msg = "lost " + (-diff);
                sum += diff * MACRO.USER.WATCH;
                if (diff != 0) {
                  new Notifications({
                    src:    json[k].name,
                    dest:   user.user_name,
                    type:   "watch_count",
                    seen:   false,
                    date:   Date.now(),
                    link:   msg
                  }).save(function(err, todo, count) {
                    if (err) console.log("[ERR] Notification not sent.");
                  });
                }

                var points = 0;
                // update existing repos + update pull req
                if (json[k].fork) {
                  core.update_pull_req(json[k].name, json[k].stargazers_count, user.repos[y].owner, req.params.user, req.session.auth.github.accessToken);

                // compute points for own repos
                } else {
                  points += MACRO.USER.REPO + MACRO.USER.FORK * json[k].forks_count;
                  points += MACRO.USER.WATCH * json[k].watchers_count ;
                }

                // update info in db
                var repo_name = json[k].name;
                var conditions = {
                  'user_name': req.params.user,
                  'repos.name': repo_name
                };
                var update = { $set: {
                  'repos.$.stars':          json[k].stargazers_count,
                  'repos.$.description':    json[k].description,
                  'repos.$.forks_count':    json[k].forks_count,
                  'repos.$.size':           json[k].size,
                  'repos.$.watchers_count': json[k].watchers_count,
                  'repos.$.points':         points
                }};
                Users.update(conditions, update).exec();

                break;
              }
            }
          }
        }

        // remove non processed repos and asociated points
        for (var y in repos_back) {
          if (repos_back[y].name != null) {
            var conditions = {'user_name': req.params.user};
            var update = { $pull: {repos: {'name': repos_back[y].name}},
                           $inc:  {points_repos: -(repos_back[y].points)}};
            Users.update(conditions, update).exec();
          }
        }

        // add new repos from backup we created
        var repos = [], total = 0;
        for (var k in json_back) {
            if (json_back[k].name != '') {
              var points = 0; // total points
              if ({}.hasOwnProperty.call(json_back, k) && !json_back[k].private) {

                if (json_back[k].fork && req.session.auth) { // get owner of forked repos and pull req
                  core.update_repo_owner(json_back[k].name, req.params.user, req.session.auth.github.accessToken);

                } else { // compute points for own repos
                  points += MACRO.USER.REPO + MACRO.USER.FORK * json_back[k].forks_count;
                  points += MACRO.USER.WATCH * json_back[k].watchers_count ;
                  total  += points;
                }
              }


              repos.push(new Repo({
                name:           json_back[k].name,
                description:    json_back[k].description,
                html_url:       json_back[k].html_url,
                fork:           json_back[k].fork,
                forks_count:    json_back[k].forks_count,
                size:           json_back[k].size,
                watchers_count: json_back[k].watchers_count,
                points:         points,
              }));
            }
        }

        // update repos and score + sum of new notifications
        var conditions = {'user_name': req.params.user};
        var update = {
          $pushAll: {'repos': repos},
          $inc: {'points_repos': total + sum}
        };
        Users.update(conditions, update).exec();
      });
    });
  });
  request.end();
}


// Update number of followers, notify user and return changes.
exports.followers = function(req, res) {

  // Use access token if user is logged in
  var url = "/users/" + req.params.user + "/followers"
  if (req.session.auth)
    url += "?access_token=" + req.session.auth.github.accessToken

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
        if (!user) return

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

  // Use access token if user is logged in
  var url = "/users/" + req.params.user + "/following"
  if (req.session.auth)
    url += "?access_token=" + req.session.auth.github.accessToken

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
        if (!user) return

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