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
var session = require("express-session");

var fbr = request;


//
// Configure express

var app = express();
app.enable("trust proxy");
app.locals.pretty = true;
app.disable("x-powered-by");

app.use(bodyParser.urlencoded({	extended: false}));
app.use(bodyParser.json());
app.use(methodOverride("X-HTTP-Method-Override"));
app.use(favicon(__dirname + "/public/images/favicon.ico"));
app.use(express.static(__dirname + "/public"));
app.use(errorhandler());

//app.use(express.cookieParser());
//app.use(express.session({ secret: "LevTech" }));
app.use(cookieParser());
app.use(session({	secret: "a56023fa-4d16-44f3-a5e4-59f26c2ad013",	resave: false,	saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());


//
// Parse Serivce data & Bluemix Env

var appEnv = cfenv.getAppEnv();


//
// Fitbit OAuth & API

var fitbitOauth = appEnv.getServiceCreds("fitbit_oauth2");
var fitbitOauthScope = ["activity", "profile", "nutrition"];

function initFitbitRequest(accessToken) {

	var req = request.defaults({
		baseUrl: "https://api.fitbit.com/1/user/-",
		json: true,
		auth: {
			"bearer": accessToken
		},
		headers: {
			"Accept-Language": "en_US"
		}
	});
	
	return req;
}


//
// Setup SSO with Passport
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
console.log(JSON.stringify(accessToken, null, 2));
		fbr = initFitbitRequest(accessToken);
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
		var caloriesIn = results[i].food.summary.calories;
		var carbs = results[i].food.summary.carbs;
		var fat = results[i].food.summary.fat;
		var protein = results[i].food.summary.protein;
		var sodium = results[i].food.summary.sodium;
		var water = results[i].food.summary.water;
		var fiber = results[i].food.summary.fiber;

		var steps = results[i].activities.summary.steps;
		var stepGoal = results[i].activities.goals.steps;
		var activeMin = results[i].activities.summary.veryActiveMinutes;
		var thisDay = new moment(results[i].date);

		// prevent divide by zero
		caloriesIn = caloriesIn === 0 ? 1 : caloriesIn;

		html += "<tr><td>" + thisDay.format("ddd MMM Do") + "</td>" +
			"<td align=\"right\">" + caloriesIn + "</td>" +
			"<td align=\"center\">" + Math.round(carbs * 4 / caloriesIn * 100) + "% = " + carbs + "g</td>" +
			"<td align=\"center\">" + Math.round(fat * 9 / caloriesIn * 100) + "% = " + fat + "g</td>" +
			"<td align=\"center\">" + Math.round(protein * 4 / caloriesIn * 100) + "% = " + protein + "g</td>" +
			"<td align=\"right\" style=\"color:" + (steps >= stepGoal ? "green" : "red") + "\">" + steps + "</td>" +
			"<td align=\"center\">" + activeMin + "min</td>" +
			"<td align=\"center\">" + sodium + "mg</td>" +
			"<td align=\"center\">" + water + "fl oz</td>" +
			"<td align=\"center\">" + fiber + "g</td>" +
			"</tr>";
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
		session: true
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
			res.redirect("https://www.fitbit.com/logout");
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
// Default endpoint

app.route("/", nocache)
	.all( /* @callback */ function(req, res, next) {
		var today = new moment().format("YYYY-MM-DD");
		res.redirect("/" + today + "/7/");
	});


//
// Get Todays data

app.route("/auth/today", nocache)
	.all( /* @callback */ function(req, res, next) {
		
		//fbr = initFitbitRequest(req.get("fitbit"));
		fbr = initFitbitRequest(req.get("authorization").split(" ")[1]);
		
		fbr("/activities/date/today.json").then(function(activities) {
			console.log("return form today: " + JSON.stringify(activities, null, 2));
			var apiAI = {};
			apiAI.speech = "You have taken " + activities.summary.steps.toLocaleString() + " steps so far today";
			apiAI.displayText = apiAI.speech;
			return res.status(200).send(apiAI);
		});
	});


//
// Overview endpoint

app.route("/:date/:days/", nocache)
	.all( /* @callback */ function(req, res, next) {

		var results = [];
		var startDate = new moment(req.params.date);
		var numberOfDays = req.params.days;
		var dates = [];

		for (var i = 0; i < numberOfDays; i++) {
			dates.push(startDate.subtract(1, "d").format("YYYY-MM-DD"));
		}


		async.each(dates, function(date, callback) {

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

app.listen(appEnv.port, appEnv.bind, function() {
	//
	// print a message when the server starts listening
	console.log("server starting on " + appEnv.url);
});