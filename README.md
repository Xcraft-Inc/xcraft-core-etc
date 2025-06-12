# 📘 Documentation du module xcraft-core-etc

## Aperçu

Le module `xcraft-core-etc` est un gestionnaire de configuration pour l'écosystème Xcraft. Il permet de créer, lire, charger et sauvegarder des configurations pour différents modules du framework. Ce module est essentiel pour la gestion centralisée des paramètres de configuration dans une application Xcraft.

## Sommaire

- [Structure du module](#structure-du-module)
- [Fonctionnement global](#fonctionnement-global)
- [Exemples d'utilisation](#exemples-dutilisation)
- [Interactions avec d'autres modules](#interactions-avec-dautres-modules)
- [Variables d'environnement](#variables-denvironnement)
- [Détails des sources](#détails-des-sources)

## Structure du module

- **Classe `Etc`** : Classe principale qui gère les configurations
- **Fonction `EtcManager`** : Factory pour obtenir une instance unique (singleton) de la classe `Etc`

## Fonctionnement global

Le module fonctionne selon ces principes :

1. **Initialisation** : Création d'une instance unique de gestionnaire de configuration
2. **Stockage des configurations** :
   - Les configurations sont stockées dans un dossier `etc/` à la racine du projet
   - Chaque module a son propre sous-dossier avec un fichier `config.json`
3. **Configuration runtime** :
   - Les configurations temporaires sont stockées dans `var/run/`
   - Un fichier spécial `xcraftd.[PID]` contient les configurations runtime
4. **Cache** : Les configurations sont mises en cache pour optimiser les performances

Le module gère également le nettoyage automatique des fichiers de configuration temporaires des processus qui ne sont plus en cours d'exécution, utilisant la bibliothèque `is-running` pour vérifier l'état des processus.

### Gestion des surcharges

Le système supporte plusieurs niveaux de configuration :

- **Valeurs par défaut** : Définies dans les fichiers `config.js` des modules
- **Configuration persistante** : Stockée dans `etc/[module]/config.json`
- **Configuration runtime** : Stockée temporairement dans `var/run/xcraftd.[PID]`

Les configurations runtime ont la priorité sur les configurations persistantes.

## Exemples d'utilisation

### Initialisation du gestionnaire de configuration

```javascript
const xEtc = require('xcraft-core-etc')('/chemin/vers/racine/projet');
// ou utiliser la variable d'environnement XCRAFT_ROOT
const xEtc = require('xcraft-core-etc')();
```

### Création d'une configuration par défaut pour un module

Ce fichier `config.js` (à la racine du module) contient des définitions **inquirer.js** où seules les paramètres `name` et `default` sont pris en compte.

```javascript
const config = [
  {
    name: 'database.host',
    default: 'localhost',
  },
  {
    name: 'database.port',
    default: 5432,
  },
  {
    name: 'database.ssl',
    default: false,
  },
];

xEtc.createDefault(config, 'mon-module');
```

### Chargement d'une configuration

```javascript
const config = xEtc.load('mon-module');
console.log(config.database.host); // 'localhost'
console.log(config.database.port); // 5432
```

### Sauvegarde d'une configuration runtime

```javascript
xEtc.saveRun('mon-module', {
  database: {
    host: 'production-server',
    port: 5433,
  },
  temporaryFlag: true,
  sessionId: 'abc123',
});
```

### Création de configurations pour plusieurs modules

```javascript
const overrides = {
  'module-a': {
    'option.enabled': true,
  },
  'module-b': {
    'server.port': 8080,
  },
};

xEtc.createAll('/path/to/modules', /^xcraft-/, overrides, 'myApp');
```

### Gestion des valeurs spéciales (-0)

```javascript
const overrides = {
  'mon-module': {
    'option.port': -0, // Force l'utilisation de la valeur par défaut
  },
};

xEtc.createDefault(config, 'mon-module', overrides);
// La valeur -0 sera ignorée et la valeur par défaut sera utilisée
```

## Interactions avec d'autres modules

- **[xcraft-core-fs]** : Utilisé pour les opérations sur le système de fichiers et le listage des modules
- **[xcraft-core-utils]** : Utilisé pour la fusion des configurations via `mergeOverloads`
- **is-running** : Vérifie si un processus est en cours d'exécution pour le nettoyage des fichiers temporaires
- **fs-extra** : Opérations avancées sur le système de fichiers (lecture/écriture JSON, gestion des fichiers)
- **lodash/merge** : Fusion profonde d'objets de configuration
- **clear-module** : Nettoyage du cache des modules pour recharger les configurations
- **async** : Gestion asynchrone pour la configuration de plusieurs modules

## Variables d'environnement

| Variable      | Description                                   | Exemple       | Valeur par défaut |
| ------------- | --------------------------------------------- | ------------- | ----------------- |
| `XCRAFT_ROOT` | Chemin racine du projet Xcraft                | `/opt/xcraft` | -                 |
| `XCRAFT_LOG`  | Niveau de log (0=verb, 1=info, 2=warn, 3=err) | `2`           | `2`               |

## Détails des sources

### `index.js`

Ce fichier contient la classe principale `Etc` et la fonction factory `EtcManager`. La classe `Etc` fournit les méthodes suivantes :

#### Méthodes publiques

- **`constructor(root, resp)`** — Initialise le gestionnaire avec le chemin racine et un objet de réponse pour les logs. Vérifie l'existence du dossier `etc/` et nettoie automatiquement les fichiers de démon obsolètes des processus terminés.
- **`createDefault(config, moduleName, override)`** — Crée un fichier de configuration par défaut pour un module spécifique. Prend en charge les valeurs par défaut et les surcharges. Gère la valeur spéciale `-0` qui force l'utilisation de la valeur par défaut du module.
- **`createAll(modulePath, filterRegex, overriders, appId)`** — Crée des configurations pour tous les modules correspondant à un filtre. Supporte les surcharges multiples et les configurations spécifiques par application.
- **`configureAll(modulePath, filterRegex, wizCallback)`** — Configure tous les modules avec un assistant interactif. Charge les valeurs existantes et permet leur modification via un callback.
- **`read(packageName)`** — Lit un fichier de configuration sans mise en cache. Utilisé pour des lectures ponctuelles.
- **`load(packageName, pid = 0)`** — Charge une configuration avec mise en cache. Fusionne automatiquement les configurations runtime si elles existent. Peut charger la configuration d'un processus spécifique via son PID.
- **`saveRun(packageName, config)`** — Sauvegarde une configuration runtime dans un fichier temporaire. Crée automatiquement le fichier de runtime au premier appel et configure le nettoyage à la fermeture du processus.

#### Méthodes statiques

- **`_writeConfigJSON(config, fileName)`** — Écrit un objet de configuration dans un fichier JSON, en transformant un objet plat (avec des clés séparées par des points) en objet profond hiérarchique.

### `EtcManager`

La fonction `EtcManager` est une factory qui garantit qu'une seule instance de `Etc` existe à la fois (pattern singleton). Elle prend en charge:

- La réutilisation d'une instance existante
- L'utilisation automatique de `XCRAFT_ROOT` comme chemin racine par défaut
- La création d'une nouvelle instance si nécessaire
- Retourne `null` si aucun chemin racine n'est fourni

La propriété `EtcManager.Etc` expose la classe `Etc` pour des utilisations avancées.

_Cette documentation a été mise à jour automatiquement._

[xcraft-core-fs]: https://github.com/Xcraft-Inc/xcraft-core-fs
[xcraft-core-utils]: https://github.com/Xcraft-Inc/xcraft-core-utils