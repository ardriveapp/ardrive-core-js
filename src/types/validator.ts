export type validatorFunction = (value: any) => boolean;
export interface validator {
	attributeName: string;
	validator: validatorFunction;
	valid?: boolean;
}

interface IStringParameters {
	[key: string]: any;
}

export abstract class ValidateArguments {
	private validators: validator[] = [];

	protected setValidators(validators: validator[]): void {
		validators.forEach(this.setValidator);
	}

	protected setValidator(validator: validator): void {
		const alreadySetted = this.validators.find(
			(v: validator) => v.validator === validator.validator && v.attributeName === validator.attributeName
		);
		if (!alreadySetted) {
			delete validator.valid;
			this.validators.push(validator);
		}
	}

	protected removeValidator(validator: validator): void {
		const validatorIndex = this.validators.indexOf(validator);
		this.validators.splice(validatorIndex);
	}

	public get valid(): boolean {
		let isValid = true;
		this.validators.forEach((validator) => {
			const value = (this as IStringParameters)[validator.attributeName];
			const validationResult = validator.validator(value);
			validator.valid = validationResult;
			isValid = isValid && validationResult;
		});
		return isValid;
	}

	public get invalidAttributes(): string[] {
		// check if valid here to run the getter function, which populates validator.valid attributes
		if (!this.valid) {
			const invalidValidators = this.validators.filter((v) => !v.valid);
			const invalidAttributeNames = invalidValidators.map((v) => v.attributeName);
			return invalidAttributeNames;
		}
		return [];
	}

	static newValidator(v: validatorFunction, attributeName: string): validator {
		return { attributeName, validator: v };
	}
}

export const stringValidator: validatorFunction = (v: any) => typeof v === 'string';
export function lengthValidatorFactory({ min, max }: { min?: number; max?: number } = {}): validatorFunction {
	return (v: any) => {
		let valid = true;
		if (min) {
			valid = valid && v > min;
		}
		if (max) {
			valid = valid && v <= max;
		}
		return valid;
	};
}
export function includesValidatorFactory(theArray: any[]): validatorFunction {
	return (v: any) => theArray.includes(v);
}
