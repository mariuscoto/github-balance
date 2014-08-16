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
