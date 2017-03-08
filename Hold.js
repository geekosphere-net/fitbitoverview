/*
 * Get one day at a time
 */

app.route("/test")
	.all( /* @callback */ function(req, res, next) {
	
		fbr("/user/-/activities/date/today.json")
			.then(function(steps) {

				//
				// Water
				
				fbr("/user/-/foods/log/water/date/today.json")
					.then(function(water) {

						res.status(200).send("Steps today: " + steps.summary.steps + "<br/>" + "Water today: " + water.summary.water);
						//res.status(200).send(JSON.stringify(steps));
						console.log("steps=" + JSON.stringify(steps));
						console.log("water=" + JSON.stringify(water));
					})
					.catch(function(err) {
						console.error(err);

						res.status(500).send("internal error");
					});
			})
			.catch(function(err) {
				console.error(err);

				res.status(500).send("internal error");
			});
	});


/*
 * 7 days at a time
 */
app.route("/test")
	.all( /* @callback */ function(req, res, next) {

		//
		// Steps

		fbr("/activities/steps/date/today/7d.json")
			.then(function(steps) {
				console.log("steps=" + JSON.stringify(steps));

				//
				// calories

				fbr("/activities/calories/date/today/7d.json")
					.then(function(calories) {
						console.log("calories=" + JSON.stringify(calories));

						//
						// veryActive

						fbr("/activities/minutesVeryActive/date/today/7d.json")
							.then(function(minutesVeryActive) {
								console.log("minutesVeryActive=" + JSON.stringify(minutesVeryActive));

								//
								// caloriesIn

								fbr("/foods/log/caloriesIn/date/today/7d.json")
									.then(function(caloriesIn) {
										console.log("caloriesIn=" + JSON.stringify(caloriesIn));

										//
										// Water

										fbr("/foods/log/water/date/today/7d.json")
											.then(function(water) {
												console.log("water=" + JSON.stringify(water));

												res.status(200).send("Yeah");
											});

									}).catch(function(err){res.status(500).send(err);});
							});
					});

			})
			.catch(function(err) {
				console.error(err);

				res.status(500).send("internal error");
			});

	});
	
	
	
	
/*
 * Get a day
 */




app.route("/test")
	.all( /* @callback */ function(req, res, next) {

		var results = {};
		var startDate = new moment();
		var numberOfDays = 7;
		var dates = [];

		for (var i = 0; i < numberOfDays; i++) {
			dates.push(startDate.subtract(1, "d").format("YYYY-MM-DD"));
		}


		async.each(dates, function(date, callback) {
			console.log("starting " + date);
			fbr("/activities/date/" + date + ".json").then(function(activities) {
				console.log("activities " + date);
				fbr("/activities/date/" + date + ".json").then(function(food) {
					console.log("food " + date);
					results[date] = {
						"activities": activities,
						"food": food
					};
				}).catch(function(err) {
					console.error(err);
					return callback();
				});
			}).catch(function(err) {
				console.error(err);
				return callback();
			});
			callback();
		}, function(err) {
			if (err) {
				console.error(err);
				return res.status(500).send(err);
			}
			console.log("RESULTS: " + JSON.stringify(results));
			return res.status(200).send("YEAH");
		});


	});
	
	
	
	
	
	