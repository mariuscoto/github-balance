var express = require('express');
var app = module.exports = express();
global.config = [];


app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  global.config.redis_secret = 'big secret'
  //global.config = require('./lib/config')
  global.config.status = 'dev';
});

app.configure('testing', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  global.config.redis_secret = 'big secret'
  global.config.status = 'test';
});

app.configure('production', function(){
  app.use(express.errorHandler());
  global.config.gh_clientId = process.env.clientId;
  global.config.gh_secret = process.env.secret;
  global.config.redis_secret = process.env.redis_secret;
  global.config.db_name = process.env.db_name;
  global.config.db_pass = process.env.db_pass;
  global.config.facebook_id = process.env.fb_id;
  global.config.facebook_token = process.env.fb_token;
  global.config.mail_user = process.env.mail_user;
  global.config.mail_pass = process.env.mail_pass;
  global.config.status = 'prod';
});


var MACRO = require('./model/macro.js')
  , db = require('./model/db')
  , fs = require('fs')
  , http = require('http')
  , https = require('https')
  , everyauth = require('everyauth')
  , mongoose = require('mongoose')
  , core = require('./core.js')


everyauth
.everymodule
.findUserById( function (id, callback) {
  callback(null, global.usersById[id]);
});

everyauth
.github
.appId(global.config.gh_clientId)
.appSecret(global.config.gh_secret)
.findOrCreateUser(core.login)
.redirectPath('/login');


app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon("public/images/github-icon.ico"));
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(express.cookieParser());
  app.use(express.session({
    secret: global.config.redis_secret,
    cookie: { maxAge: 1800000 } //30 min
  }));
  app.use(everyauth.middleware());

  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

var other = require('./routes/other.js');
app.get('/', other.login);
app.get('/login', other.login);
app.get('/login/:user', other.login_user);
app.get('/faq', other.faq);
app.get('/contact', other.contact);
app.post('/contact', other.feedback);

var api = require('./routes/api.js');
app.get('/api/user/:user', api.user);
app.get('/api/user/:user/repos', api.repos);
app.get('/api/user/:user/followers', api.followers);
app.get('/api/user/:user/following', api.following);
app.get('/api/repo/:user/:repo', api.logs);

var profile = require('./routes/profile.js');
app.get('/:user/remove', ensureAuth, profile.remove);
app.get('/:user/notifications', ensureAuth, profile.notifications);

var admin = require('./routes/admin.js');
app.get('/admin', ensureSuper, admin.index);

/*
This handles all other URLs.
It's main porpose is to serve /user pages and all subpages
but also send 404 response if user does not exist.
*/
app.use(profile.index);


// Make sure user is authenticated middleware
function ensureAuth(req, res, next) {
  if (req.session.auth) return next();
  res.redirect('/login');
}

// Make sure user is authenticated and root middleware
function ensureSuper(req, res, next) {
  if (req.session.auth && MACRO.SUPERUSER.indexOf(req.session.auth.github.user.login) > -1)
    return next();

  return res.render('404', {title: "404: File not found"});
}

// Launch server
app.listen(process.env.PORT || 3000, function() {
  console.log('Server listening on port 3000.');
});
