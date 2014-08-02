var mongoose = require('mongoose');
var Users    = mongoose.model('Users');
var Notifications = mongoose.model('Notifications');
var core     = require('../core.js');

/*
Login with or without GitHub auth.
This will provide a session and create a new user if necessary.
Visit /login/$USER to login as $USER.
*/
exports.login = function(req, res) {
  if (req.session.auth)
    return res.redirect('/' + req.session.auth.github.user.login);

  res.render('login', {
    'title':  "Log in",
    'status': global.config.status,
    'tab':    req.query.rf
  });
};


/*
Offline login. Works only in dev env.
*/
exports.login_user = function(req, res) {
  if (global.config.status == 'dev') {
    if (!req.params.user) {
      // If no username provided, redirect to default.
      return res.redirect('/login/dev_user');

    } else {
      // Create default user with given name and autogenerated id.
      var u = {id: parseInt(req.params.user, 36), login: req.params.user};

      // Add some content for user
      var repo = {
        name:           req.params.user + '\'s cool repo',
        description:    'A very nice description should be added here.',
        html_url:       'http://www.github.com',
        fork:           true,
        forks_count:    3,
        watchers_count: 5,
        closed_pulls:   3,
        points:         7
      };
      var update = {
        user_id:       u.id,
        user_name:     u.login,
        user_fullname: 'Development user',
        user_email:    'dev@github-connect.com',
        avatar_url:    'https://avatars.githubusercontent.com/u/0',
        location:      'Somewhere',
        repos:         [repo]
      };

      // Make sure user exists and build session for him.
      Users.update({user_id: u.id}, update, {upsert: true}, function(err, num) {
        req.session.regenerate(function (err) {
          req.session.auth = {};
          req.session.auth.loggedIn = true;
          req.session.auth.github = {};
          req.session.auth.github.user = u;
          res.redirect('/' + u.login);
        });
      });
    }

  } else {
    res.redirect('/login')
  }
}


/*
Feedback form processing.
Sends email to owner and redirects to login page with message.
*/
exports.feedback = function(req, res) {
  if (req.body.email && req.body.msg) {
    core.send_mail(null, 'feedback', req.body);
    res.redirect('/login?rf=back');

  } else {
    res.redirect('/contact');
  }
};


/*
Coantact page holds feedback form.
*/
exports.contact = function(req, res) {
  var uid = ((req.session.auth) ? req.session.auth.github.user.id : null);

  Users.findOne({ user_id: uid }, function(err, user) {
    if (err) return handleError(err);

    res.render('contact', {
      title:  "Get in touch with us",
      user:   user
    });
  });
};


/*
FAQ page.
*/
exports.faq = function(req, res) {
  var uid = ((req.session.auth) ? req.session.auth.github.user.id : null);

  Users.findOne({ user_id: uid }, function(err, user) {
    if (err) return handleError(err);

    res.render('faq', {
      title:  "F.A.Q.",
      user:   user
    });
  });
};
