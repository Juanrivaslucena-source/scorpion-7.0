/**
 * LLM Probability Overlay
 *
 * Optional refinement pass. The deterministic signals produce the candidate
 * list and a baseline probability; this asks Claude to reconsider the top N
 * candidates using the market's own resolution criteria and returns a
 * calibrated probability per market.
 *
 * Three design constraints shape this file:
 *
 * 1. It is optional and must never be able to block a run. No API key, a
 *    network failure, a malformed reply, or a safety refusal all degrade to
 *    the untouched math baseline.
 * 2. Its influence is capped. The blended estimate weights the model at most
 *    `maxWeight` (default 0.5), so a confidently wrong probability can move
 *    the estimate but never override the deterministic signals.
 * 3. No SDK. This repo enforces zero runtime dependencies (tests/dependency-
 *    check.js), so the Messages API is called over raw fetch.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY      Required to enable the overlay; absent disables it
 *   KALSHI_LLM_MODEL       Model ID (default: claude-opus-5)
 *   KALSHI_LLM_TOP_N       Candidates to refine (default: 10)
 *   KALSHI_LLM_MAX_WEIGHT  Cap on the model's blend weight (default: 0.5)
 */

const MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-opus-5';

// Weight given to the model's estimate, by its self-reported confidence. Even
// "high" is capped at half, so the deterministic baseline always carries at
// least equal weight.
const CONFIDENCE_WEIGHTS = { low: 0.15, medium: 0.3, high: 0.5 };

/**
 * Structured-output schema. Constraining the reply removes free-text parsing
 * and guarantees every field the blender needs is present.
 */
const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    estimates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          probability: { type: 'number' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' }
        },
        required: ['ticker', 'probability', 'confidence', 'rationale'],
        additionalProperties: false
      }
    }
  },
  required: ['estimates'],
  additionalProperties: false
};

const SYSTEM_PROMPT = [
  'You are a calibrated forecaster pricing binary prediction-market contracts on Kalshi.',
  '',
  'For each market you are given, output the probability that it resolves YES.',
  '',
  'Ground rules:',
  '- Your probability is your genuine belief, not a restatement of the market price.',
  '  The market price is given so you can reason about whether it looks wrong, not so',
  '  you can anchor to it. If you have no real view, say so with low confidence and',
  '  return a probability close to the market price rather than inventing a difference.',
  '- Read the resolution criteria literally. Most mispricing in prediction markets comes',
  '  from traders pricing the headline question rather than the exact settlement wording:',
  '  the precise threshold, the named source of truth, the timezone, and the cutoff date.',
  '- Weigh the base rate first. For a recurring question, what fraction of comparable past',
  '  instances resolved YES? Move away from that anchor only for a specific, stated reason.',
  '- Account for time to resolution. A market closing in days should sit closer to its',
  '  current observable state than one closing in months.',
  '- Be honest about confidence. Use "high" only when the outcome is largely determined by',
  '  facts already known, "medium" when you have a reasoned view, and "low" when the',
  '  question turns on information you do not have.',
  '- Extreme probabilities require extreme evidence. Do not output below 0.02 or above 0.98',
  '  unless the outcome is effectively settled.',
  '',
  'Return one estimate per market you were given, keyed by its exact ticker.'
].join('\n');

/**
 * Build the per-run user message describing the candidate markets
 * @param {Array} candidates - Candidates from the probability engine
 * @returns {string} User turn content
 */
function buildUserPrompt(candidates) {
  const lines = ['Price the following Kalshi markets.', ''];

  for (const candidate of candidates) {
    const market = candidate.market || {};
    const raw = market.raw || {};

    lines.push(`Ticker: ${candidate.ticker}`);
    lines.push(`Question: ${candidate.title || raw.title || '(no title provided)'}`);

    if (raw.rules_primary) {
      lines.push(`Resolution criteria: ${raw.rules_primary}`);
    }
    if (raw.yes_sub_title) {
      lines.push(`YES resolves if: ${raw.yes_sub_title}`);
    }

    lines.push(`Market-implied probability: ${(candidate.marketProbability * 100).toFixed(1)}%`);
    lines.push(`Model baseline probability: ${(candidate.fairProbability * 100).toFixed(1)}%`);

    if (market.closeTime) {
      lines.push(`Closes: ${market.closeTime}`);
    }
    if (candidate.liquidity && candidate.liquidity.hoursToClose !== null) {
      lines.push(`Hours to close: ${candidate.liquidity.hoursToClose.toFixed(1)}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Extract the structured payload from a Messages API response
 * @param {Object} response - Parsed response body
 * @returns {Object|null} Parsed estimates payload, or null when unusable
 */
function extractEstimates(response) {
  // Opus 5 returns HTTP 200 with stop_reason "refusal" when its safety
  // classifiers decline. content is empty or partial, so this must be checked
  // before touching content at all.
  if (!response || response.stop_reason === 'refusal') {
    return null;
  }

  const blocks = Array.isArray(response.content) ? response.content : [];
  const textBlock = blocks.find(block => block.type === 'text');

  if (!textBlock || typeof textBlock.text !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(textBlock.text);
    return Array.isArray(parsed.estimates) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Blend a model estimate into a baseline probability
 * @param {number} baseline - Deterministic baseline probability
 * @param {number} llmProbability - Model's probability
 * @param {string} confidence - 'low' | 'medium' | 'high'
 * @param {number} maxWeight - Hard cap on the model's weight
 * @returns {Object} { probability, weight }
 */
function blend(baseline, llmProbability, confidence, maxWeight) {
  const weight = Math.min(CONFIDENCE_WEIGHTS[confidence] ?? 0.15, maxWeight);
  return {
    probability: weight * llmProbability + (1 - weight) * baseline,
    weight
  };
}

class LlmOverlay {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] - Anthropic API key
   * @param {string} [options.model] - Model ID
   * @param {number} [options.topN] - Candidates to refine
   * @param {number} [options.maxWeight] - Cap on the model's blend weight
   * @param {Function} [options.fetchImpl] - fetch implementation; injectable for tests
   * @param {Function} [options.logger] - Log sink; defaults to console.log
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || null;
    this.model = options.model || process.env.KALSHI_LLM_MODEL || DEFAULT_MODEL;
    this.topN = options.topN ?? parseInt(process.env.KALSHI_LLM_TOP_N || '10', 10);
    this.maxWeight = options.maxWeight ?? parseFloat(process.env.KALSHI_LLM_MAX_WEIGHT || '0.5');
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.logger = options.logger || console.log;
    this.timeout = options.timeout ?? parseInt(process.env.KALSHI_LLM_TIMEOUT || '120000', 10);
  }

  /**
   * Whether the overlay has what it needs to run
   * @returns {boolean} True when an API key and a fetch implementation exist
   */
  isEnabled() {
    return Boolean(this.apiKey) && typeof this.fetchImpl === 'function';
  }

  /**
   * Build the Messages API request body
   * @param {Array} candidates - Candidates to refine
   * @returns {Object} Request body
   */
  buildRequestBody(candidates) {
    return {
      model: this.model,
      max_tokens: 16000,
      // Thinking is on by default on Opus 5 and max_tokens caps thinking plus
      // response text together, hence the generous ceiling above.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: ESTIMATE_SCHEMA }
      },
      // The calibration instructions are byte-stable across runs, so they sit
      // ahead of the cache breakpoint; the volatile market data goes after it.
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [{ role: 'user', content: buildUserPrompt(candidates) }]
      // Deliberately absent: temperature, top_p, top_k, thinking.budget_tokens.
      // All four are rejected with a 400 on Opus 5.
    };
  }

  /**
   * Call the Messages API
   * @param {Array} candidates - Candidates to refine
   * @returns {Promise<Object|null>} Parsed estimates payload, or null on any failure
   */
  async requestEstimates(candidates) {
    const response = await this.fetchImpl(MESSAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify(this.buildRequestBody(candidates)),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger(`⚠️  LLM overlay: API returned ${response.status}. ${detail.slice(0, 200)}`);
      return null;
    }

    const body = await response.json();

    if (body.stop_reason === 'refusal') {
      this.logger('⚠️  LLM overlay: request declined by safety classifiers, using math baseline');
      return null;
    }

    return extractEstimates(body);
  }

  /**
   * Refine the top candidates, returning a new array with blended probabilities
   *
   * Never throws. Every failure path returns the candidates unchanged.
   * @param {Array} candidates - Candidates from the probability engine
   * @returns {Promise<Object>} { candidates, applied, reason }
   */
  async refine(candidates) {
    if (!this.isEnabled()) {
      return {
        candidates,
        applied: false,
        reason: 'ANTHROPIC_API_KEY not set; using deterministic estimates only'
      };
    }

    const targets = candidates.slice(0, this.topN);

    if (targets.length === 0) {
      return { candidates, applied: false, reason: 'No candidates to refine' };
    }

    let payload;
    try {
      payload = await this.requestEstimates(targets);
    } catch (error) {
      this.logger(`⚠️  LLM overlay: ${error.message}. Falling back to math baseline.`);
      return { candidates, applied: false, reason: `Request failed: ${error.message}` };
    }

    if (!payload) {
      return { candidates, applied: false, reason: 'No usable estimates returned' };
    }

    const byTicker = new Map();
    for (const estimate of payload.estimates) {
      if (estimate && typeof estimate.ticker === 'string') {
        byTicker.set(estimate.ticker, estimate);
      }
    }

    let blendedCount = 0;

    const refined = candidates.map(candidate => {
      const estimate = byTicker.get(candidate.ticker);

      if (!estimate || !Number.isFinite(estimate.probability)) {
        return candidate;
      }

      const clamped = Math.min(0.99, Math.max(0.01, estimate.probability));
      const { probability, weight } = blend(
        candidate.fairProbability,
        clamped,
        estimate.confidence,
        this.maxWeight
      );

      const edge = probability - candidate.marketProbability;
      blendedCount++;

      return {
        ...candidate,
        fairProbability: probability,
        edge,
        edgeCents: Number((edge * 100).toFixed(2)),
        side: edge >= 0 ? 'yes' : 'no',
        llm: {
          probability: clamped,
          confidence: estimate.confidence,
          rationale: estimate.rationale,
          weight,
          baselineProbability: candidate.fairProbability
        }
      };
    });

    refined.sort((a, b) => Math.abs(b.edgeCents) - Math.abs(a.edgeCents));

    return {
      candidates: refined,
      applied: blendedCount > 0,
      reason: `Blended ${blendedCount} of ${targets.length} candidates`
    };
  }
}

module.exports = {
  LlmOverlay,
  blend,
  extractEstimates,
  buildUserPrompt,
  ESTIMATE_SCHEMA,
  CONFIDENCE_WEIGHTS,
  MESSAGES_ENDPOINT,
  DEFAULT_MODEL
};
