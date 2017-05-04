'use strict';

var path = require ('path');
var fs = require ('fs');

var xFs = require ('xcraft-core-fs');

let etcInstance = null;

class Etc {
  constructor (root, resp) {
    this._resp = resp;
    this._confCache = {};

    if (!root) {
      const dirArray = __dirname.split (path.sep);
      const pos = dirArray.indexOf ('toolchain'); /* FIXME: remove this hack */
      const toolChainDir = path.resolve (
        __dirname,
        dirArray.slice (0, pos + 1).join (path.sep)
      );
      this.etcPath = path.join (toolChainDir, 'etc');
    } else {
      this.etcPath = root;
    }

    if (!fs.existsSync (this.etcPath)) {
      this._resp.log.err (`${this.etcPath} cannot be resolved`);
    }
  }

  /**
   * Create the config file for a specific module.
   * A subdirectory is created for the module.
   *
   * @param {Object} config - The Inquirer definition.
   * @param {string} moduleName
   * @param {Object} [override] - Overload default values.
   */
  createDefault (config, moduleName, override) {
    var moduleEtc = path.resolve (this.etcPath, moduleName);
    xFs.mkdir (moduleEtc);

    this._resp.log.info ('Create config file in ' + moduleEtc);

    var defaultConfig = {};
    var fileName = path.join (moduleEtc, 'config.json');

    config.forEach (function (def) {
      if (override && override[def.name]) {
        defaultConfig[def.name] = override[def.name];
      } else if (def.hasOwnProperty ('default')) {
        defaultConfig[def.name] = def.default;
      }
    });

    this._resp.log.verb (JSON.stringify (defaultConfig));
    fs.writeFileSync (fileName, JSON.stringify (defaultConfig, null, '  '));
  }

  createAll (modulePath, filterRegex, overriderFile) {
    var path = require ('path');
    var xFs = require ('xcraft-core-fs');
    var xModulesFiles = xFs.ls (modulePath, filterRegex);
    const overrider = overriderFile ? require (overriderFile) : {};

    xModulesFiles.forEach (mod => {
      var xModule = null;
      try {
        xModule = require (path.join (modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      this.createDefault (xModule, mod, overrider[mod]);
    });
  }

  configureAll (modulePath, filterRegex, wizCallback) {
    const self = this;

    var async = require ('async');
    var path = require ('path');
    var xFs = require ('xcraft-core-fs');
    var wizards = {};

    var xModulesFiles = xFs.ls (modulePath, filterRegex);

    xModulesFiles.forEach (function (mod) {
      var xModule = null;
      try {
        xModule = require (path.join (modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      wizards[mod] = xModule;

      /* Retrieve the current values if possible. */
      try {
        var configFile = path.join (self.etcPath, mod, 'config.json');
        var data = JSON.parse (fs.readFileSync (configFile, 'utf8'));

        wizards[mod].forEach (function (item, index) {
          wizards[mod][index].default = data[item.name];
        });
      } catch (ex) {}
    });

    async.eachSeries (
      Object.keys (wizards),
      function (wiz, callback) {
        self._resp.log.info ('configure Xcraft (%s)', wiz);
        wizCallback (wizards[wiz], function (answers) {
          var hasChanged = false;

          self._resp.log.verb (
            'JSON output:\n' + JSON.stringify (answers, null, '  ')
          );

          Object.keys (answers).forEach (function (item) {
            if (wizards[wiz][item] !== answers[item]) {
              wizards[wiz][item] = answers[item];
              hasChanged = true;
            }
          });

          if (hasChanged) {
            var configFile = path.join (self.etcPath, wiz, 'config.json');
            fs.writeFileSync (configFile, JSON.stringify (answers, null, '  '));
          }

          callback ();
        });
      },
      function () {
        wizCallback ();
      }
    );
  }

  load (packageName) {
    var configFile = path.join (this.etcPath, packageName, 'config.json');

    /* FIXME: handle fallback to the internal package config entries. */
    try {
      if (this._confCache[packageName] === undefined) {
        this._resp.log.verb ('Load config file from ' + configFile);
        this._confCache[packageName] = JSON.parse (
          fs.readFileSync (configFile, 'utf8')
        );
        return this._confCache[packageName];
      } else {
        return this._confCache[packageName];
      }
    } catch (ex) {
      return null;
    }
  }
}

module.exports = (root, resp) => {
  if (etcInstance) {
    return etcInstance;
  }

  if (!root && process.env.XCRAFT_ETC) {
    root = process.env.XCRAFT_ETC;
  }

  if (!resp) {
    resp = {
      log: require ('xcraft-core-log') ('etc'),
    };
  }

  etcInstance = new Etc (root, resp);
  return etcInstance;
};
