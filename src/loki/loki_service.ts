import 'lokijs';

export class LokiService {
	static lokiDb = new Loki('db.json', { autosave: true, autoload: true });
}
