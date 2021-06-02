import loki = require('lokijs');

export class LokiAccessor {
	static lokiDb = new loki('db.json', { autosave: true, autoload: true });
}
