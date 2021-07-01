import { expect } from 'chai';
import { Instantiable } from './type_conditionals';

export function instanceOfChecking<T>(theBaseClass: Instantiable<T>, entityClass: Instantiable<T>): void {
	class AnUnrelatedClass {}
	it(`${entityClass.name} is instance of ${theBaseClass.name}`, () => {
		const instance = new entityClass();
		expect(instance).to.be.instanceOf(theBaseClass);
	});
	it(`${entityClass.name} is not instance of a wrong class`, () => {
		const wrongInstance = new AnUnrelatedClass();
		expect(wrongInstance).to.not.be.instanceOf(theBaseClass);
	});
}

export function checkInstantiationDefaults<T>(entityClass = {} as Instantiable<T>, template: Partial<T> = {}): void {
	const keys = <(keyof T)[]>Object.keys(template);
	keys.forEach((parameter) => {
		const testValue = template[parameter];
		it(`Instantiate empty ${entityClass.name}`, () => {
			const instance = new entityClass();
			expect(instance[parameter]).to.not.equal(testValue);
		});
		it(`Instantiate partial ${entityClass.name}`, () => {
			// const templateObject = {} as T;
			// templateObject[parameterName] = testValue;
			const instance = new entityClass(template);
			expect(instance[parameter]).to.equal(testValue);
		});
	});
}

export function assertNumberPropertiesType<T>(entityTemplate: T, entityClass: Instantiable<T>): void {
	describe(`Check properties of ${entityClass.name}`, () => {
		const numericProperties = (Object.keys(entityTemplate) as (keyof T)[]).filter(
			(key) => typeof entityTemplate[key] === 'number'
		);
		const numberToStringMap = numericProperties.map((prop) => `${entityTemplate[prop]}`);
		const theBrokenTemplate: Partial<T> = numericProperties.reduce((accumulator, propertyName, index) => {
			return Object.assign(accumulator, { [propertyName]: numberToStringMap[index] });
		}, {});
		let entity: T;
		before(() => {
			entity = new entityClass(theBrokenTemplate);
		});
		numericProperties.forEach((propertyName) =>
			it(`Property ${propertyName} preserves its numeric type`, () => {
				// if (propertyName === 'lastModifiedDate') debugger;
				expect(typeof entity[propertyName]).to.equal('number');
			})
		);
	});
}
