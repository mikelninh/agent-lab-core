import { AgentLabError } from './index.mjs';

function fail(code, message, details = {}) {
  throw new AgentLabError(code, message, details);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function wilsonInterval(successes, trials, z = 1.96) {
  if (!Number.isFinite(trials) || trials <= 0) return { low: 0, high: 1 };
  const probability = Math.max(0, Math.min(1, Number(successes || 0) / trials));
  const denominator = 1 + (z * z) / trials;
  const centre = probability + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((probability * (1 - probability) + (z * z) / (4 * trials)) / trials);
  return {
    low: Math.max(0, (centre - margin) / denominator),
    high: Math.min(1, (centre + margin) / denominator)
  };
}

function normalizeRecord(record) {
  const outcome = Number(record?.outcome);
  if (![0, 0.5, 1].includes(outcome)) fail('INVALID_OUTCOME', 'Record outcome must be 0, 0.5, or 1', { record });
  if (!record.choices || typeof record.choices !== 'object' || Array.isArray(record.choices)) fail('INVALID_CHOICES', 'Record choices must be an object keyed by dimension', { record });
  const metrics = record.metrics && typeof record.metrics === 'object' ? record.metrics : {};
  return { outcome, choices: record.choices, metrics };
}

function choiceValues(value) {
  if (value === null || value === undefined || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter(entry => entry !== null && entry !== undefined && entry !== '').map(String))];
}

export function buildChoiceReport(records, { minSamples = 12 } = {}) {
  if (!Array.isArray(records) || records.length === 0) fail('EMPTY_REPORT', 'Choice reporting requires at least one record');
  const dimensions = {};
  for (const rawRecord of records) {
    const record = normalizeRecord(rawRecord);
    for (const [dimensionName, rawValues] of Object.entries(record.choices)) {
      const dimension = dimensions[dimensionName] ||= { opportunities: 0, entries: {} };
      dimension.opportunities++;
      for (const key of choiceValues(rawValues)) {
        const bucket = dimension.entries[key] ||= { appearances: 0, winEquivalent: 0, metrics: {} };
        bucket.appearances++;
        bucket.winEquivalent += record.outcome;
        for (const [metricName, metricValue] of Object.entries(record.metrics)) {
          if (!Number.isFinite(Number(metricValue))) continue;
          bucket.metrics[metricName] = (bucket.metrics[metricName] || 0) + Number(metricValue);
        }
      }
    }
  }

  const finalized = {};
  const flags = [];
  for (const [dimensionName, dimension] of Object.entries(dimensions)) {
    const entries = Object.entries(dimension.entries).map(([key, bucket]) => {
      const interval = wilsonInterval(bucket.winEquivalent, bucket.appearances);
      return {
        key,
        appearances: bucket.appearances,
        pickRate: round(bucket.appearances / Math.max(1, dimension.opportunities)),
        winAssociation: round(bucket.winEquivalent / bucket.appearances),
        confidence95: { low: round(interval.low), high: round(interval.high) },
        averages: Object.fromEntries(Object.entries(bucket.metrics).map(([metricName, total]) => [metricName, round(total / bucket.appearances, 2)]))
      };
    }).sort((left, right) => right.appearances - left.appearances || right.winAssociation - left.winAssociation || left.key.localeCompare(right.key));
    finalized[dimensionName] = { opportunities: dimension.opportunities, entries };
    for (const entry of entries) {
      if (entry.appearances < minSamples) continue;
      if (entry.confidence95.low > 0.58) flags.push({ severity: 'warning', type: 'high-association', dimension: dimensionName, key: entry.key });
      if (entry.confidence95.high < 0.42) flags.push({ severity: 'warning', type: 'low-association', dimension: dimensionName, key: entry.key });
    }
  }

  return {
    schema: 'agent-lab.choice-report.v1',
    evidenceLabel: 'synthetic-association',
    disclaimer: 'Choice-level rates are associations unless the input records come from a paired controlled experiment.',
    records: records.length,
    dimensions: finalized,
    flags
  };
}

function byKey(dimension) {
  return new Map((dimension?.entries || []).map(entry => [entry.key, entry]));
}

export function compareChoiceReports(base, candidate) {
  if (!base?.dimensions || !candidate?.dimensions) fail('INVALID_REPORTS', 'Both base and candidate reports are required');
  const dimensions = {};
  const dimensionNames = new Set([...Object.keys(base.dimensions), ...Object.keys(candidate.dimensions)]);
  for (const name of dimensionNames) {
    const before = byKey(base.dimensions[name]);
    const after = byKey(candidate.dimensions[name]);
    const keys = new Set([...before.keys(), ...after.keys()]);
    dimensions[name] = [...keys].map(key => {
      const left = before.get(key);
      const right = after.get(key);
      return {
        key,
        appearancesBefore: left?.appearances || 0,
        appearancesAfter: right?.appearances || 0,
        pickRateDelta: round((right?.pickRate || 0) - (left?.pickRate || 0)),
        winAssociationDelta: round((right?.winAssociation || 0) - (left?.winAssociation || 0))
      };
    }).sort((left, right) => Math.abs(right.winAssociationDelta) - Math.abs(left.winAssociationDelta) || Math.abs(right.pickRateDelta) - Math.abs(left.pickRateDelta));
  }
  return {
    schema: 'agent-lab.choice-report-comparison.v1',
    baseRecords: base.records,
    candidateRecords: candidate.records,
    dimensions
  };
}
