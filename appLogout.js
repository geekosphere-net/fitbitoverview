/* eslint-env node */


/**
 * backlog:
 * 	logout
 */

/*
 *	OAuth Scope
 * 
 *	activity	The activity scope includes activity data and exercise log related features, such as steps, distance, calories burned, and active minutes
 *	heartrate	The heartrate scope includes the continuous heart rate data and related analysis
 *	location	The location scope includes the GPS and other location data
 *	nutrition	The nutrition scope includes calorie consumption and nutrition related features, such as food/water logging, goals, and plans
 *	profile		The profile scope is the basic user information
 *	settings	The settings scope includes user account and device settings, such as alarms
 *	sleep		The sleep scope includes sleep logs and related sleep analysis
 *	social		The social scope includes friend-related features, such as friend list, invitations, and leaderboard
 *	weight		The weight scope includes weight and related information, such as body mass index, body fat percentage, and goals
 */


var async = require("async");
var bodyParser = require("body-parser");
var cfenv = require("cfenv");
var cookieParser = require("cookie-parser");
var express = require("express");
var errorhandler = require("errorhandler");
var favicon = require("serve-favicon");
var FitbitStrategy = require("passport-fitbit-oauth2").FitbitOAuth2Strategy;
var methodOverride = require("method-override");
var moment = require("moment");
var passport = require("passport");
var request = require("request-promise");
//var session = require("express-session");

var fbr = request;


//
// Configure express

var app = express();
app.enable("trust proxy");
app.use(cookieParser());
/*
app.use(session({
	secret: "a56023fa-4d16-44f3-a5e4-59f26c2ad013",
	resave: false,
	saveUninitialized: false
}));*/
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(bodyParser.json());
app.use(methodOverride("X-HTTP-Method-Override"));
app.use(favicon(__dirname + "/public/images/favicon.ico"));
app.use(express.static(__dirname + "/public"));
app.locals.pretty = true;
app.disable("x-powered-by");


//
// Parse Serivce data & Bluemix Env

var appEnv = cfenv.getAppEnv();


//
// Fitbit OAuth & API

var fitbitOauth = appEnv.getServiceCreds("fitbit_oauth2");
var fitbitOauthScope = ["activity", "profile", "nutrition"];

function initFitbitRequest(accessToken) {

	fbr = request.defaults({
		baseUrl: "https://api.fitbit.com/1/user/-",
		json: true,
		auth: {
			"bearer": accessToken
		},
		headers: {
			"Accept-Language": "en_US"
		}
	});
}


//
// Setup SSO with Passport

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});

var sso_login_uri = "/auth/v1.0/sso_login";
var sso_logout_uri = "/auth/v1.0/sso_logout";
var sso_callback_uri = "/auth/v1.0/sso_callback";
var healthcheck_uri = "/auth/v1.0/healthcheck";



passport.use(new FitbitStrategy({
		clientID: fitbitOauth.clientId,
		clientSecret: fitbitOauth.clientSecret,
		callbackURL: fitbitOauth.callbackURL + sso_callback_uri
	},
	/* @callback */
	function(accessToken, refreshToken, profile, done) {
		done(null, {
			accessToken: accessToken,
			refreshToken: refreshToken,
			profile: profile
		});

		//
		// Setup defaults for the request object

		initFitbitRequest(accessToken);
	}
));


//
// Add a handler to ensure user is logged in

function ensureSSO(req, res, next) {
	if (req.isAuthenticated() || req.path.indexOf("/auth") === 0) {
		return next();
	}
	req.session.originalUrl = req.originalUrl;
	res.redirect(sso_login_uri);
}
app.all("*", ensureSSO);


//
// Add a handler to inspect the req.secure forcing SSL

function ensureSSL(req, res, next) {
	if (req.secure) {
		// request was via https, so do no special handling
		next();
	} else {
		// request was via http, so redirect to https
		res.redirect("https://" + req.headers.host + req.url);
	}
}
app.all("*", ensureSSL);


//
// Add a handler for caching

/* @callback */
function nocache(req, res, next) {
  res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.header("Expires", "-1");
  res.header("Pragma", "no-cache");
  next();
}



//
// Generate HTML page

function generateHTML(user, results) {
	results.sort(function(a, b) {
		return a.date > b.date ? 1 : -1;
	});

	var html = "<html><head><title>Fitbit Overview: " + user.fullName + "</title></head><body>";

	html += "<table border='4'><caption>" + user.fullName + "</catption><tr><th>Date</th><th>Calories</th><th>Carbs</th><th>Fat</th><th>Protein</th><th>Steps</th><th>Very Active</th><th>Sodium</th><th>Water</th><th>Fiber</th></tr>";
	for (var i = 0; i < results.length; i++) {
		html += "<tr><td>" + results[i].date +
			"</td><td>" + results[i].activities.summary.caloriesOut +
			"</td><td>" + results[i].food.summary.carbs +
			"</td><td>" + results[i].food.summary.fat +
			"</td><td>" + results[i].food.summary.protein +
			"</td><td " + (results[i].activities.summary.steps >= results[i].activities.goals.steps ? "bgcolor=green" : "bgcolor=red") + ">" +
			results[i].activities.summary.steps +
			"</td><td>" + results[i].activities.summary.veryActiveMinutes +
			"</td><td>" + results[i].food.summary.sodium +
			"</td><td>" + results[i].food.summary.water +
			"</td><td>" + results[i].food.summary.fiber +
			"</td></tr>";
	}
	return html + "</table><a href=\"" + sso_logout_uri + "\">logout</a></body></html>";
}


//
//-------------------  R O U T E S    S T A R T  -------------------//

//
// SSO Pages

app.route(sso_login_uri)
	.all(passport.authenticate("fitbit", {
		scope: fitbitOauthScope,
		session: false
	}));

app.route(sso_logout_uri)
	.all(function(req, res) {
		console.log("LOGOUT");
		req.logout();
		req.session.destroy(function() {
			res.clearCookie("connect.sid", {
				path: "/"
			});
			console.log("DESTROY");
			res.redirect("https://www.yahoo.com");
		});
	});

app.route(sso_callback_uri)
	.all(function(req, res, next) {
		var redirect_url = req.session.originalUrl;
		passport.authenticate("fitbit", {
			successRedirect: redirect_url,
			failureRedirect: "http://www.yahoo.com",
		})(req, res, next);
	});

//
// Healthcheck

app.route(healthcheck_uri)
	.all( /* @callback */ function(req, res, next) {
		res.status(200).send({
			"time": moment()
		});
	});

//
// Env dump

app.route("/bluemix")
	.all( /* @callback */ function(req, res, next) {
		res.status(200).send(JSON.stringify(process.env));
	});

//
// Test endpoint

app.route("/", nocache)
	.all( /* @callback */ function(req, res, next) {

		var results = [];
		var startDate = new moment();
		var numberOfDays = 7;
		var dates = [];

		for (var i = 0; i < numberOfDays; i++) {
			dates.push(startDate.subtract(1, "d").format("YYYY-MM-DD"));
		}


		async.each(dates, function(date, callback) {
			/*
			//console.log("starting " + date);
			fbr("/activities/date/" + date + ".json").then(function(activities) {
				//console.log("activities " + date + " steps " + activities.summary.steps);
				fbr("/foods/log/date/" + date + ".json").then(function(food) {
					//console.log("food " + date + " water " + food.summary.water);
					results.push({
						date: date,
						activities: activities,
						food: food
					});
					return callback();
				}).catch(function(err) {
					console.error(err);
					return callback();
				});
			}).catch(function(err) {
				console.error(err);
				return callback();
			});
			*/
			 results = [{
		"date" : "2016-09-16",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 2365,
				"caloriesBMR" : 1713,
				"caloriesOut" : 3768,
				"distances" : [{
						"activity" : "total",
						"distance" : 6.74
					}, {
						"activity" : "tracker",
						"distance" : 6.74
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 3.32
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.32
					}, {
						"activity" : "lightlyActive",
						"distance" : 3.08
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0
					}
				],
				"elevation" : 180,
				"fairlyActiveMinutes" : 39,
				"floors" : 18,
				"lightlyActiveMinutes" : 280,
				"marginalCalories" : 1564,
				"sedentaryMinutes" : 646,
				"steps" : 13789,
				"veryActiveMinutes" : 85
			}
		},
		"food" : {
			"foods" : [],
			"goals" : {
				"calories" : 3268
			},
			"summary" : {
				"calories" : 0,
				"carbs" : 0,
				"fat" : 0,
				"fiber" : 0,
				"protein" : 0,
				"sodium" : 0,
				"water" : 0
			}
		}
	}, {
		"date" : "2016-09-22",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 1744,
				"caloriesBMR" : 1707,
				"caloriesOut" : 3215,
				"distances" : [{
						"activity" : "total",
						"distance" : 3.56
					}, {
						"activity" : "tracker",
						"distance" : 3.56
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 1.36
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.54
					}, {
						"activity" : "lightlyActive",
						"distance" : 1.63
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0.02
					}
				],
				"elevation" : 10,
				"fairlyActiveMinutes" : 38,
				"floors" : 1,
				"lightlyActiveMinutes" : 204,
				"marginalCalories" : 1140,
				"sedentaryMinutes" : 688,
				"steps" : 7789,
				"veryActiveMinutes" : 67
			}
		},
		"food" : {
			"foods" : [],
			"summary" : {
				"calories" : 0,
				"carbs" : 0,
				"fat" : 0,
				"fiber" : 0,
				"protein" : 0,
				"sodium" : 0,
				"water" : 48
			}
		}
	}, {
		"date" : "2016-09-17",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 2948,
				"caloriesBMR" : 1710,
				"caloriesOut" : 4173,
				"distances" : [{
						"activity" : "total",
						"distance" : 5.51
					}, {
						"activity" : "tracker",
						"distance" : 5.51
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 1.76
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.86
					}, {
						"activity" : "lightlyActive",
						"distance" : 2.86
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0
					}
				],
				"elevation" : 130,
				"fairlyActiveMinutes" : 98,
				"floors" : 13,
				"lightlyActiveMinutes" : 317,
				"marginalCalories" : 1910,
				"sedentaryMinutes" : 489,
				"steps" : 12477,
				"veryActiveMinutes" : 106
			}
		},
		"food" : {
			"foods" : [],
			"goals" : {
				"calories" : 3673
			},
			"summary" : {
				"calories" : 0,
				"carbs" : 0,
				"fat" : 0,
				"fiber" : 0,
				"protein" : 0,
				"sodium" : 0,
				"water" : 0
			}
		}
	}, {
		"date" : "2016-09-21",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 1727,
				"caloriesBMR" : 1707,
				"caloriesOut" : 3223,
				"distances" : [{
						"activity" : "total",
						"distance" : 7.37
					}, {
						"activity" : "tracker",
						"distance" : 7.37
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 5.64
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.24
					}, {
						"activity" : "lightlyActive",
						"distance" : 1.45
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0
					}
				],
				"elevation" : 200,
				"fairlyActiveMinutes" : 10,
				"floors" : 20,
				"lightlyActiveMinutes" : 171,
				"marginalCalories" : 1182,
				"sedentaryMinutes" : 671,
				"steps" : 14301,
				"veryActiveMinutes" : 100
			}
		},
		"food" : {
			"foods" : [],
			"summary" : {
				"calories" : 0,
				"carbs" : 0,
				"fat" : 0,
				"fiber" : 0,
				"protein" : 0,
				"sodium" : 0,
				"water" : 0
			}
		}
	}, {
		"date" : "2016-09-19",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 1221,
				"caloriesBMR" : 1707,
				"caloriesOut" : 2802,
				"distances" : [{
						"activity" : "total",
						"distance" : 4.95
					}, {
						"activity" : "tracker",
						"distance" : 4.95
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 3.51
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.13
					}, {
						"activity" : "lightlyActive",
						"distance" : 1.29
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0
					}
				],
				"elevation" : 110,
				"fairlyActiveMinutes" : 14,
				"floors" : 11,
				"lightlyActiveMinutes" : 142,
				"marginalCalories" : 817,
				"sedentaryMinutes" : 740,
				"steps" : 9341,
				"veryActiveMinutes" : 50
			}
		},
		"food" : {
			"foods" : [],
			"goals" : {
				"calories" : 2302
			},
			"summary" : {
				"calories" : 0,
				"carbs" : 0,
				"fat" : 0,
				"fiber" : 0,
				"protein" : 0,
				"sodium" : 0,
				"water" : 0
			}
		}
	}, {
		"date" : "2016-09-18",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 2267,
				"caloriesBMR" : 1709,
				"caloriesOut" : 3646,
				"distances" : [{
						"activity" : "total",
						"distance" : 5.9
					}, {
						"activity" : "tracker",
						"distance" : 5.9
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 3.58
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.54
					}, {
						"activity" : "lightlyActive",
						"distance" : 1.76
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0
					}
				],
				"elevation" : 100,
				"fairlyActiveMinutes" : 82,
				"floors" : 10,
				"lightlyActiveMinutes" : 196,
				"marginalCalories" : 1536,
				"sedentaryMinutes" : 954,
				"steps" : 12199,
				"veryActiveMinutes" : 96
			}
		},
		"food" : {
			"foods" : [],
			"goals" : {
				"calories" : 3146
			},
			"summary" : {
				"calories" : 0,
				"carbs" : 0,
				"fat" : 0,
				"fiber" : 0,
				"protein" : 0,
				"sodium" : 0,
				"water" : 0
			}
		}
	}, {
		"date" : "2016-09-20",
		"activities" : {
			"activities" : [],
			"goals" : {
				"activeMinutes" : 30,
				"caloriesOut" : 2773,
				"distance" : 5,
				"floors" : 10,
				"steps" : 10000
			},
			"summary" : {
				"activeScore" : -1,
				"activityCalories" : 1526,
				"caloriesBMR" : 1707,
				"caloriesOut" : 3040,
				"distances" : [{
						"activity" : "total",
						"distance" : 3.37
					}, {
						"activity" : "tracker",
						"distance" : 3.37
					}, {
						"activity" : "loggedActivities",
						"distance" : 0
					}, {
						"activity" : "veryActive",
						"distance" : 1.68
					}, {
						"activity" : "moderatelyActive",
						"distance" : 0.2
					}, {
						"activity" : "lightlyActive",
						"distance" : 1.47
					}, {
						"activity" : "sedentaryActive",
						"distance" : 0
					}
				],
				"elevation" : 70,
				"fairlyActiveMinutes" : 23,
				"floors" : 7,
				"lightlyActiveMinutes" : 197,
				"marginalCalories" : 973,
				"sedentaryMinutes" : 730,
				"steps" : 7201,
				"veryActiveMinutes" : 55
			}
		},
		"food" : {
			"foods" : [{
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669447920,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 1,
						"brand" : "",
						"calories" : 3,
						"foodId" : 19691,
						"locale" : "en_US",
						"mealTypeId" : 1,
						"name" : "Tomato, Red, Ripe, Raw",
						"unit" : {
							"id" : 54,
							"name" : "cherry",
							"plural" : "cherries"
						},
						"units" : [54, 358, 304, 264, 316, 380, 311, 251, 91, 256, 279, 226, 180, 147, 389]
					},
					"nutritionalValues" : {
						"calories" : 3,
						"carbs" : 0.67,
						"fat" : 0.03,
						"fiber" : 0.2,
						"protein" : 0.15,
						"sodium" : 0.85
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669526317,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 2,
						"brand" : "IGA",
						"calories" : 140,
						"foodId" : 14566525,
						"locale" : "en_US",
						"mealTypeId" : 1,
						"name" : "Eggs, Large",
						"unit" : {
							"id" : 111,
							"name" : "egg",
							"plural" : "eggs"
						},
						"units" : [111, 226, 180, 147, 389]
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669731877,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 60,
						"brand" : "Wegmans",
						"calories" : 150,
						"foodId" : 692837342,
						"locale" : "en_US",
						"mealTypeId" : 1,
						"name" : "Organic Sourdough Bread",
						"unit" : {
							"id" : 147,
							"name" : "gram",
							"plural" : "grams"
						},
						"units" : [226, 180, 147, 389]
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669751306,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 0.5,
						"brand" : "",
						"calories" : 228,
						"foodId" : 695656757,
						"locale" : "en_US",
						"mealTypeId" : 1,
						"name" : "Cheese, cheddar - 1 cup, shredded",
						"unit" : {
							"id" : 304,
							"name" : "serving",
							"plural" : "servings"
						},
						"units" : [304, 226, 180, 147, 389]
					}
				}, {
					"isFavorite" : true,
					"logDate" : "2016-09-20",
					"logId" : 8669482182,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 1,
						"brand" : "Chiquita",
						"calories" : 110,
						"foodId" : 67430,
						"locale" : "en_US",
						"mealTypeId" : 2,
						"name" : "Banana",
						"unit" : {
							"id" : 16,
							"name" : "banana",
							"plural" : "bananas"
						},
						"units" : [304, 16]
					},
					"nutritionalValues" : {
						"calories" : 110,
						"carbs" : 29,
						"fat" : 0,
						"fiber" : 4,
						"protein" : 1,
						"sodium" : 0
					}
				}, {
					"isFavorite" : true,
					"logDate" : "2016-09-20",
					"logId" : 8669604566,
					"loggedFood" : {
						"accessLevel" : "PRIVATE",
						"amount" : 1,
						"brand" : "",
						"calories" : 30,
						"creatorEncodedId" : "22G6CV",
						"foodId" : 3648660,
						"mealTypeId" : 2,
						"name" : "International Delight Coffee Creamer Single - French Vanilla",
						"unit" : {
							"id" : 304,
							"name" : "serving",
							"plural" : "servings"
						},
						"units" : [304]
					},
					"nutritionalValues" : {
						"calories" : 30,
						"carbs" : 5,
						"fat" : 1.5,
						"fiber" : 0,
						"protein" : 0,
						"sodium" : 0
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669418705,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 1,
						"brand" : "",
						"calories" : 41,
						"foodId" : 695666887,
						"locale" : "en_US",
						"mealTypeId" : 3,
						"name" : "Squash, winter, spaghetti, cooked, boiled, drained, or baked, without salt - 1 cup",
						"unit" : {
							"id" : 91,
							"name" : "cup",
							"plural" : "cups"
						},
						"units" : [91, 256, 279, 226, 180, 147, 389]
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669418709,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 100,
						"brand" : "",
						"calories" : 32,
						"foodId" : 17392,
						"locale" : "en_US",
						"mealTypeId" : 3,
						"name" : "Tomato, Crushed",
						"unit" : {
							"id" : 147,
							"name" : "gram",
							"plural" : "grams"
						},
						"units" : [226, 180, 147, 389]
					},
					"nutritionalValues" : {
						"calories" : 32,
						"carbs" : 7.29,
						"fat" : 0.28,
						"fiber" : 1.9,
						"protein" : 1.64,
						"sodium" : 132
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669418717,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 1,
						"brand" : "Newmans own",
						"calories" : 50,
						"foodId" : 14532884,
						"locale" : "en_US",
						"mealTypeId" : 3,
						"name" : "Creamy Balsamic Dressing",
						"unit" : {
							"id" : 349,
							"name" : "tbsp",
							"plural" : "tbsp"
						},
						"units" : [349, 364, 226, 180, 147, 389]
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669707347,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 0.5,
						"brand" : "Wegmans",
						"calories" : 80,
						"foodId" : 14662558,
						"locale" : "en_US",
						"mealTypeId" : 3,
						"name" : "Sausage Style Crumbles, Meatless, Don't Be Piggy",
						"unit" : {
							"id" : 91,
							"name" : "cup",
							"plural" : "cups"
						},
						"units" : [91, 256, 279, 226, 180, 147, 389]
					}
				}, {
					"isFavorite" : true,
					"logDate" : "2016-09-20",
					"logId" : 8669712274,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 2,
						"brand" : "Wegmans",
						"calories" : 10,
						"foodId" : 14629606,
						"locale" : "en_US",
						"mealTypeId" : 3,
						"name" : "Spring Mix, Organic",
						"unit" : {
							"id" : 91,
							"name" : "cup",
							"plural" : "cups"
						},
						"units" : [91, 256, 279, 226, 180, 147, 389]
					}
				}, {
					"isFavorite" : false,
					"logDate" : "2016-09-20",
					"logId" : 8669746535,
					"loggedFood" : {
						"accessLevel" : "PUBLIC",
						"amount" : 0.75,
						"brand" : "Wegmans",
						"calories" : 130,
						"foodId" : 14662571,
						"locale" : "en_US",
						"mealTypeId" : 3,
						"name" : "Beef Style Crumbles, Meatless, Don't Have A Cow",
						"unit" : {
							"id" : 91,
							"name" : "cup",
							"plural" : "cups"
						},
						"units" : [91, 256, 279, 226, 180, 147, 389]
					}
				}
			],
			"summary" : {
				"calories" : 1004,
				"carbs" : 101.21,
				"fat" : 38.03,
				"fiber" : 19.27,
				"protein" : 64.73,
				"sodium" : 1949.7,
				"water" : 40
			}
		}
	}
]
;
callback();			
		}, function(err) {
			if (err) {
				console.error(err);
				return res.status(500).send(err);
			}
			//console.log("RESULTS: " + JSON.stringify(results));
			//console.log("USER: " + JSON.stringify(req.user));
			return res.status(200).send(generateHTML(req.user.profile._json.user, results));
		});


	});


//-------------------  R O U T E S    E N D  -------------------//


//
// Start server

app.use(errorhandler());
app.listen(appEnv.port, appEnv.bind, function() {
	//
	// print a message when the server starts listening
	console.log("server starting on " + appEnv.url);
});