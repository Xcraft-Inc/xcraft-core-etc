'use strict';

var moduleName = 'config';

var path       = require ('path');
var fs         = require ('fs');
var xFs        = require ('xcraft-core-fs');
var zogLog     = require ('xcraft-core-log') (moduleName);

/* FIXME: look for a better way in order to retrieve the main etc/ directory. */
var etcPath    = path.resolve (__dirname, '../../etc/');


/**
 * Create the config file for a specific module.
 * A subdirectory is created for the module.
 * @param {Object} config - The Inquirer definition.
 * @param {string} moduleName
 */
exports.createDefaultConfigFile = function (config, moduleName) {
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

exports.createAllConfigFiles = function (modulePath, filterRegex) {
  var path  = require ('path');
  var zogFs = require ('xcraft-core-fs');

  var xModulesFiles = zogFs.ls (modulePath, filterRegex);

  xModulesFiles.forEach (function (fileName) {
    var xModule = require (path.join (modulePath, fileName));

    if (xModule.hasOwnProperty ('xcraftConfig')) {
      exports.createDefaultConfigFile (xModule.xcraftConfig, fileName);
    }
  });
};

exports.loadConfigFileForPackage = function (packageName) {
  var configFile = path.join (etcPath, packageName, 'config.json');

  zogLog.verb ('Load config file from ' + configFile);

  /* FIXME: handle fallback to the internal package config entries. */
  try {
    return JSON.parse (fs.readFileSync (configFile, 'utf8'));
  } catch (err) {
    return null;
  }
};
