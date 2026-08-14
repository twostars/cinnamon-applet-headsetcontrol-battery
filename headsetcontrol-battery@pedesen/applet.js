const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

const LABEL_PREFIX = "🎧 ";
const HEADSETCONTROL_BIN = "headsetcontrol";
const BATTERY_LOW_PERCENT = 10;

function HeadsetcontrolBattery(orientation, panel_height, instance_id) {
  this._init(orientation, panel_height, instance_id);
}

HeadsetcontrolBattery.prototype = {
  __proto__: Applet.TextApplet.prototype,

  _init: function (orientation, panel_height, instance_id) {
    Applet.TextApplet.prototype._init.call(
      this,
      orientation,
      panel_height,
      instance_id
    );

    this.set_applet_tooltip(_("Battery Status"));
    this.set_applet_label(LABEL_PREFIX + "--");
    this._update_loop();
  },

  on_applet_removed_from_panel: function () {
    if (this._updateLoopID) {
      Mainloop.source_remove(this._updateLoopID);
      this._updateLoopID = null;
    }
    if (this._cancellable) {
      this._cancellable.cancel();
    }
  },

  _run_cmd_async: function (argv, callback) {
    try {
      let proc = new Gio.Subprocess({
        argv: argv,
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      });
      proc.init(null);

      if (this._cancellable) {
        this._cancellable.cancel();
      }
      this._cancellable = new Gio.Cancellable();

      proc.communicate_utf8_async(null, this._cancellable, (proc, res) => {
        try {
          let [, stdout] = proc.communicate_utf8_finish(res);
          callback(stdout || "");
        } catch (e) {
          if (!e.matches || !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
            global.logError(e);
          }
          callback("");
        }
      });
    } catch (e) {
      global.logError(e);
      callback("");
    }
  },

  _get_status: function () {
    this._run_cmd_async(
      [HEADSETCONTROL_BIN, "-b", "-o", "json"],
      Lang.bind(this, function (output) {
        let label = "off";
        let tooltip = "Headset off or disconnected";
        let batteryLow = false;
        try {
          let data = JSON.parse(output);
          let device = data.devices && data.devices[0];
          if (!device) {
            tooltip = "No headset detected";
          } else if (device.status !== "success") {
            tooltip = `Headset error: ${device.status}`;
          } else {
            let battery = device.battery;
            switch (battery.status) {
              case "BATTERY_CHARGING":
                // The level isn't always available for all headsets; in this case it becomes -1.
                if (battery.level >= 0)  {
                  label = `Chg ${battery.level}%`;
                  batteryLow = battery.level <= BATTERY_LOW_PERCENT;
                } else {
                  label = "Chg";
                }
                tooltip = "Charging";
                break;
              case "BATTERY_AVAILABLE":
                label = `${battery.level}%`;
                tooltip = `Battery: ${battery.level}%`;
                batteryLow = battery.level <= BATTERY_LOW_PERCENT;
                break;
              case "BATTERY_UNAVAILABLE":
                label = "N/A";
                tooltip = "Battery status unavailable";
                break;
            }
          }
        } catch (e) {
          label = "Error";
          tooltip = `headsetcontrol command failed: ${String(e)}`;
        }

        this.set_applet_label(LABEL_PREFIX + label);
        this.set_applet_tooltip(_(tooltip));

        if (this._applet_label)
          this._applet_label.set_style(batteryLow ? "color: #ff0000;" : "");
      })
    );
  },

  _update_loop: function () {
    this._get_status();
    this._updateLoopID = Mainloop.timeout_add(
      5000,
      Lang.bind(this, this._update_loop)
    );
  },
};

function main(metadata, orientation, panel_height, instance_id) {
  return new HeadsetcontrolBattery(orientation, panel_height, instance_id);
}
