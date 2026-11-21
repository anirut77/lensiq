// tests/unit/fixtures/no-network.cjs — preload for unit tests that start a real tool (node --require): every outgoing network
// call fails at once and is counted on stderr as "no-network: blocked <what>", so a test can never download anything, even
// when the code under test is wrong. Blocks globalThis.fetch, http(s).request/get and net/tls connect. Nothing outside the
// unit tests loads this file.
const block = what => { process.stderr.write(`no-network: blocked ${what}\n`); throw new Error(`no-network: ${what} is blocked in this test`); };
globalThis.fetch = async u => block(`fetch ${String(u && u.url || u)}`);
for (const m of ["http", "https"]) {
  const mod = require(`node:${m}`);
  mod.request = () => block(`${m}.request`);
  mod.get = () => block(`${m}.get`);
}
const net = require("node:net"), tls = require("node:tls");
net.connect = net.createConnection = () => block("net.connect");
tls.connect = () => block("tls.connect");
