'use strict';

var moduleName = 'config';

var path       = require ('path');
var fs         = require ('fs');
var xFs        = require ('xcraft-core-fs');
var zogLog     = require ('xcraft-core-log') (moduleName);
var etcPath    = null;

/**
 * Initialize the main configuration directory.
 * @param {string} configFilePath - Path on etc/ directory.
 */
module.exports = function (configFilePath) {
  etcPath = path.normalize (configFilePath);
  xFs.mkdir (etcPath);
  zogLog.info ('Initialized main config directory at ' + etcPath);

  /**
   * Create the config file for a specific module.
   * A subdirectory is created for the module.
   * @param {Object} config - The Inquirer definition.
   * @param {string} moduleName
   */
  var createConfigFile = function (config, moduleName) {
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

  return {
    createDefaultConfigFile: createConfigFile,

    createAllConfigFiles: function (modulePath, filterRegex) {
      var path  = require ('path');
      var zogFs = require ('xcraft-core-fs');

      var xModulesFiles = zogFs.ls (modulePath, filterRegex);

      xModulesFiles.forEach (function (fileName) {
        var xModule = require (path.join (modulePath, fileName));

        if (xModule.hasOwnProperty ('xcraftConfig')) {
          createConfigFile (xModule.xcraftConfig, fileName);
        }
      });
    },

    loadConfigFileForPackage: function (packageName) {
      zogLog.info ('Load config file from ' + path.join (etcPath, packageName));
    }
  };
};
