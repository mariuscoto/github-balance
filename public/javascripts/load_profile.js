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
}


// Request repos info
function repos_controller($scope, $http, $timeout) {
  $scope.repos = {}
  $scope.cups = 0
  $scope.tentacles = 0

  $scope.loading = true
  $scope.backup = 42

  $scope.getData = function(){
    $http.get('/api/user/' + user + '/repos').success(function(data) {
      for (r in data) {

        // Prevents flickering
        if (!$scope.repos.hasOwnProperty(data[r].name)) {
          $scope.repos[data[r].name] = {}
          $scope.repos[data[r].name]['points'] = 0
          $scope.repos[data[r].name]['pulls'] = 0
          $scope.repos[data[r].name]['name'] = data[r].name
          $scope.repos[data[r].name]['fork'] = data[r].fork
          $scope.repos[data[r].name]['html_url'] = data[r].html_url
          $scope.repos[data[r].name]['description'] = data[r].description
        }

        $http.get('/api/repo/' + user + '/' + data[r].name).success(function(data) {

          if (data.name) { // Repo is ready

            $scope.repos[data.name]['watchers'] = data.watchers
            $scope.repos[data.name]['forks'] = data.forks
            $scope.repos[data.name]['stars'] = data.stars

            // There is a difference in score
            if ($scope.repos[data.name]['points'] != data.points) {
              diff = data.points - $scope.repos[data.name]['points']
              $scope.repos[data.name]['points'] = data.points

              $scope.cups += diff
            }

            // There is a difference in tentacles
            if ($scope.repos[data.name]['pulls'] != data.pulls) {
              $scope.repos[data.name]['pulls'] = data.pulls
              $scope.tentacles += 1
            }

          }
        })

        // Update backup points
        $scope.backup = $scope.cups
      }

    })
  }

  $scope.intervalFunction = function(){
    $timeout(function() {

      // Remove loader when we get consistent points
      if ($scope.cups == $scope.backup) {
        $scope.loading = false
        break
      }

      $scope.getData();
      $scope.intervalFunction();
    }, 1000 * 5)
  };

  $scope.intervalFunction();
}
