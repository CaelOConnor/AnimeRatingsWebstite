// Runs before every test file, in every worker — the last line of defense
// against this test suite ever touching the dev database. If NODE_ENV isn't
// exactly 'test' here, abort the whole run rather than silently proceeding:
// a single wrong invocation of this suite has already wiped real catalog
// data, twice, by running its cleanup logic (DELETE FROM anime ...) against
// the dev database instead of the test one.
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `Refusing to run tests: NODE_ENV is "${process.env.NODE_ENV}", expected "test". ` +
    'This suite must never run against the dev database. If you\'re invoking vitest ' +
    'directly (e.g. "npx vitest run <file>"), use "npm test" instead so NODE_ENV=test is set.'
  );
}
