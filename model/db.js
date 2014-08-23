var mongoose = require( 'mongoose' );
var Schema   = mongoose.Schema;

var Users = new Schema({
  user_id:         String,
  user_name:       String,
  user_fullname:   String,
  user_email:      String,
  avatar_url:      String,
  location:        String,
  followers_no:    {type: Number, default: 0},
  following_no:    {type: Number, default: 0},
  join_github:     {type: String, default: Date.now},
  join_us:         {type: Date, default: Date.now},
  last_seen:       {type: Date, default: Date.now},
  refresh:         {type: Date, default: null},
  repos:           {type: [Repo], default: []},
  unread:          {type: Boolean, default: false}
});

var Repo = new Schema({
  name:           String,
  description:    String,
  html_url:       String,
  fork:           Boolean,
  forks_count:    Number,
  points:         {type: Number, default: 0},
  size:           Number,
  watchers_count: Number,
  owner:          {type: String, default: null},
  closed_pulls:   {type: Number, default: 0},
  stars:          {type: Number, default: 0}
});

var Notifications = new Schema({
  src:  String,
  dest: String,
  type: String,
  seen: {type: Boolean, default: false},
  date: {type: Date, default: Date.now},
  link: {type: String, default: null},
  msg:  {type: String, default: null}
});

mongoose.model( 'Users', Users );
mongoose.model( 'Repo', Repo );
mongoose.model( 'Notifications', Notifications );


if (global.config.status == 'dev')
  mongoose.connect( 'mongodb://localhost/github-balance' );
else
  mongoose.connect('mongodb://'+global.config.db_name+':'+global.config.db_pass+'@kahana.mongohq.com:10039/github-balance');
