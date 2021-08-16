'use strict';

var path = require('path');
const fse = require('fs-extra');
const merge = require('lodash/merge');

var xFs = require('xcraft-core-fs');

let etcInstance = null;

class Etc {
  constructor(root, resp) {
    const etcPath = path.join(root, 'etc');
    const runPath = path.join(root, 'var/run');

    if (!resp) {
      resp = {
        log: require('xcraft-core-log')('etc'),
      };
    }

    this._resp = resp;
    this._confCache = {};
    this._confRun = {
      pid: process.pid,
      fd: null,
    };
    this._runPath = runPath;
    this._etcPath = etcPath;

    if (!fse.existsSync(this._etcPath)) {
      this._resp.log.err(`${this._etcPath} cannot be resolved`);
    }

    const xConfig = this.load('xcraft');
    if (xConfig) {
      /* Clean obsolete daemon files */
      const isRunning = require('is-running');
      const runDir = path.join(xConfig.xcraftRoot, `var/run`);
      const daemons = xFs
        .ls(runDir, /^xcraftd.[0-9]+$/)
        .map((name) => path.join(runDir, name));

      daemons
        .filter(
          (file) => !isRunning(parseInt(file.replace(/.*\.([0-9]+$)/, '$1')))
        )
        .forEach((file) => {
          try {
            fse.removeSync(file);
          } catch (ex) {
            /* ignore, it's not critical */
          }
        });

      //FIXME: handle multiple running xcraft's
      daemons
        .filter((file) =>
          isRunning(parseInt(file.replace(/.*\.([0-9]+$)/, '$1')))
        )
        .forEach((file) => {
          const config = JSON.parse(fse.readFileSync(file).toString());
          delete config.pid;
          delete config.fd;
          Object.assign(this._confRun, config);
        });
    }
  }

  static _writeConfigJSON(config, fileName) {
    /* Unflat object */
    const configDeep = {};
    Object.keys(config).forEach((key) => {
      const keys = key.split('.');
      const obj = {};
      let _obj = obj;
      for (let i = 0; i < keys.length; ++i) {
        _obj = _obj[keys[i]] = i === keys.length - 1 ? config[key] : {};
      }
      merge(configDeep, obj);
    });

    fse.writeFileSync(fileName, JSON.stringify(configDeep, null, '  '));
  }

  /**
   * Create the config file for a specific module.
   * A subdirectory is created for the module.
   *
   * @param {Object} config - The Inquirer definition.
   * @param {string} moduleName
   * @param {Object} [override] - Overload default values.
   */
  createDefault(config, moduleName, override) {
    var moduleEtc = path.resolve(this._etcPath, moduleName);
    xFs.mkdir(moduleEtc);

    this._resp.log.info('Create config file in ' + moduleEtc);

    var defaultConfig = {};

    config.forEach(function (def) {
      let value;

      if (override) {
        value = override;
        const keys = def.name.split('.');
        for (let i = 0; i < keys.length; ++i) {
          if (value[keys[i]] === undefined && keys.length > 1) {
            value[keys[i]] = i < keys.length - 1 ? {} : undefined;
          }
          value = value[keys[i]];
        }
      }

      if (override && value !== undefined) {
        defaultConfig[def.name] = value;
      } else if (def.hasOwnProperty('default')) {
        defaultConfig[def.name] = def.default;
      }
    });

    this._resp.log.verb(JSON.stringify(defaultConfig));
    Etc._writeConfigJSON(defaultConfig, path.join(moduleEtc, 'config.json'));
  }

  createAll(modulePath, filterRegex, overriderFile, appId) {
    var path = require('path');
    var xFs = require('xcraft-core-fs');
    var xModulesFiles = xFs.ls(modulePath, filterRegex);

    let overrider = {};
    if (overriderFile) {
      overrider = require(overriderFile);
      overrider =
        appId && overrider[appId] ? overrider[appId] : overrider.default;
    }

    xModulesFiles.forEach((mod) => {
      var xModule = null;
      try {
        xModule = require(path.join(modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      this.createDefault(xModule, mod, overrider[mod]);
    });
  }

  configureAll(modulePath, filterRegex, wizCallback) {
    const self = this;

    var async = require('async');
    var path = require('path');
    var xFs = require('xcraft-core-fs');
    var wizards = {};

    var xModulesFiles = xFs.ls(modulePath, filterRegex);

    xModulesFiles.forEach(function (mod) {
      var xModule = null;
      try {
        xModule = require(path.join(modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      wizards[mod] = xModule;

      /* Retrieve the current values if possible. */
      try {
        var configFile = path.join(self._etcPath, mod, 'config.json');
        var data = JSON.parse(fse.readFileSync(configFile, 'utf8'));

        wizards[mod].forEach(function (item, index) {
          wizards[mod][index].default = data[item.name];
        });
      } catch (ex) {
        /* ignore all exceptions */
      }
    });

    async.eachSeries(
      Object.keys(wizards),
      function (wiz, callback) {
        self._resp.log.info('configure Xcraft (%s)', wiz);
        wizCallback(wizards[wiz], function (answers) {
          var hasChanged = false;

          self._resp.log.verb(
            'JSON output:\n' + JSON.stringify(answers, null, '  ')
          );

          Object.keys(answers).forEach(function (item) {
            if (wizards[wiz][item] !== answers[item]) {
              wizards[wiz][item] = answers[item];
              hasChanged = true;
            }
          });

          if (hasChanged) {
            Etc._writeConfigJSON(
              answers,
              path.join(self._etcPath, wiz, 'config.json')
            );
          }

          callback();
        });
      },
      function () {
        wizCallback();
      }
    );
  }

  read(packageName) {
    let configFile;

    const read = (file) => JSON.parse(fse.readFileSync(file, 'utf8'));

    /* FIXME: handle fallback to the internal package config entries. */
    try {
      configFile = path.join(this._etcPath, packageName, 'config.json');

      this._resp.log.verb('Read config file from ' + configFile);
      return read(configFile);
    } catch (ex) {
      return null;
    }
  }

  load(packageName, pid = 0) {
    let configFile;

    const read = (file) => JSON.parse(fse.readFileSync(file, 'utf8'));

    if (pid > 0) {
      configFile = path.join(this._runPath, `xcraftd.${pid}`);
      return read(configFile)[packageName];
    }

    /* FIXME: handle fallback to the internal package config entries. */
    try {
      configFile = path.join(this._etcPath, packageName, 'config.json');

      if (!this._confCache[packageName]) {
        this._resp.log.verb('Load config file from ' + configFile);
        this._confCache[packageName] = read(configFile);
      }

      const config = this._confCache[packageName];

      /* Look for runtime settings */
      if (this._confRun[packageName]) {
        Object.assign(config, this._confRun[packageName]);
      }

      return config;
    } catch (ex) {
      return null;
    }
  }

  saveRun(packageName, config) {
    if (!this._confRun.fd) {
      const run = path.join(this._runPath, `xcraftd.${this._confRun.pid}`);

      this._confRun.fd = fse.openSync(run, 'w+');

      process.on('exit', () => {
        fse.closeSync(this._confRun.fd);
        fse.removeSync(run);
      });
    }

    this._confRun[packageName] = config;
    fse.writeSync(this._confRun.fd, JSON.stringify(this._confRun, null, 2), 0);
  }
}

function EtcManager(root, resp) {
  if (etcInstance) {
    return etcInstance;
  }

  if (!root && process.env.XCRAFT_ROOT) {
    root = process.env.XCRAFT_ROOT;
  }

  if (!root) {
    return null;
  }

  etcInstance = new Etc(root, resp);
  return etcInstance;
}

EtcManager.Etc = Etc;

module.exports = EtcManager;
