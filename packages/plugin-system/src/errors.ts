export class DuplicateContributionError extends Error {
    constructor(
        readonly extensionPoint: string,
        readonly contributionId: string
    ) {
        super(`Duplicate contribution id "${contributionId}" in ${extensionPoint}.`);
        this.name = 'DuplicateContributionError';
    }
}
