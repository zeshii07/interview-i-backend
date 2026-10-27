const adzuna = require('./adzuna');
const jooble = require('./jooble');
const reed = require('./reed');
const usajobs = require('./usajobs');

module.exports = {
  PROVIDERS: [adzuna, jooble, reed, usajobs],
  getEnabledProviders() {
    const enabled = this.PROVIDERS.filter((p) => p.isConfigured());
    return enabled.length ? enabled : this.PROVIDERS;
  },
  getProviderById(id) {
    return this.PROVIDERS.find((p) => p.id === id);
  },
};
