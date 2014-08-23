var MACRO    = require('../model/macro.js');
var mongoose = require('mongoose');
var Users    = mongoose.model('Users');
var Notifications   = mongoose.model('Notifications');
var core 		= require('../core.js');


/*
User profile page. Shows all info about selected user.
*/
exports.index = function(req, res) {
  var cname = req.url.substring(1, (req.url + '/').substring(1).indexOf('/')+1);
  var uname = ((req.session.auth) ? req.session.auth.github.user.login : null);

  // Only superuser can see other people's profiles.
  if (uname && uname != cname && uname != MACRO.SUPERUSER)
    return res.redirect('/' + uname)

  Users.findOne({ 'user_name': uname }, function(err, user) {
    if (!user) return res.redirect('/login')

    res.render('profile', {
      title:      'User',
      currentUrl: '',
      user: 		  user
    });
  })
}


/*
Notifications tab.
*/
exports.notifications = function(req, res) {
  var uname = ((req.session.auth) ? req.session.auth.github.user.login : null);

  Users.findOne ({ 'user_name': uname }, function(err, user) {
    if (!user) return res.redirect('/login')

    Notifications
    .find({ 'dest': user.user_name })
    .sort({ 'date' : -1 })
    .exec(function(err, notif) {

      for (var i in notif) {
        // Format date
        notif[i].date_f = core.get_time_from(notif[i].date);
      }

      res.render('profile', {
        'title':      user.user_fullname,
        'currentUrl': 'notifications',
        'notif':      notif,
        'user':       user
      })
    })

    // Update general unread
    var conditions = {'user_name': user.user_name};
    var update = {$set: {'unread': false}};
    Users.update(conditions, update).exec();

  })
}


/*
Remove user account and all associated content.
Keep username in notifications (as src) and Challenges. When someone clicks
on his name, they will get 404.
*/
exports.remove = function(req, res) {
  res.redirect('/logout')

  var user = req.session.auth.github.user.login

  // Remove notifications that he received
  Notifications.remove({'dest': user}, function (err, num) {
    if (err) console.log("[ERR] Could not remove user notifications.");
  })

  // Remove user data
  Users.remove({'user_name': user}, function (err, num) {
    if (err) console.log("[ERR] Could not remove user info.");
  })

}
