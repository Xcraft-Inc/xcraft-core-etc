'use strict';

var path = require ('path');
var fs   = require ('fs');

var xFs  = require ('xcraft-core-fs');

let etcInstance = null;

class Etc {
  constructor (root, response) {
    this.confCache  = {};
    this._response = response;

    if (!root) {
      const dirArray = __dirname.split (path.sep);
      const pos = dirArray.indexOf ('toolchain');
      const toolChainDir = path.resolve (__dirname, dirArray.slice (0, pos + 1).join (path.sep));
      this.etcPath = path.join (toolChainDir, 'etc');
    } else {
      this.etcPath = root;
    }

    if (!fs.existsSync (this.etcPath)) {
      this._response.log.err ('${root}/etc cannot be resolved! Are you in the toolchain?');
    }
  }

  /**
   * Create the config file for a specific module.
   * A subdirectory is created for the module.
   *
   * @param {Object} config - The Inquirer definition.
   * @param {string} moduleName
   */
  createDefault (config, moduleName) {
    var moduleEtc = path.resolve (this.etcPath, moduleName);
    xFs.mkdir (moduleEtc);

    this._response.log.info ('Create config file in ' + moduleEtc);

    var defaultConfig = {};
    var fileName = path.join (moduleEtc, 'config.json');

    config.forEach (function (def) {
      if (def.hasOwnProperty ('default') ) {
        defaultConfig[def.name] = def.default;
      }
    });

    this._response.log.verb (JSON.stringify (defaultConfig));
    fs.writeFileSync (fileName, JSON.stringify (defaultConfig, null, '  '));
  }

  createAll (modulePath, filterRegex) {
    var path = require ('path');
    var xFs  = require ('xcraft-core-fs');

    var xModulesFiles = xFs.ls (modulePath, filterRegex);

    xModulesFiles.forEach ((mod) => {
      var xModule = null;
      try {
        xModule = require (path.join (modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      this.createDefault (xModule, mod);
    });
  }

  configureAll (modulePath, filterRegex, wizCallback) {
    const self = this;

    var async = require ('async');
    var path  = require ('path');
    var xFs   = require ('xcraft-core-fs');
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

    async.eachSeries (Object.keys (wizards), function (wiz, callback) {
      self._response.log.info ('configure Xcraft (%s)', wiz);
      wizCallback (wizards[wiz], function (answers) {
        var hasChanged = false;

        self._response.log.verb ('JSON output:\n' + JSON.stringify (answers, null, '  '));

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
    }, function () {
      wizCallback ();
    });
  }

  load (packageName) {
    var configFile = path.join (this.etcPath, packageName, 'config.json');

    /* FIXME: handle fallback to the internal package config entries. */
    try {
      if (this.confCache[packageName] === undefined) {
        this._response.log.verb ('Load config file from ' + configFile);
        this.confCache[packageName] = JSON.parse (fs.readFileSync (configFile, 'utf8'));
        return this.confCache[packageName];
      } else {
        return this.confCache[packageName];
      }
    } catch (ex) {
      return null;
    }
  }
}

module.exports = (root, response) => {
  if (etcInstance) {
    return etcInstance;
  }

  if (!root && process.env.XCRAFT_ETC) {
    root = process.env.XCRAFT_ETC;
  }

  if (!response) {
    response = {
      log: require ('xcraft-core-log') ('etc')
    };
  }

  etcInstance = new Etc (root, response);
  return etcInstance;
};
