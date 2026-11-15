# tests/unit/secrets-pty-drive.py — drives `node tools/secrets-setup.mjs --only <NAME>` through a REAL pseudo-terminal
# (owner order 2026-11-15, review D1 of lead-notify-health). Used by tests/unit/secrets-setup-pty.test.js only.
#   python3 -I secrets-pty-drive.py <repo> <NAME> <fake-wrangler.js> <calls.jsonl> <inputs.json>
# inputs.json: a JSON list of strings; each one is written in ONE os.write when the tool shows a "then Enter: " prompt
# (so a paste arrives as one chunk, as a terminal delivers it). Prints JSON {"screen": <everything the tool wrote>}.
# The child gets a minimal environment (no CI / Cloudflare variables): it stands in for the owner's own terminal.
import json, os, pty, select, sys, time

repo, name, fake, log, inputs_path = sys.argv[1:6]
with open(inputs_path, "r", encoding="utf-8") as f:
    inputs = json.load(f)
env = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "/tmp"), "NODE_ENV": "test",
       "LQ_WRANGLER_BIN": fake, "LQ_FAKE_LOG": log, "TERM": "xterm-256color"}
node = os.environ.get("LQ_NODE", "node")
pid, fd = pty.fork()
if pid == 0:
    os.chdir(repo)
    os.execvpe(node, [node, "tools/secrets-setup.mjs", "--only", name], env)
buf = b""
seen = 0
q = list(inputs)
t0 = time.time()
while time.time() - t0 < 40:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        try:
            d = os.read(fd, 4096)
        except OSError:
            break
        if not d:
            break
        buf += d
    n = buf.count(b"then Enter: ")
    if n > seen and q and buf.rstrip().endswith(b"then Enter:"):
        seen = n
        time.sleep(0.3)
        os.write(fd, q.pop(0).encode("utf-8"))
try:
    os.kill(pid, 9)
except OSError:
    pass
try:
    os.waitpid(pid, 0)
except OSError:
    pass
sys.stdout.write(json.dumps({"screen": buf.decode("utf-8", "replace")}))
