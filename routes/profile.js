var mongoose = require('mongoose');
var Users    = mongoose.model('Users');
var Notifications   = mongoose.model('Notifications');
var core 		= require('../core.js');


/*
User profile page. Shows all info about selected user.
*/
exports.index = function(req, res) {
  // Only logged in users can see profiles
  if (!req.session.auth) return res.redirect('/login')

  var cname = req.url.substring(1, (req.url + '/').substring(1).indexOf('/')+1);
  var uid = ((req.session.auth) ? req.session.auth.github.user.id : null);

  Users.findOne ({ 'user_name': cname }, function(err, cuser) {
    if (!cuser) return res.status(404).render('404', {title: "404: File not found"})
    else {

      Users.findOne ({ 'user_id': uid }, function(err, user) {

        res.render('profile', {
          title:      cuser.user_fullname,
          currentUrl: '',
          cuser: 	    cuser,
          user: 		  user
        });

      })
    }
  })
}

/*
Notifications tab.
*/
exports.notifications = function(req, res) {
  var uid = ((req.session.auth) ? req.session.auth.github.user.id : null);

  Users.findOne ({ 'user_name': req.params.user }, function(err, cuser) {
    if (!cuser) return res.render('404', {title: "404: File not found"});
    else {

      Users.findOne ({ 'user_id': uid }, function(err, user) {

        // Users must only see their own notifications
        if (!user || user.user_name != cuser.user_name) {
          return res.redirect('/' + cuser.user_name);

        } else {
          // Update general unread
          var conditions = {user_name: cuser.user_name};
          var update = {$set: {unread: false}};
          Users.update(conditions, update).exec();

          Notifications
          .find({ 'dest': cuser.user_name })
          .sort({ 'date' : -1 })
          .exec(function(err, notif) {

            for (var i in notif) {
              // Format date
              notif[i].date_f = core.get_time_from(notif[i].date);
            }

            res.render('profile', {
              'title':      cuser.user_fullname,
              'currentUrl': 'notifications',
              'cuser':      cuser,
              'notif':      notif,
              'user':       user
            })

          })
        }
      })
    }
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
