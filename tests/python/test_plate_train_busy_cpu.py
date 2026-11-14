"""tests/python/test_plate_train_busy_cpu.py — re-review 2026-11-14 (optional item): the busy check flags ANY heavy process by
CPU %, not only node / python / Chrome by name (e.g. ffmpeg extracting frames, a video encoder). Locked before the change."""
import importlib.util
import os
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("plate_train_launch", os.path.join(REPO, "tools", "plate_train_launch.py"))
pl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pl)


class BusyCpuTest(unittest.TestCase):
    def test_any_heavy_process(self):
        r = pl.busy_reasons(0.5, 8, ["  700 310.0 /opt/homebrew/bin/ffmpeg -i rec.mp4 -vf fps=3 f%06d.jpg"], self_pid=999)
        self.assertEqual(len(r), 1)
        self.assertIn("ffmpeg", r[0])
        self.assertEqual(pl.busy_reasons(0.5, 8, ["  701  20.0 /opt/homebrew/bin/ffmpeg -i x"], self_pid=999), [])

    def test_os_processes_are_not_jobs(self):
        # the window server / kernel can spike; they are not another team's job
        self.assertEqual(pl.busy_reasons(0.5, 8, ["  1  80.0 kernel_task", "  2  70.0 /System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer -daemon"], self_pid=999), [])


if __name__ == "__main__":
    unittest.main()
