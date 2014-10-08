'use strict';

var moduleName = 'config';

var path       = require ('path');
var zogLog     = require ('xcraft-core-log') (moduleName);
var etcPath    = null;

module.export = function (etcRoot) {
  etcPath = path.normalize (etcRoot);
  return {
    createDefaultConfigFile : function (packageName) {
      zogLog.info ('Create config file for ' +
                   packageName +
                   ' in ' +
                   etcPath
                  );
    },
    loadConfigFileForPackage : function (packageName) {
      zogLog.info ('Load config file from ' + path.join (etcPath, packageName));
    }
  };
};
