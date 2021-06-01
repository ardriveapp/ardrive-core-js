var loki = require('lokijs');

export class LokiService {
	static lokiDb = new loki('db.json', { autosave: true, autoload: true });
}
