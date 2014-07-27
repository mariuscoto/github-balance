var core = require('../core.js');
var mongoose = require('mongoose');
var Users = mongoose.model('Users');


/*
Stats page.
*/
exports.index = function(req, res) {

  var uid = ((req.session.auth) ? req.session.auth.github.user.id : null);

  Users.findOne({'user_id': uid}).exec(gotUser);

  function gotUser(err, user) {
    res.render('admin', {
      title: 'New challenge',
      user: user
    });
  }

};
