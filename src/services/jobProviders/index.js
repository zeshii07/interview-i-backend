/**
 * Job provider registry.
 *
 * Each provider module exports:
 *   - id            : stable string id ("adzuna", "jooble", "reed", "usajobs")
 *   - label         : human-readable name
 *   - isConfigured  : () => boolean  — true when required env vars are set
 *   - search        : async (params) => NormalizedJob[]
 *
 * The aggregator (../jobSearchService) calls every enabled provider in
 * parallel, normalizes results to a common shape, and merges them.
 */

const adzuna = require('./adzuna');
const jooble = require('./jooble');
const reed = require('./reed');
const usajobs = require('./usajobs');

module.exports = {
  PROVIDERS: [adzuna, jooble, reed, usajobs],

  /**
   * Returns only providers whose API keys are configured.
   * If NONE are configured, returns ALL of them anyway — the aggregator
   * will surface a clear "no providers configured" error rather than
   * an empty result.
   */
  getEnabledProviders() {
    const enabled = this.PROVIDERS.filter((p) => p.isConfigured());
    return enabled.length ? enabled : this.PROVIDERS;
  },

  getProviderById(id) {
    return this.PROVIDERS.find((p) => p.id === id);
  },
};
