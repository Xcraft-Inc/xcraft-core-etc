'use strict';

var moduleName = 'etc';

var path = require ('path');
var fs   = require ('fs');

var xFs  = require ('xcraft-core-fs');
var xLog = require ('xcraft-core-log') (moduleName);

var confCache  = {};

var etcPath    = path.resolve (__dirname, '../../etc/');
if (!fs.existsSync (etcPath)) {
  var dirArray = __dirname.split (path.sep);
  var pos = dirArray.indexOf ('toolchain');
  var toolChainDir = path.resolve (__dirname, dirArray.slice (0, pos + 1).join (path.sep));
  etcPath = path.join (toolChainDir, 'etc');
  if (!fs.existsSync (etcPath)) {
    xLog.err ('root etc cannot be resolved ! are you in the toolchain ?');
  }
}

/**
 * Create the config file for a specific module.
 * A subdirectory is created for the module.
 *
 * @param {Object} config - The Inquirer definition.
 * @param {string} moduleName
 */
exports.createDefault = function (config, moduleName) {
  var moduleEtc = path.resolve (etcPath, moduleName);
  xFs.mkdir (moduleEtc);

  xLog.info ('Create config file in ' + moduleEtc);

  var defaultConfig = {};
  var fileName = path.join (moduleEtc, 'config.json');

  config.forEach (function (def) {
    if (def.hasOwnProperty ('default') ) {
      defaultConfig[def.name] = def.default;
    }
  });

  xLog.verb (JSON.stringify (defaultConfig));
  fs.writeFileSync (fileName, JSON.stringify (defaultConfig, null, '  '));
};

exports.createAll = function (modulePath, filterRegex) {
  var path = require ('path');
  var xFs  = require ('xcraft-core-fs');

  var xModulesFiles = xFs.ls (modulePath, filterRegex);

  xModulesFiles.forEach (function (mod) {
    var xModule = null;
    try {
      xModule = require (path.join (modulePath, mod, 'config.js'));
    } catch (ex) {
      return;
    }

    exports.createDefault (xModule, mod);
  });
};

exports.configureAll = function (modulePath, filterRegex, wizCallback) {
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
      var configFile = path.join (etcPath, mod, 'config.json');
      var data = JSON.parse (fs.readFileSync (configFile, 'utf8'));

      wizards[mod].forEach (function (item, index) {
        wizards[mod][index].default = data[item.name];
      });
    } catch (ex) {}
  });

  async.eachSeries (Object.keys (wizards), function (wiz, callback) {
    xLog.info ('configure Xcraft (%s)', wiz);
    wizCallback (wizards[wiz], function (answers) {
      var hasChanged = false;

      xLog.verb ('JSON output:\n' + JSON.stringify (answers, null, '  '));

      Object.keys (answers).forEach (function (item) {
        if (wizards[wiz][item] !== answers[item]) {
          wizards[wiz][item] = answers[item];
          hasChanged = true;
        }
      });

      if (hasChanged) {
        var configFile = path.join (etcPath, wiz, 'config.json');
        fs.writeFileSync (configFile, JSON.stringify (answers, null, '  '));
      }

      callback ();
    });
  }, function () {
    wizCallback ();
  });
};

exports.load = function (packageName) {
  var configFile = path.join (etcPath, packageName, 'config.json');

  /* FIXME: handle fallback to the internal package config entries. */
  try {
    if (confCache[packageName] === undefined) {
      xLog.verb ('Load config file from ' + configFile);
      confCache[packageName] = JSON.parse (fs.readFileSync (configFile, 'utf8'));
      return confCache[packageName];
    } else {
      return confCache[packageName];
    }
  } catch (ex) {
    return null;
  }
};
