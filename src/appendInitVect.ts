import { Transform } from 'stream';

export default class AppendInitVect extends Transform {
  initVect: string | Buffer;

  appended: boolean;

  constructor(
    initVect: Buffer | string,
    opts: import('stream').TransformOptions | undefined = undefined
  ) {
    super(opts);
    this.initVect = initVect;
    this.appended = false;
  }

  // eslint-disable-next-line no-underscore-dangle
  _transform(chunk: any, _encoding: any, cb: () => void) {
    if (!this.appended) {
      this.push(this.initVect);
      this.appended = true;
    }
    this.push(chunk);
    cb();
  }
}
