'use strict';

const fs = require('node:fs');
const http = require('node:http');

const PORT = Number(process.env.OFFICE_PORT || 4174);
const TIMEOUT_MS = 150;
const MAX_STDIN_BYTES = 1024 * 1024;

function getPassThroughOutput(eventName) {
  if (eventName === 'PreToolUse') {
    return '{"decision":"allow"}';
  }
  if (
    eventName === 'SessionStart' ||
    eventName === 'PreInvocation' ||
    eventName === 'PostInvocation'
  ) {
    return '{"injectSteps":[]}';
  }
  return '{}';
}

function detectEventNameFallback(raw) {
  const match = raw.match(/"hookEventName"\s*:\s*"([^"]+)"/);
  return match ? match[1] : '';
}

let rawInput = '';
let finalized = false;

function finish(output) {
  if (finalized) return;
  finalized = true;
  try {
    fs.writeSync(1, output + '\n');
  } catch {
    // ignore stdout errors
  }
  process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (rawInput.length < MAX_STDIN_BYTES) {
    rawInput += chunk.slice(0, MAX_STDIN_BYTES - rawInput.length);
  }
});

process.stdin.on('end', () => {
  let parsed = null;
  try {
    parsed = rawInput.trim() ? JSON.parse(rawInput) : null;
  } catch {
    parsed = null;
  }

  const eventName =
    parsed && typeof parsed.hookEventName === 'string'
      ? parsed.hookEventName
      : detectEventNameFallback(rawInput);
  const output = getPassThroughOutput(eventName);

  if (!parsed || typeof parsed !== 'object') {
    finish(output);
    return;
  }

  const body = Buffer.from(JSON.stringify(parsed), 'utf8');
  const guardTimer = setTimeout(() => {
    try {
      req.destroy();
    } catch {
      // ignore
    }
    finish(output);
  }, TIMEOUT_MS + 40);

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/hook-event',
      method: 'POST',
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    },
    (res) => {
      res.resume();
      res.on('end', () => {
        clearTimeout(guardTimer);
        finish(output);
      });
    },
  );

  req.on('timeout', () => {
    req.destroy();
    clearTimeout(guardTimer);
    finish(output);
  });

  req.on('error', () => {
    clearTimeout(guardTimer);
    finish(output);
  });

  try {
    req.write(body);
    req.end();
  } catch {
    clearTimeout(guardTimer);
    finish(output);
  }
});

process.stdin.on('error', () => {
  finish('{}');
});
