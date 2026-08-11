// factory/lib/log.mjs — small, friendly console logging with a stage prefix.

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const AGENT_COLOR = {
  orchestrator: C.bold,
  dissect: C.cyan,
  idea: C.magenta,
  generate: C.blue,
  edit: C.yellow,
  stitch: C.green,
  qc: C.cyan,
  publish: C.blue,
};

export function makeLog(agent = 'orchestrator') {
  const color = AGENT_COLOR[agent] || C.reset;
  const tag = `${color}[${agent}]${C.reset}`;
  return {
    info: (...a) => console.log(tag, ...a),
    step: (...a) => console.log(tag, C.bold + '▶' + C.reset, ...a),
    ok: (...a) => console.log(tag, C.green + '✓' + C.reset, ...a),
    warn: (...a) => console.log(tag, C.yellow + '!' + C.reset, ...a),
    err: (...a) => console.error(tag, C.red + '✗' + C.reset, ...a),
    dim: (...a) => console.log(C.dim, tag, ...a, C.reset),
  };
}

export default makeLog;
