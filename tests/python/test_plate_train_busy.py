"""tests/python/test_plate_train_busy.py — owner rule 2026-11-13: plate-detector training runs on the Mac only when no other
team runs heavy jobs. tools/plate_train_launch.py refuses to start training when the machine is busy: 1-minute load above
max(2, half the cores), another e2e Chrome (lq-e2e profile) or test runner, or another heavy node / python / Chrome process
(>= 50 % CPU). Pure check, stdlib only. Locked before the code (evals-locks/gate-hall-h.sha256)."""
import importlib.util
import os
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("plate_train_launch", os.path.join(REPO, "tools", "plate_train_launch.py"))
pl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pl)


class BusyTest(unittest.TestCase):
    def test_idle(self):
        ps = ["  101   0.5 /usr/sbin/cfprefsd", "  202   3.0 /Applications/Safari.app/Contents/MacOS/Safari"]
        self.assertEqual(pl.busy_reasons(1.2, 8, ps, self_pid=999), [])

    def test_load(self):
        r = pl.busy_reasons(4.5, 8, [], self_pid=999)
        self.assertEqual(len(r), 1)
        self.assertIn("load", r[0])
        self.assertEqual(pl.busy_reasons(1.9, 2, [], self_pid=999), [])  # threshold never under 2
        self.assertEqual(len(pl.busy_reasons(2.1, 2, [], self_pid=999)), 1)

    def test_e2e_and_test_runners(self):
        for line in ["  303  12.0 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/tmp/lq-e2e-abc --headless",
                     "  304   1.0 node tests/e2e/run.mjs exam-hall", "  305   1.0 node --test tests/unit/exam.test.js"]:
            self.assertEqual(len(pl.busy_reasons(0.5, 8, [line], self_pid=999)), 1, line)

    def test_heavy_processes(self):
        r = pl.busy_reasons(0.5, 8, ["  401  85.0 /opt/homebrew/bin/node tools/exam-hall-detector-eval.mjs --run",
                                     "  402  60.0 python3 something.py", "  403  45.0 node other.mjs"], self_pid=999)
        self.assertEqual(len(r), 2)
        # our own process and its parent are ignored
        self.assertEqual(pl.busy_reasons(0.5, 8, ["  999  95.0 python tools/plate_train_launch.py"], self_pid=999), [])
        # another training run is busy
        self.assertEqual(len(pl.busy_reasons(0.5, 8, ["  500   5.0 python tools/plate_train_launch.py --yolox x"], self_pid=999)), 1)

    def test_message(self):
        m = pl.busy_message(["1-minute load 6.0 > 4.0"])
        self.assertIn("not started", m)
        self.assertIn("1-minute load", m)


if __name__ == "__main__":
    unittest.main()
