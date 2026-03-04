# 📘 xcraft-core-etc

## Aperçu

Le module `xcraft-core-etc` est le gestionnaire de configuration centralisé de l'écosystème Xcraft. Il gère la création, la lecture, le chargement et la sauvegarde des configurations pour les différents modules du framework. Il prend en charge plusieurs niveaux de configuration (valeurs par défaut, persistantes et runtime) et assure le nettoyage automatique des fichiers temporaires des processus terminés.

## Sommaire

- [Structure du module](#structure-du-module)
- [Fonctionnement global](#fonctionnement-global)
- [Exemples d'utilisation](#exemples-dutilisation)
- [Interactions avec d'autres modules](#interactions-avec-dautres-modules)
- [Variables d'environnement](#variables-denvironnement)
- [Détails des sources](#détails-des-sources)
- [Licence](#licence)

## Structure du module

- **Classe `Etc`** : Classe principale qui gère les opérations de configuration (lecture, écriture, cache, runtime).
- **Fonction `EtcManager`** : Factory singleton qui garantit l'unicité de l'instance `Etc` et expose `EtcManager.Etc` pour les usages avancés.

## Fonctionnement global

Le module repose sur une organisation du système de fichiers bien définie :

- `etc/[module]/config.json` — configuration persistante de chaque module
- `var/run/xcraftd.[PID]` — configuration runtime du processus courant

### Niveaux de configuration

1. **Valeurs par défaut** : définies dans les fichiers `config.js` de chaque module (format inquirer.js, seuls `name` et `default` sont exploités).
2. **Configuration persistante** : stockée dans `etc/[module]/config.json`, écrite par `createDefault` ou `createAll`.
3. **Configuration runtime** : stockée dans `var/run/xcraftd.[PID]`, prioritaire sur la configuration persistante lors du chargement.

### Cache et nettoyage

Les configurations sont mises en cache lors du premier `load()` pour optimiser les accès répétés. À l'initialisation, le constructeur scanne le dossier `var/run/` et supprime les fichiers `xcraftd.[PID]` dont le processus correspondant n'est plus actif (via la bibliothèque `is-running`). Les fichiers des processus encore vivants sont fusionnés dans `_confRun` pour être appliqués par `load()`.

À la fermeture du processus courant, le fichier runtime est automatiquement supprimé via un handler `process.on('exit', ...)` enregistré lors du premier appel à `saveRun()`.

### Valeur spéciale `-0`

Dans les objets de surcharge (`override`), la valeur `-0` est une convention permettant de forcer l'utilisation de la valeur par défaut du module en ignorant explicitement la surcharge. Elle est détectée via le test `1/0 !== 1/value` (Infinity !== -Infinity).

## Exemples d'utilisation

### Initialisation du gestionnaire

```javascript
// Via la variable d'environnement XCRAFT_ROOT
const xEtc = require('xcraft-core-etc')();

// Ou en fournissant explicitement le chemin racine
const xEtc = require('xcraft-core-etc')('/chemin/vers/racine');
```

### Créer la configuration par défaut d'un module

```javascript
const config = [
  {name: 'database.host', default: 'localhost'},
  {name: 'database.port', default: 5432},
  {name: 'database.ssl', default: false},
];

xEtc.createDefault(config, 'mon-module');
// Crée etc/mon-module/config.json avec les valeurs par défaut
```

### Charger une configuration

```javascript
const config = xEtc.load('mon-module');
console.log(config.database.host); // 'localhost'
console.log(config.database.port); // 5432
```

### Sauvegarder une configuration runtime

```javascript
xEtc.saveRun('mon-module', {
  database: {host: 'production-server', port: 5433},
  sessionId: 'abc123',
});
// Les valeurs seront fusionnées lors du prochain load('mon-module')
```

### Créer les configurations de plusieurs modules

```javascript
const overrides = {
  'module-a': {'option.enabled': true},
  'module-b': {'server.port': 8080},
};

xEtc.createAll('/path/to/modules', /^xcraft-/, overrides, 'myApp');
```

### Forcer la valeur par défaut avec `-0`

```javascript
const overrides = {
  'mon-module': {
    'option.port': -0, // Ignore la surcharge, utilise le défaut du config.js
  },
};

xEtc.createDefault(config, 'mon-module', overrides);
```

## Interactions avec d'autres modules

- **[xcraft-core-fs]** : Listage des fichiers de modules et création de répertoires.
- **[xcraft-core-utils]** : Fusion des surcharges de configuration via `mergeOverloads`.
- **is-running** : Vérification de l'état des processus pour le nettoyage des fichiers temporaires.
- **fs-extra** : Opérations avancées sur le système de fichiers (lecture/écriture JSON, troncature).
- **lodash/merge** : Fusion profonde d'objets de configuration.
- **clear-module** : Invalidation du cache Node.js pour recharger les fichiers `config.js` des modules.

## Variables d'environnement

| Variable      | Description                                   | Exemple       | Valeur par défaut |
| ------------- | --------------------------------------------- | ------------- | ----------------- |
| `XCRAFT_ROOT` | Chemin racine du projet Xcraft                | `/opt/xcraft` | —                 |
| `XCRAFT_LOG`  | Niveau de log (0=verb, 1=info, 2=warn, 3=err) | `2`           | `2`               |

## Détails des sources

### `index.js`

Ce fichier expose la classe `Etc` et la factory `EtcManager`.

#### Classe `Etc`

##### Méthodes publiques

- **`constructor(root, resp)`** — Initialise le gestionnaire avec le chemin racine et un objet de réponse pour les logs. Si `resp` est absent, un logger minimal est créé à partir du niveau `XCRAFT_LOG`. Vérifie l'existence du dossier `etc/`, nettoie les fichiers de démon obsolètes dans `var/run/` et fusionne les configurations runtime des processus encore actifs.

- **`createDefault(config, moduleName, override)`** — Crée le fichier `etc/[moduleName]/config.json` à partir d'un tableau de définitions inquirer.js. Les surcharges fournies dans `override` sont appliquées sauf si leur valeur est `-0` (convention pour forcer le défaut).

- **`createAll(modulePath, filterRegex, overriders, appId)`** — Parcourt les modules du chemin `modulePath` correspondant à `filterRegex`, charge leur `config.js` et appelle `createDefault` pour chacun. Les surcharges peuvent être un objet direct, un chemin vers un fichier JS ou un tableau de ceux-ci ; elles sont fusionnées via `mergeOverloads` et filtrées selon `appId` si fourni.

- **`configureAll(modulePath, filterRegex, wizCallback)`** — Configure interactivement tous les modules via un callback assistant (`wizCallback`). Charge les valeurs actuelles depuis les fichiers existants pour préremplir les valeurs par défaut, puis persiste les modifications si des changements sont détectés.

- **`read(packageName)`** — Lit et retourne directement le contenu de `etc/[packageName]/config.json` sans mise en cache. Retourne `null` si le fichier est absent.

- **`load(packageName, pid = 0)`** — Charge la configuration d'un module avec mise en cache. Si `pid > 0`, lit le fichier runtime `var/run/xcraftd.[pid]` et retourne la section correspondant à `packageName`. Sinon, charge depuis `etc/`, met en cache, puis fusionne les éventuelles valeurs runtime présentes dans `_confRun`. Retourne `null` si le fichier est absent.

- **`saveRun(packageName, config)`** — Sauvegarde une configuration runtime dans `var/run/xcraftd.[PID]`. Crée le fichier au premier appel et enregistre un handler `process.on('exit')` pour le supprimer à la fermeture. Chaque appel réécrit le fichier complet (troncature + réécriture) pour inclure toutes les sections runtime connues.

##### Méthode statique privée

- **`_writeConfigJSON(config, fileName)`** — Convertit un objet plat dont les clés utilisent la notation pointée (ex. `"database.host"`) en objet hiérarchique profond, puis l'écrit en JSON dans `fileName`.

#### `EtcManager`

Fonction factory qui implémente le pattern singleton : si une instance existe déjà, elle est retournée directement. Sinon, elle utilise `root` ou `XCRAFT_ROOT` comme chemin racine, crée une nouvelle instance `Etc` et la mémorise. Retourne `null` si aucun chemin racine n'est disponible.

`EtcManager.Etc` expose la classe `Etc` pour les cas nécessitant des instances indépendantes.

## Licence

Ce module est distribué sous [licence MIT](./LICENSE).

---

_Ce contenu a été généré par IA_

[xcraft-core-fs]: https://github.com/Xcraft-Inc/xcraft-core-fs
[xcraft-core-utils]: https://github.com/Xcraft-Inc/xcraft-core-utils
