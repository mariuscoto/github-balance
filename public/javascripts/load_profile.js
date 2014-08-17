//Get current user from URL
var user = window.location.pathname.split('/')[1]

// Request user info
function user_controller($scope, $http) {

  $http.get('/api/user/' + user).success(function(data) {
    if (data.err) return console.log(data.msg)

    // Set window title
    document.title = data.user_fullname

    $scope.points = data.points_repos
    $scope.user_name = data.user_name
    $scope.fullname = data.user_fullname
    $scope.email = data.user_email
    $scope.join_date = (data.join_us).toString().substring(0, 10)
    $scope.location = data.location
    $scope.avatar_src = data.avatar_url

    $scope.followers = data.followers_no
    $scope.following = data.following_no
  })

  $http.get('/api/user/' + user + '/followers').success(function(data) {
    $scope.followers = data.no
  })

  $http.get('/api/user/' + user + '/following').success(function(data) {
    $scope.following = data.no
  })
}


// Request repos info
function repos_controller($scope, $http) {

  $scope.repos = {}
  $scope.cups = 0
  $scope.tentacles = 0

  $http.get('/api/user/' + user + '/repos').success(function(data) {

    for (r in data) {
      $scope.repos[data[r].name] = {}
      $scope.repos[data[r].name]['name'] = data[r].name
      $scope.repos[data[r].name]['fork'] = data[r].fork
      $scope.repos[data[r].name]['html_url'] = data[r].html_url
      $scope.repos[data[r].name]['description'] = data[r].description

      $http.get('/api/repo/' + user + '/' + data[r].name).success(function(data) {
        $scope.repos[data.name]['points'] = data.points
        $scope.cups += data.points
        if (data.pulls) $scope.tentacles += 1
      })
    }

  })
}
