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

  // Get stored info
  Users.findOne({'user_name': req.params.user}, function(err, user) {
    if (!user) return res.json({'err': true})

    // Check data age
    if (user.refresh && Date.now() - user.refresh.getTime() < MACRO.REFRESH_TIMEOUT) {

      // Fresh data in db. Deliver quickly.
      return res.json(user.repos)

    } else {
      // We need to refresh data. Fire API request.
      var request = https.request(options, function(response){
        var body = '';
        response.on("data", function(chunk){ body+=chunk.toString("utf8"); });
        response.on("end", function(){

          // API calls limit exceded
          if (response.statusCode == 403) return

          var json = JSON.parse(body);
          var json_back = JSON.parse(body);
          var repos_back = [];

          // Provide quick response
          res.json(json)

          // Save a backup of response
          repos_back = user.repos.slice(0);

          for (var k in json) {
            var points = 0; // total points          

            if ({}.hasOwnProperty.call(json, k) && !json[k].private) {
              for (var y in user.repos) {
                repos_back[y] = {}

                if (json[k].name == user.repos[y].name) {
                  // remove processed repos from backup
                  json_back[k].name = '';
                  repos_back[y].name = null;

                  var points = 0;
                  if (json[k].fork && req.session.auth) {
                    core.update_pull_req(json[k].name, json[k].stargazers_count, user.repos[y].owner, req.params.user, req.session.auth.github.accessToken);

                  } else {
                    // Check fork_count
                    core.check_count(json[k].forks_count, user.repos[y].forks_count, 'fork_count', json[k].name, user.user_name)
                    // Check watchers_count
                    core.check_count(json[k].watchers_count, user.repos[y].watchers_count, 'watch_count', json[k].name, user.user_name)

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

          // Remove non processed repos (those who do not apper in latest response)
          for (var y in repos_back) {
            if (repos_back[y].name != null) {
              var conditions = {'user_name': req.params.user};
              var update = { $pull: {repos: {'name': repos_back[y].name}}};
              Users.update(conditions, update).exec();
            }
          }

          // add new repos from backup we created
          var repos = [], total = 0;
          for (var k in json_back) {
              if (json_back[k].name != '') {
                var points = 0; // total points
                if ({}.hasOwnProperty.call(json_back, k) && !json_back[k].private) {

                  // get owner of forked repos and pull req
                  if (json_back[k].fork && req.session.auth) {
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
            $set: {'refresh': Date.now()},
            $pushAll: {'repos': repos}
          };
          Users.update(conditions, update).exec();
          });
        });


        request.end();
      } // else
  }) // close req
  
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

      // Update user info
      var conditions = {'user_name': req.params.user};
      var update = {$set: {'following_no': json.length}};
      Users.update(conditions, update).exec();
    });
  });
  request.end();
}