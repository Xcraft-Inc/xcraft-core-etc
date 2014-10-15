'use strict';

var moduleName = 'config';

var path       = require ('path');
var fs         = require ('fs');
var xFs        = require ('xcraft-core-fs');
var zogLog     = require ('xcraft-core-log') (moduleName);
var inquirer   = require ('inquirer');
var confCache  = {};

/* FIXME: look for a better way in order to retrieve the main etc/ directory. */
var etcPath    = path.resolve (__dirname, '../../etc/');

var runWizard = function (wizard, callbackDone) {
  inquirer.prompt (wizard, function (answers) {
    var hasChanged = false;

    zogLog.verb ('JSON output:\n' + JSON.stringify (answers, null, '  '));

    Object.keys (answers).forEach (function (item) {
      if (wizard[item] !== answers[item]) {
        wizard[item] = answers[item];
        hasChanged = true;
      }
    });

    /*TODO: Saving... new config file */

    if (callbackDone) {
      callbackDone ();
    }
  });
};

/**
 * Create the config file for a specific module.
 * A subdirectory is created for the module.
 * @param {Object} config - The Inquirer definition.
 * @param {string} moduleName
 */
exports.createDefault = function (config, moduleName) {
  var moduleEtc = path.resolve (etcPath, moduleName);
  xFs.mkdir (moduleEtc);

  zogLog.info ('Create config file in ' + moduleEtc);

  var defaultConfig = {};
  var fileName = path.join (moduleEtc, 'config.json');

  config.forEach (function (def) {
    if (def.hasOwnProperty ('default') ) {
      defaultConfig[def.name] = def.default;
    }
  });

  zogLog.verb (JSON.stringify (defaultConfig));
  fs.writeFileSync (fileName, JSON.stringify (defaultConfig, null, '  '));
};

exports.createAll = function (modulePath, filterRegex) {
  var path  = require ('path');
  var zogFs = require ('xcraft-core-fs');

  var xModulesFiles = zogFs.ls (modulePath, filterRegex);

  xModulesFiles.forEach (function (fileName) {
    var xModule = require (path.join (modulePath, fileName));

    if (xModule.hasOwnProperty ('xcraftConfig')) {
      exports.createDefault (xModule.xcraftConfig, fileName);
    }
  });
};

exports.configureAll = function (modulePath, filterRegex) {
  var async = require ('async');
  var path  = require ('path');
  var zogFs = require ('xcraft-core-fs');
  var wizards = [];

  var xModulesFiles = zogFs.ls (modulePath, filterRegex);

  xModulesFiles.forEach (function (fileName) {
    var xModule = require (path.join (modulePath, fileName));
    if (xModule.hasOwnProperty ('xcraftConfig')) {
      wizards.push (xModule.xcraftConfig);
    }
  });

  async.eachSeries (wizards, function (wiz, callback) {
    zogLog.info ('configure Xcraft (%s)', wiz);
    runWizard (wiz, callback);
  });
};

exports.load = function (packageName) {
  var configFile = path.join (etcPath, packageName, 'config.json');

  /* FIXME: handle fallback to the internal package config entries. */
  try {
    if (confCache[packageName] === undefined) {
      zogLog.verb ('Load config file from ' + configFile);
      confCache[packageName] = JSON.parse (fs.readFileSync (configFile, 'utf8'));
      return confCache[packageName];
    } else {
      return confCache[packageName];
    }
  } catch (err) {
    return null;
  }
};
