'use strict';

const path = require('node:path');
const fse = require('fs-extra');
const merge = require('lodash/merge');

const xFs = require('xcraft-core-fs');
const {mergeOverloads} = require('xcraft-core-utils/lib/modules.js');

let etcInstance = null;

class Etc {
  _resp;
  _confCache = {};
  _confRun = {
    pid: process.pid,
    fd: null,
  };
  _runPath;
  _etcPath;

  constructor(root, resp) {
    if (!resp) {
      const level = parseInt(process.env.XCRAFT_LOG || 2);
      resp = {
        log: {
          verb: (...args) => level === 0 && console.log(...args),
          info: (...args) => level <= 1 && console.log(...args),
          warn: (...args) => level <= 2 && console.error(...args),
          err: (...args) => level <= 3 && console.error(...args),
          dbg: (...args) => console.log(...args),
        },
      };
    }

    this._resp = resp;
    this._runPath = path.join(root, 'var/run');
    this._etcPath = path.join(root, 'etc');

    if (!fse.existsSync(this._etcPath)) {
      resp.log.err(`${this._etcPath} cannot be resolved`);
    }

    const xConfig = this.load('xcraft');
    if (!xConfig) {
      return;
    }

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

    fse.writeJSONSync(fileName, configDeep);
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
    const moduleEtc = path.resolve(this._etcPath, moduleName);
    xFs.mkdir(moduleEtc);

    this._resp.log.info('Create config file in ' + moduleEtc);

    const defaultConfig = {};

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

      /* The override is used in case of:
       *  1. value is not undefined
       *  2. value is not -0
       * The -0 number is used in order to ensure that the config uses the default
       * value provided in the module's config.js file. The -0 value is interesting
       * because it's mostly useless and it can be used with JSON. In Javascript,
       * 0 === -0 is true. In order to detect -0, the trick is to compare for
       * Infinity because 1/0 !== 1/-0
       */
      if (
        override &&
        value !== undefined &&
        !(value === 0 && 1 / 0 !== 1 / value) // Infinity !== -Infinity
      ) {
        defaultConfig[def.name] = value;
      } else if (def.hasOwnProperty('default')) {
        defaultConfig[def.name] = def.default;
      }
    });

    this._resp.log.verb(JSON.stringify(defaultConfig));
    Etc._writeConfigJSON(defaultConfig, path.join(moduleEtc, 'config.json'));
  }

  createAll(modulePath, filterRegex, overriders, appId) {
    const xModulesFiles = xFs.ls(modulePath, filterRegex);

    if (overriders && !Array.isArray(overriders)) {
      overriders = [overriders];
    }

    let overrides = {};
    if (overriders) {
      for (let overrider of overriders) {
        if (fse.existsSync(overrider)) {
          const clearModule = require('clear-module');
          clearModule.single(overrider);
          overrider = require(overrider);
          mergeOverloads(
            overrides,
            appId && overrider[appId] ? overrider[appId] : overrider.default
          );
        } else {
          mergeOverloads(overrides, overrider);
        }
      }
    }

    xModulesFiles.forEach((mod) => {
      let xModule = null;
      try {
        xModule = require(path.join(modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      this.createDefault(xModule, mod, overrides[mod]);
    });
  }

  async configureAll(modulePath, filterRegex, wizCallback) {
    const wizards = {};
    const expected = {};
    const xModulesFiles = xFs.ls(modulePath, filterRegex);

    for (const mod of xModulesFiles) {
      let xModule = null;
      try {
        xModule = require(path.join(modulePath, mod, 'config.js'));
      } catch (ex) {
        return;
      }

      wizards[mod] = xModule;

      /* Retrieve the current values if possible. */
      try {
        const configFile = path.join(this._etcPath, mod, 'config.json');
        const data = fse.readJSONSync(configFile);

        wizards[mod].forEach(function (item, index) {
          const names = item.name.split('.');
          wizards[mod][index].default = names.reduce((obj, name) => {
            obj = obj[name];
            return obj;
          }, data);
        });
      } catch (ex) {
        /* ignore all exceptions */
      }

      expected[mod] = wizards[mod].reduce((obj, {name, default: def}) => {
        obj[name] = def;
        return obj;
      }, {});
    }

    for (const wiz of Object.keys(wizards)) {
      this._resp.log.info('configure Xcraft (%s)', wiz);

      await new Promise((resolve) => {
        wizCallback(wizards[wiz], (answers) => {
          let hasChanged = false;

          this._resp.log.verb(
            'JSON output:\n' + JSON.stringify(answers, null, '  ')
          );

          Object.keys(answers).forEach(function (item) {
            const isDifferent = Array.isArray(expected[wiz][item])
              ? expected[wiz][item].join() !== answers[item].join()
              : expected[wiz][item] !== answers[item];
            if (isDifferent) {
              expected[wiz][item] = answers[item];
              hasChanged = true;
            }
          });

          if (hasChanged) {
            Etc._writeConfigJSON(
              answers,
              path.join(this._etcPath, wiz, 'config.json')
            );
          }

          resolve();
        });
      });
    }

    wizCallback();
  }

  read(packageName) {
    let configFile;

    const read = (file) => fse.readJSONSync(file);

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

    const read = (file) => fse.readJSONSync(file);

    if (pid > 0) {
      configFile = path.join(this._runPath, `xcraftd.${pid}`);
      return read(configFile)[packageName];
    }

    /* FIXME: handle fallback to the internal package config entries. */
    try {
      configFile = path.join(this._etcPath, packageName, 'config.json');

      if (!this._confCache[packageName]) {
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
    fse.ftruncateSync(this._confRun.fd, 0);
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
