'use strict';

var moduleName = 'config';

var path       = require ('path');
var fs         = require ('fs');
var xFs        = require ('xcraft-core-fs');
var zogLog     = require ('xcraft-core-log') (moduleName);
var etcPath    = null;


module.exports = function (configFilePath) {
  etcPath = path.normalize (configFilePath);
  xFs.mkdir (etcPath);
  zogLog.info ('Initialized config directory at ' + etcPath);

  return {
    createDefaultConfigFile : function (config) {
      zogLog.info ('Create config file in ' + etcPath);

      var defaultConfig = {};
      var fileName      = path.join (etcPath, 'config.json');
      config.forEach (function (def) {
        if (def.hasOwnProperty ('default') ) {
          defaultConfig[def.name] = def.default;
        }
      });

      zogLog.info (JSON.stringify (defaultConfig));
      fs.writeFileSync (fileName, JSON.stringify (defaultConfig));
    },
    loadConfigFileForPackage : function (packageName) {
      zogLog.info ('Load config file from ' + path.join (etcPath, packageName));
    }
  };
};
