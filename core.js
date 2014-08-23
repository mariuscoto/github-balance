var MACRO    = require('./model/macro.js');
var mongoose = require('mongoose');
var https = require('https');
var fs = require('fs');

var Repo = mongoose.model('Repo');
var Users = mongoose.model('Users');
var Notifications = mongoose.model('Notifications');

var nextUserId = 0;
global.usersById = {};
var usersByGhId = {};


function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}


exports.send_mail = function (destination, type, body) {
  var nodemailer = require("nodemailer");

  // create reusable transport method (opens pool of SMTP connections)
  var smtpTransport = nodemailer.createTransport("SMTP",{
    service: "Gmail",
    auth: {
      user: global.config.mail_user,
      pass: global.config.mail_pass
    }
  });

  fs.readFile(__dirname + '/public/emails/' + type + '.html', 'utf8', function (err, html) {
      var mailOpt = {};

      if (type == 'welcome') {
        mailOpt['from']    = "welcome@gconnect.com";
        mailOpt['to']      = destination,
        mailOpt['subject'] = 'Welcome to Github-connect',
        mailOpt['text']    = '',
        mailOpt['html']    = html;
      } else if (type == 'feedback') {
        mailOpt['from']    = "welcome@gconnect.com";
        mailOpt['to']      = 'cmarius02@gmail.com',
        mailOpt['subject'] = 'Feedback Github-connect: ' + body.email,
        mailOpt['text']    = body.msg
      }

      // send mail with defined transport object
      smtpTransport.sendMail(mailOpt, function(err, response){
        if (err) console.log(err);
        else console.log("* Email sent to " + destination);

        smtpTransport.close();
      });
  });
}


function addUser (source, sourceUser) {
  var user;
  if (arguments.length === 1) { // password-based
    user = sourceUser = source;
    user.id = ++nextUserId;
    return usersById[nextUserId] = user;
  } else { // non-password-based
    user = usersById[++nextUserId] = {id: nextUserId};
    user[source] = sourceUser;
  }
  return user;
}

exports.update_repo_owner = function(repo, user_name, accessToken) {
  var options = {
    host: "api.github.com",
    path: "/repos/" + user_name + "/" + repo + "?access_token=" + accessToken,
    method: "GET",
    headers: { "User-Agent": "github-connect" }
  };

  var request = https.request(options, function(response){
    var body = '';
    response.on("data", function(chunk){ body+=chunk.toString("utf8"); });
    response.on("end", function(){
      var repo_info = JSON.parse(body);

      var repo_owner = repo_info.source.owner.login;
      var repo_stars = repo_info.stargazers_count;

      // update element of array
      var conditions = {user_name: user_name, 'repos.name': repo};
      var update = {$set: {
        'repos.$.owner': repo_owner,
        'repos.$.stars': repo_stars }};
      Users.update(conditions, update, function (err, num) {
        module.exports.update_pull_req(repo, repo_stars, repo_owner, user_name, accessToken);
      });

    });
  });
  request.end();
}

exports.update_pull_req = function(repo, stars, owner, user_name, accessToken) {
  var options = {
    host: "api.github.com",
    path: "/repos/" + owner + "/" + repo + "/pulls?state=closed&&access_token=" + accessToken,
    method: "GET",
    headers: { "User-Agent": "github-connect" }
  };

  var request = https.request(options, function(response){
    var body = '';
    response.on("data", function(chunk){ body+=chunk.toString("utf8"); });
    response.on("end", function(){
      var count = 0, diff = 0;
      var pulls = JSON.parse(body);

      // get current info
      Users.findOne({'user_name': user_name}, function(err, user) {
        if (!user) return

        for (var i in pulls) {
          // consider just merged pulls of current user
          if (pulls[i].state == 'closed' &&
              pulls[i].user &&
              pulls[i].user.login == user_name &&
              pulls[i].merged_at) {

            count++;
          }
        }

        // check if anything has changed
        for (var r in user.repos) {
          if (user.repos[r].name == repo) {
            // new pulls accepted, but no first login, notify user
            diff = count - user.repos[r].closed_pulls;
            if (diff > 0 && user.repos[r].closed_pulls != 0) {
              new Notifications({
                src:    repo,
                dest:   user_name,
                type:   "pull_accepted",
              }).save(function(err, todo, count) {
                if (err) console.log("[ERR] Notification not sent.");
              });
            }

            break;
          }
        }

        // update pulls count, add points, update total
        var pull_value = MACRO.USER.PULL + MACRO.USER.STAR * stars
        var conditions = {'user_name': user_name, 'repos.name': repo};
        var update = {$set: {
          'repos.$.points': count * pull_value,
          'repos.$.closed_pulls': count}};
        Users.update(conditions, update).exec()
      });
    });
  });
  request.end();
}


exports.login = function(sess, accessToken, accessTokenExtra, ghUser) {
  sess.oauth = accessToken;
  if (typeof usersByGhId[ghUser.id] === 'undefined') {

    usersByGhId[ghUser.id] = addUser('github', ghUser);

    Users
    .findOne({ 'user_id': usersByGhId[ghUser.id].github.id }, function (err, user) {
      if (err) return handleError(err);

      if (user) {
        // User in db, update last_seen
        var condit = {'user_name': user.user_name};
        var update = {$set: {
          'last_seen':    Date.now(),
          'followers_no': usersByGhId[ghUser.id].github.followers,
          'following_no': usersByGhId[ghUser.id].github.following
        }};
        Users.update(condit, update, function () {
          console.log("* User " + user.user_name + " logged in.");
        });

        // Check for changes in following/followers number
        module.exports.check_count(usersByGhId[ghUser.id].github.following, user.following_no, "following_no", "", user.user_name)
        module.exports.check_count(usersByGhId[ghUser.id].github.followers, user.followers_no, "followers_no", "", user.user_name)

      } else {
        // User not in db, create one
        new Users ({
          user_id:       usersByGhId[ghUser.id].github.id,
          user_name:     usersByGhId[ghUser.id].github.login,
          user_fullname: usersByGhId[ghUser.id].github.name,
          user_email:    usersByGhId[ghUser.id].github.email,
          avatar_url:    usersByGhId[ghUser.id].github.avatar_url,
          location:      usersByGhId[ghUser.id].github.location,
          join_github:   usersByGhId[ghUser.id].github.created_at,
          followers_no:  usersByGhId[ghUser.id].github.followers,
          following_no:  usersByGhId[ghUser.id].github.following
        }).save (function (err, user, count) {
          console.log("* User " + user.user_name + " added.");

          // send welcome notification
          new Notifications({
            src:    null,
            dest:   usersByGhId[ghUser.id].github.login,
            type:   "welcome",
            link:   "/faq"
          }).save(function(err, todo, count) {
            if (err) console.log("[ERR] Notification not sent.");
          });

          // send welcome email
          module.exports.send_mail(user.user_email, 'welcome');
        });
      }
    });
  }

  return usersByGhId[ghUser.id];
}


exports.get_time_from = function (then) {
  var now = Date.now();

  // interval between time now and db date
  var msec = now - new Date(then).getTime();

  var hh = Math.floor(msec / 1000 / 60 / 60);
  if (hh > 24) { // older that 24 hours
    // return actual date
    return "on " + then.toString().substring(4, 15);

  } else if (hh > 1) { // older than 1 hour
    return hh + " hours ago";

  } else {
    msec -= hh * 1000 * 60 * 60;
    var mm = Math.floor(msec / 1000 / 60);

    if (mm > 1) { // older than 1 mnute
      return mm + " minutes ago";

    } else {
      return "one minute ago";
    }
  }
}


/*
  Compare two values and fire notification if they differ. Used to alert the
  changes in numer of repo watcher, forks, etc.
*/
exports.check_count = function(new_value, old_value, type, src, dest) {
  diff = new_value - old_value

  var msg = null
  if (diff > 0) msg = "got " + diff + " new";
  else if (diff < 0) msg = "lost " + (-diff);

  if (diff != 0 && msg) {
    new Notifications({
      'src':    src,
      'dest':   dest,
      'type':   type,
      'link':   msg
    }).save(function(err, todo, count) {
      if (err) console.log("[ERR] Notification not sent.");
    });

    var conditions = {'user_name': dest};
    var update = {$set: {'unread': true}};
    Users.update(conditions, update).exec();
  }
}
