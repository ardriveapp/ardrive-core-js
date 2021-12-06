describe('resolveLocalFilePath function', () => {
	it('returns the provided path if the file exists');
	it('returns the provided path if the file does not exist, but the parent directory does');
	it('returns the provided path concatenated to the default name if the path is a directory');
	it('throws if the parent directory does not exist');
});
