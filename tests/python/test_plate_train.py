"""tests/python/test_plate_train.py — tools/plate_train.py (local training of the Thai plate detector, stream H 2026-11-13):
licence guard (pinned Apache-2.0 YOLOX, never Ultralytics / YOLOv9), the training folder stays outside the repo, the
training files carry boxes only (no plate text), and the YOLOX-nano recipe matches the Colab notebook. Stdlib only."""
import importlib.util
import json
import os
import tempfile
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("plate_train", os.path.join(REPO, "tools", "plate_train.py"))
pt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pt)


class PlateTrainTest(unittest.TestCase):
    def test_licence_sources(self):
        self.assertEqual(pt.YOLOX_TAG, "0.3.0")
        self.assertIn("Megvii-BaseDetection/YOLOX", pt.YOLOX_GIT)
        self.assertIn("0.1.1rc0/yolox_nano.pth", pt.START_WEIGHTS)
        self.assertTrue(pt.check_sources(pt.YOLOX_GIT, pt.START_WEIGHTS))
        for bad in ("https://github.com/ultralytics/ultralytics", "https://x/yolov9-t.onnx", "https://github.com/ankandrew/open-image-models"):
            with self.assertRaises(SystemExit):
                pt.check_sources(bad)
        src = open(os.path.join(REPO, "tools", "plate_train.py"), encoding="utf-8").read()
        self.assertNotIn("import ultralytics", src)

    def test_root_outside_repo(self):
        with self.assertRaises(SystemExit):
            pt.check_root(os.path.join(REPO, "field-data", "plates-train"))
        self.assertTrue(pt.check_root(tempfile.gettempdir()))

    def test_dataset_boxes_only(self):
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "annotations"))
        good = {"images": [{"id": 0, "file_name": "a.jpg", "width": 9, "height": 9}],
                "annotations": [{"id": 0, "image_id": 0, "category_id": 1, "bbox": [1, 1, 4, 2], "area": 8, "iscrowd": 0}],
                "categories": [{"id": 1, "name": "plate"}]}
        for part in ("train", "val", "test"):
            json.dump(good, open(os.path.join(d, "annotations", part + ".json"), "w"))
        self.assertTrue(pt.check_dataset(d))
        bad = json.loads(json.dumps(good))
        bad["annotations"][0]["text"] = "1234"
        json.dump(bad, open(os.path.join(d, "annotations", "train.json"), "w"))
        with self.assertRaises(SystemExit):
            pt.check_dataset(d)

    def test_exp_recipe(self):
        e = pt.exp_text("/data/ds", 150, 416, "run1")
        self.assertIn("self.num_classes = 1", e)
        self.assertIn("self.depth = 0.33; self.width = 0.25", e)
        self.assertIn("self.input_size = (416, 416)", e)
        self.assertIn("self.flip_prob = 0.0", e)
        self.assertIn("self.max_epoch = 150", e)
        self.assertIn('"/data/ds"', e)
        compile(e, "exp.py", "exec")


if __name__ == "__main__":
    unittest.main()
