module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!*.test.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
}
