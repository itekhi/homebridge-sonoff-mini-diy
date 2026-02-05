var superagent = require("superagent");
var Service, Characteristic;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory(
    "homebridge-sonoff-mini-api-rest",
    "Sonoff",
    SonoffAccessory,
  );
};

function SonoffAccessory(log, config) {
  console.log("Sonoff Accessory Init");

  this.log = log;
  this.name = config["name"];
  this.id = config["id"];
  this.url = config["url"];
  this.debug = config.debug || false;

  // Track the state locally to allow for instant updates
  this.lastState = false;

  // old version config
  if (this.url === undefined) {
    this.url = config["uri"];
  }

  if (this.type === undefined) {
    this.type = "lightbulb";
  }

  switch (this.type) {
    case "fan":
      this.service = new Service.Fan(this.name);
      break;
    case "lightbulb":
      this.service = new Service.Lightbulb(this.name);
      break;
    default:
      this.service = new Service.Lightbulb(this.name);
      break;
  }

  this.service
    .getCharacteristic(Characteristic.On)
    .on("get", this.getState.bind(this))
    .on("set", this.setState.bind(this));
}

SonoffAccessory.prototype.getState = function (callback) {
  this.log("Getting current state...");

  superagent
    .post(this.url + "/zeroconf/info")
    .send({ deviceid: this.id, data: {} })
    .set("X-API-Key", "foobar")
    .set("accept", "json")
    .timeout({ response: 2000, deadline: 3000 }) // FIX: Timeout after 3 seconds
    .end((error, response) => {
      if (!error && response && response.statusCode == 200) {
        var json = response.body;
        var state = json.data.switch;

        if (this.debug)
          this.log(
            "getState() request returned successfully (" +
              response.statusCode +
              "). Body: " +
              JSON.stringify(json),
          );

        this.log("Sonoff state is %s", state);

        var on = state == "on" ? true : false;
        this.lastState = on; // Sync local cache
        callback(null, on);
      } else {
        // If network fails, log it but don't crash.
        var msg = error ? error.message : "Unknown Error";
        this.log("Function getState(). Error getting state: %s", msg);
        callback(error);
      }
    });
};

SonoffAccessory.prototype.setState = function (state, callback) {
  var SonoffState = state == true ? "on" : "off";
  this.log("Set state to %s", SonoffState);

  // FIX: Optimistic Update.
  // We tell Homebridge "Success" immediately so the UI doesn't lag.
  callback(null);

  superagent
    .post(this.url + "/zeroconf/switch")
    .send({ deviceid: this.id, data: { switch: SonoffState } })
    .set("X-API-Key", "foobar")
    .set("accept", "json")
    .timeout({ response: 2000, deadline: 3000 }) // FIX: Timeout after 3 seconds
    .end((error, response) => {
      if (!error && response && response.statusCode == 200) {
        if (this.debug)
          this.log(
            "setState() request returned successfully (" +
              response.statusCode +
              "). Body: " +
              JSON.stringify(response),
          );

        // Success! We update our local cache
        this.lastState = state;
      } else {
        var msg = error ? error.message : "Unknown Error";
        this.log("Function setState(). Error setting state: %s", msg);

        // REVERT: The network request failed, so we must tell HomeKit to flip the switch back.
        // We wait 1s to ensure the UI animation has finished before flipping it back.
        setTimeout(() => {
          this.service.getCharacteristic(Characteristic.On).updateValue(!state);
        }, 1000);
      }
    });
};

SonoffAccessory.prototype.getServices = function () {
  return [this.service];
};
